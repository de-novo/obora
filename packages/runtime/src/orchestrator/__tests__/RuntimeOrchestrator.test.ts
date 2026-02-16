import { describe, expect, it, vi } from "vitest";
import { CellManager } from "../../cell/CellManager.js";
import { DefaultConsensusGate } from "../../consensus/ConsensusGate.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
import { RecoveryEngine } from "../../recovery/RecoveryEngine.js";
import { DefaultRuntimeOrchestrator } from "../RuntimeOrchestrator.js";

function createPolicyEngine(
  override?: (action: PolicyAction, context: PolicyContext) => PolicyDecision
): PolicyEngine {
  const base = new DefaultPolicyEngine();
  const emptyPolicy: PolicySet = {
    tools: [],
    gates: [],
    sandbox: { root: ".", denyOutsideRoot: false },
    resources: {},
  };
  const version = base.loadInline(emptyPolicy);

  return {
    load: async () => version,
    loadInline: () => version,
    enforce: (action, context) => override?.(action, context) ?? base.enforce(action, context),
    reload: async () => undefined,
    version: () => base.version(),
    currentVersion: () => base.currentVersion(),
    history: () => base.history(),
    snapshot: () => base.snapshot(),
  };
}

function createCellManager(executedSteps: string[], failStep?: string): CellManager {
  return new CellManager({
    createCellContext: (cellId) => ({
      cellId,
      blackboard: {
        read: () => undefined,
        write: () => {},
      },
      tools: {
        invoke: async () => ({ ok: true }),
      },
      audit: {
        record: () => {},
      },
      config: {},
    }),
    createCell: ({ id, runTask }) => ({
      id,
      status: "idle",
      execute: async (task) => {
        const stepName = String(task.metadata?.stepName ?? "");
        executedSteps.push(stepName);
        if (failStep && stepName === failStep) {
          return {
            success: false,
            output: { error: `${stepName} failed` },
            stateChanges: [],
            toolCalls: [],
            metrics: {
              startTime: new Date(),
              endTime: new Date(),
              durationMs: 0,
              toolCallCount: 0,
            },
          };
        }

        const output = runTask ? await runTask(task, {} as never) : null;
        return {
          success: true,
          output,
          stateChanges: [],
          toolCalls: [],
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0,
            toolCallCount: 0,
          },
        };
      },
      suspend: async () => {},
      resume: async () => {},
      abort: async () => {},
    }),
  });
}

describe("DefaultRuntimeOrchestrator", () => {
  it("runs 3-step workflow in DAG order", async () => {
    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed),
      policyEngine: createPolicyEngine(),
    });

    orchestrator.define(
      "runtime-core",
      `
name: runtime-core
steps:
  - name: deploy
    agent: executor
    depends_on: [review]
  - name: generate
    agent: analyst
  - name: review
    agent: verifier
    depends_on: [generate]
`
    );

    const execution = await orchestrator.run("runtime-core", { requestId: "m1-18" });

    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["generate", "review", "deploy"]);
    expect(execution.completedSteps).toEqual(["generate", "review", "deploy"]);
  });

  it("fails when policy denies a step", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "review"
          ? { type: "deny", reason: "blocked by policy", rule: "test-rule" }
          : { type: "allow" }
      ),
    });

    orchestrator.define(
      "deny-case",
      `
name: deny-case
steps:
  - name: generate
    agent: analyst
  - name: review
    agent: verifier
    depends_on: [generate]
`
    );

    const execution = await orchestrator.run("deny-case", {});

    expect(execution.status).toBe("failed");
    expect(execution.stepRecords.review.status).toBe("failed");
    expect(execution.stepRecords.review.error).toBe("blocked by policy");
  });

  it("persists waiting gate state and resumes on approve", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "fail" } }
          : { type: "allow" }
      ),
    });

    orchestrator.define(
      "gate-case",
      `
name: gate-case
steps:
  - name: build
    agent: analyst
  - name: deploy
    agent: executor
    depends_on: [build]
`
    );

    const waiting = await orchestrator.run("gate-case", {});
    expect(waiting.status).toBe("waiting");
    expect(waiting.waitingGate?.stepName).toBe("deploy");

    const resumed = await orchestrator.approve(waiting.id);
    expect(resumed.status).toBe("completed");
    expect(resumed.completedSteps).toEqual(["build", "deploy"]);
  });

  it("integrates consensus gate and fails on consensus rejection", async () => {
    const executed: string[] = [];
    const consensusGate = new DefaultConsensusGate({
      executionId: "exec-consensus",
      sessionIdFactory: () => "session-consensus",
    });

    const orchestrator = new DefaultRuntimeOrchestrator(
      {
        cellManager: createCellManager(executed),
        policyEngine: createPolicyEngine(),
        consensusGate,
      },
      {
        consensusVoteProvider: () => [
          { voterId: "opus", approved: true },
          { voterId: "codex", approved: false, issues: [{ severity: "P1", description: "blocking" }] },
        ],
      }
    );

    orchestrator.define(
      "consensus-case",
      {
        name: "consensus-case",
        steps: [
          {
            name: "review",
            agent: "verifier",
            config: {
              consensus: {
                type: "majority",
                voters: [{ id: "opus" }, { id: "codex" }],
                minRequired: 2,
              },
            },
          },
        ],
      }
    );

    const execution = await orchestrator.run("consensus-case", {});
    expect(execution.status).toBe("failed");
    expect(execution.stepRecords.review.consensus?.status).toBe("fail");
    expect(execution.stepRecords.review.error).toContain("majority not reached");
  });

  it("integrates recovery engine and recovers failed step", async () => {
    const retryExecutor = {
      executeRetry: vi.fn(async () => ({ ok: true })),
    };
    const recoveryEngine = new RecoveryEngine({
      retryExecutor,
      wait: async () => {},
    });

    const orchestrator = new DefaultRuntimeOrchestrator(
      {
        cellManager: createCellManager([], "unstable"),
        policyEngine: createPolicyEngine(),
        recoveryEngine,
      },
      {
        defaultRecoveryStrategy: {
          type: "retry",
          mode: "linear",
          maxAttempts: 2,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      }
    );

    orchestrator.define(
      "recovery-case",
      `
name: recovery-case
steps:
  - name: unstable
    agent: executor
`
    );

    const execution = await orchestrator.run("recovery-case", {});
    expect(execution.status).toBe("completed");
    expect(execution.stepRecords.unstable.recovery?.status).toBe("recovered");
    expect(retryExecutor.executeRetry).toHaveBeenCalledOnce();
  });
});

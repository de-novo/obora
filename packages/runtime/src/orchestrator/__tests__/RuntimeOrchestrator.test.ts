import { describe, expect, it, vi } from "vitest";
import { CellManager } from "../../cell/CellManager.js";
import { DefaultConsensusGate } from "../../consensus/ConsensusGate.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { RecoveryEngine } from "../../recovery/RecoveryEngine.js";
import { DefaultStateBinder } from "../../state/StateBinder.js";
import { StateManager } from "../../state/StateManager.js";
import type { StorageAdapter } from "../../storage/types.js";
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
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "auto-approve" } }
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
    expect(waiting.waitingGate?.fallback).toBe("auto-approve");

    const resumed = await orchestrator.approve(waiting.id);
    expect(resumed.status).toBe("completed");
    expect(resumed.completedSteps).toEqual(["build", "deploy"]);
  });

  it("auto-approves on gate timeout when fallback is auto-approve", async () => {
    const executed: string[] = [];
    const auditTrail = new InMemoryAuditStore();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "auto-approve" } }
          : { type: "allow" }
      ),
      auditTrail,
    });

    orchestrator.define("gate-timeout-auto-approve", {
      name: "gate-timeout-auto-approve",
      steps: [
        { name: "build", agent: "analyst" },
        { name: "deploy", agent: "executor", depends_on: ["build"] },
      ],
    });

    const waiting = await orchestrator.run("gate-timeout-auto-approve", {});
    expect(waiting.status).toBe("waiting");

    const resumed = await orchestrator.onGateTimeout(waiting.id);

    expect(resumed.status).toBe("completed");
    expect(resumed.completedSteps).toEqual(["build", "deploy"]);
    expect(executed).toEqual(["build", "deploy"]);

    const events = await auditTrail.query({ executionId: waiting.id });
    expect(events.find((event) => event.type === "gate_resolve")?.data).toMatchObject({
      stepName: "deploy",
      gateType: "human-approval",
      status: "approved",
      fallback: "auto-approve",
    });
  });

  it("fails on gate timeout when fallback is fail", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "fail" } }
          : { type: "allow" }
      ),
    });

    orchestrator.define("gate-timeout-fail", {
      name: "gate-timeout-fail",
      steps: [
        { name: "build", agent: "analyst" },
        { name: "deploy", agent: "executor", depends_on: ["build"] },
      ],
    });

    const waiting = await orchestrator.run("gate-timeout-fail", {});
    const timedOut = await orchestrator.onGateTimeout(waiting.id);

    expect(timedOut.status).toBe("failed");
    expect(timedOut.stepRecords.deploy.status).toBe("failed");
    expect(timedOut.stepRecords.deploy.error).toBe("Gate timeout: human-approval");
  });

  it("enters recovery escalation on gate timeout when fallback is escalate", async () => {
    const recoveryEngine = new RecoveryEngine();
    const recoverSpy = vi.spyOn(recoveryEngine, "handle");

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "escalate" } }
          : { type: "allow" }
      ),
      recoveryEngine,
    });

    orchestrator.define("gate-timeout-escalate", {
      name: "gate-timeout-escalate",
      steps: [
        { name: "build", agent: "analyst" },
        { name: "deploy", agent: "executor", depends_on: ["build"] },
      ],
    });

    const waiting = await orchestrator.run("gate-timeout-escalate", {});
    const timedOut = await orchestrator.onGateTimeout(waiting.id);

    expect(timedOut.status).toBe("failed");
    expect(timedOut.stepRecords.deploy.recovery?.strategy).toBe("escalate");
    expect(recoverSpy).toHaveBeenCalledOnce();
  });

  it("uses step.gate and step.gate_config even when policy allows", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(() => ({ type: "allow" })),
    });

    orchestrator.define("step-gate-case", {
      name: "step-gate-case",
      steps: [
        {
          name: "review",
          agent: "verifier",
          gate: true,
          gate_config: {
            type: "external",
            timeout: "45m",
            fallback: "escalate",
          },
        } as unknown as { name: string; agent: string },
      ],
    });

    const waiting = await orchestrator.run("step-gate-case", {});
    expect(waiting.status).toBe("waiting");
    expect(waiting.waitingGate?.stepName).toBe("review");
    expect(waiting.waitingGate?.gateType).toBe("external");
    expect(waiting.waitingGate?.timeout).toBe("45m");
    expect(waiting.waitingGate?.fallback).toBe("escalate");
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
            consensus: {
              type: "majority",
              voters: [{ id: "opus" }, { id: "codex" }],
              min: 2,
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

  it("integrates recovery engine and reads workflow.recovery before legacy config fallback", async () => {
    const retryExecutor = {
      executeRetry: vi.fn(async () => ({ ok: true })),
    };
    const recoveryEngine = new RecoveryEngine({
      retryExecutor,
      wait: async () => {},
    });

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine,
    });

    orchestrator.define("recovery-case", {
      name: "recovery-case",
      steps: [
        {
          name: "unstable",
          agent: "executor",
          config: {
            recovery: {
              type: "rollback",
              snapshotId: "legacy-should-not-be-used",
            },
          },
        },
      ],
      recovery: {
        unstable: {
          on_fail: "retry",
          max_retries: 2,
          backoff: "linear",
          backoff_base: "1s",
        },
      },
    });

    const execution = await orchestrator.run("recovery-case", {});
    expect(execution.status).toBe("completed");
    expect(execution.stepRecords.unstable.recovery?.status).toBe("recovered");
    expect(retryExecutor.executeRetry).toHaveBeenCalledOnce();
  });


  it("parses workflow.recovery custom strategy", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine: new RecoveryEngine(),
    });

    orchestrator.define("recovery-custom-case", {
      name: "recovery-custom-case",
      steps: [{ name: "unstable", agent: "executor" }],
      recovery: {
        unstable: {
          on_fail: "custom",
          custom: "./handlers/recover.ts",
        },
      },
    });

    const execution = await orchestrator.run("recovery-custom-case", {});
    expect(execution.status).toBe("failed");
    expect(execution.stepRecords.unstable.recovery?.strategy).toBe("custom");
    expect(execution.stepRecords.unstable.recovery?.error?.message).toContain("unsupported recovery strategy");
  });

  it("runs state binding after step completion and records end-to-end audit events", async () => {
    const state = new StateManager();
    const auditTrail = new InMemoryAuditStore();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      stateBinder: new DefaultStateBinder(state),
      auditTrail,
    });

    orchestrator.define("binding-audit-case", {
      name: "binding-audit-case",
      steps: [
        {
          name: "generate",
          agent: "analyst",
          bindings: [
            {
              source: "output.stepName",
              target: "knowledge.last_step",
            },
          ],
        },
      ],
    });

    const execution = await orchestrator.run("binding-audit-case", { request: "task" });

    expect(execution.status).toBe("completed");
    expect(state.read("knowledge.last_step")).toBe("generate");

    const events = await auditTrail.query({ executionId: execution.id });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "execution_start",
        "step_start",
        "policy_check",
        "cell_start",
        "cell_end",
        "step_end",
        "execution_end",
      ])
    );

    expect(events.find((event) => event.type === "step_end")?.data).toMatchObject({
      stepName: "generate",
      status: "completed",
    });
  });

  it("persists structured audit events in parallel with AuditTrail", async () => {
    const auditTrail = new InMemoryAuditStore();
    const saveAuditEvent = vi.fn(async () => undefined);
    const storageAdapter: StorageAdapter = {
      saveRun: async () => undefined,
      getRun: async () => null,
      listRuns: async () => [],
      saveStep: async () => undefined,
      getSteps: async () => [],
      saveArtifact: async (record) => record,
      getArtifacts: async () => [],
      deleteArtifact: async () => undefined,
      saveCheckpoint: async () => undefined,
      getLatestCheckpoint: async () => null,
      saveCost: async () => undefined,
      getCosts: async () => [],
      getRunCostSummary: async () => ({ totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
      saveAuditEvent,
      getAuditTimeline: async () => [],
    };

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      auditTrail,
      storageAdapter,
    });

    orchestrator.define("audit-parallel-case", {
      name: "audit-parallel-case",
      steps: [{ name: "generate", agent: "analyst" }],
    });

    const execution = await orchestrator.run("audit-parallel-case", {});
    expect(execution.status).toBe("completed");
    expect(saveAuditEvent).toHaveBeenCalled();

    const events = await auditTrail.query({ executionId: execution.id });
    expect(events.length).toBeGreaterThan(0);
  });

});

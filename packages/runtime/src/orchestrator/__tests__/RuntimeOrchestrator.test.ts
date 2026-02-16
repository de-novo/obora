import { describe, expect, it } from "vitest";
import { CellManager } from "../../cell/CellManager.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
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

function createCellManager(executedSteps: string[]): CellManager {
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

    const execution = await orchestrator.run("runtime-core", { requestId: "m1-17" });

    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["generate", "review", "deploy"]);
    expect(execution.completedSteps).toEqual(["generate", "review", "deploy"]);
    expect(Object.keys(execution.outputs)).toEqual(["generate", "review", "deploy"]);
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

  it("transitions to waiting when gate is required", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h" } }
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

    const execution = await orchestrator.run("gate-case", {});

    expect(execution.status).toBe("waiting");
    expect(execution.stepRecords.deploy.status).toBe("waiting");
    expect(execution.error).toContain("waiting at step: deploy");
  });
});

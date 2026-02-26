import { describe, expect, it, vi } from "vitest";

import { CellManager } from "../../cell/CellManager.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
import { RecoveryEngine } from "../../recovery/RecoveryEngine.js";
import { DefaultRuntimeOrchestrator } from "../../orchestrator/RuntimeOrchestrator.js";

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

function createBackEdgeCellManager(executed: string[], verifyFailCount: number): CellManager {
  let verifyAttempts = 0;
  return new CellManager({
    createCellContext: (cellId) => ({
      cellId,
      blackboard: { read: () => undefined, write: () => {} },
      tools: { invoke: async () => ({ ok: true }) },
      audit: { record: () => {} },
      config: {},
    }),
    createCell: ({ id, runTask }) => ({
      id,
      status: "idle",
      execute: async (task) => {
        const stepName = String(task.metadata?.stepName ?? "");
        executed.push(stepName);

        if (stepName === "verify") {
          verifyAttempts += 1;
          if (verifyAttempts <= verifyFailCount) {
            return {
              success: false,
              output: { error: "verification failed" },
              stateChanges: [],
              toolCalls: [],
              metrics: { startTime: new Date(), endTime: new Date(), durationMs: 0, toolCallCount: 0 },
            };
          }
        }

        const output = runTask ? await runTask(task, {} as never) : {};
        return {
          success: true,
          output,
          stateChanges: [],
          toolCalls: [],
          metrics: { startTime: new Date(), endTime: new Date(), durationMs: 0, toolCallCount: 0 },
        };
      },
      suspend: async () => {},
      resume: async () => {},
      abort: async () => {},
    }),
  });
}

describe("M1-22 back-edge loop e2e", () => {
  it("runs implement -> verify -> FAIL -> implement -> verify -> PASS", async () => {
    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createBackEdgeCellManager(executed, 1),
      policyEngine: createPolicyEngine(),
    });

    orchestrator.define("loop-happy-path", {
      name: "loop-happy-path",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 3,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const execution = await orchestrator.run("loop-happy-path", {});

    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["implement", "verify", "implement", "verify"]);
  });

  it("ends workflow after max_iterations escalation", async () => {
    const executed: string[] = [];
    const recoveryEngine = new RecoveryEngine({
      escalationNotifier: { notify: vi.fn(async () => undefined) },
    });
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createBackEdgeCellManager(executed, 10),
      policyEngine: createPolicyEngine(),
      recoveryEngine,
    });

    orchestrator.define("loop-max-iterations-escalation", {
      name: "loop-max-iterations-escalation",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 2,
            escalate_on_exhaust: "dlq",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const execution = await orchestrator.run("loop-max-iterations-escalation", {});
    expect(execution.status).toBe("failed");
    expect(execution.endedAt).toBeDefined();
    expect(execution.stepRecords.verify.recovery?.status).toBe("escalated");
    expect(execution.stepRecords.verify.recovery?.details).toMatchObject({ channel: "dlq" });
  });
});

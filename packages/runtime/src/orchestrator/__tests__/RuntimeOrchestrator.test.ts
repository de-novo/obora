import { describe, expect, it, vi } from "vitest";
import { CellManager } from "../../cell/CellManager.js";
import { DefaultConsensusGate } from "../../consensus/ConsensusGate.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { RecoveryEngine } from "../../recovery/RecoveryEngine.js";
import { DefaultStateBinder, type StateBinder } from "../../state/StateBinder.js";
import { StateManager } from "../../state/StateManager.js";
import type { StorageAdapter } from "../../storage/types.js";
import { computePolicyHash } from "../../checkpoint/policy-hash.js";
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

function createCellManager(
  executedSteps: string[],
  failStep?: string,
  options?: {
    failCounts?: Record<string, number>;
    costByStep?: Record<string, number>;
  },
): CellManager {
  const attempts = new Map<string, number>();
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
        const currentAttempts = (attempts.get(stepName) ?? 0) + 1;
        attempts.set(stepName, currentAttempts);
        const shouldFailByCount = (options?.failCounts?.[stepName] ?? 0) >= currentAttempts;
        if ((failStep && stepName === failStep) || shouldFailByCount) {
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
              costUsd: options?.costByStep?.[stepName],
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
            costUsd: options?.costByStep?.[stepName],
          },
        };
      },
      suspend: async () => {},
      resume: async () => {},
      abort: async () => {},
    }),
  });
}

function createInMemoryStorageAdapter(): StorageAdapter {
  const runs = new Map<string, import("../../storage/types.js").RunRecord>();
  const stepsByRun = new Map<string, Map<string, import("../../storage/types.js").StepRecord>>();
  const checkpointsByRun = new Map<string, import("../../storage/types.js").CheckpointRecord[]>();

  return {
    saveRun: async (record) => {
      runs.set(record.id, { ...record });
    },
    getRun: async (runId) => {
      const record = runs.get(runId);
      return record ? { ...record } : null;
    },
    listRuns: async () => [...runs.values()].map((record) => ({ ...record })),
    saveStep: async (record) => {
      const map = stepsByRun.get(record.runId) ?? new Map();
      map.set(record.stepName, { ...record });
      stepsByRun.set(record.runId, map);
    },
    getSteps: async (runId) => [...(stepsByRun.get(runId)?.values() ?? [])].map((record) => ({ ...record })),
    saveArtifact: async (record) => record,
    getArtifacts: async () => [],
    deleteArtifact: async () => undefined,
    saveCheckpoint: async (record) => {
      const checkpoints = checkpointsByRun.get(record.runId) ?? [];
      checkpoints.push({ ...record });
      checkpointsByRun.set(record.runId, checkpoints);
    },
    getLatestCheckpoint: async (runId) => {
      const checkpoints = checkpointsByRun.get(runId) ?? [];
      return checkpoints.length > 0 ? { ...checkpoints[checkpoints.length - 1]! } : null;
    },
    saveCost: async () => undefined,
    getCosts: async () => [],
    getRunCostSummary: async () => ({ totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
    saveAuditEvent: async () => undefined,
    getAuditTimeline: async () => [],
  };
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

  it("fails auto-approve timeout when the waiting context was removed", async () => {
    interface RuntimeHarness {
      waitingContexts: Map<string, unknown>;
    }

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine((action) =>
        action.name === "deploy"
          ? { type: "gate", gateType: "human-approval", config: { timeout: "1h", fallback: "auto-approve" } }
          : { type: "allow" }
      ),
    });

    orchestrator.define("gate-timeout-missing-context", {
      name: "gate-timeout-missing-context",
      steps: [
        { name: "build", agent: "analyst" },
        { name: "deploy", agent: "executor", depends_on: ["build"] },
      ],
    });

    const waiting = await orchestrator.run("gate-timeout-missing-context", {});
    const harness = orchestrator as unknown as RuntimeHarness;
    harness.waitingContexts.delete(waiting.id);

    await expect(orchestrator.onGateTimeout(waiting.id)).rejects.toThrow(
      `Execution waiting context is missing: ${waiting.id}`,
    );
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

  it("integrates recovery engine and reads workflow.recovery before step config fallback", async () => {
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
              snapshotId: "step-config-should-not-be-used",
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

  it("executes conditional back-edge and completes after verify feedback loop", async () => {
    const executed: string[] = [];
    const auditTrail = new InMemoryAuditStore();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed, undefined, { failCounts: { verify: 1 } }),
      policyEngine: createPolicyEngine(),
      auditTrail,
    });

    orchestrator.define("back-edge-happy", {
      name: "back-edge-happy",
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

    const execution = await orchestrator.run("back-edge-happy", {});
    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["implement", "verify", "implement", "verify"]);

    const events = await auditTrail.query({ executionId: execution.id });
    expect(events.some((event) => event.type === "workflow.back_edge_triggered")).toBe(true);
  });

  it("escalates when max_iterations is exhausted", async () => {
    const recoveryEngine = new RecoveryEngine({
      escalationNotifier: { notify: vi.fn(async () => undefined) },
    });
    const recoverSpy = vi.spyOn(recoveryEngine, "handle");
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 5 } }),
      policyEngine: createPolicyEngine(),
      recoveryEngine,
    });

    orchestrator.define("back-edge-exhausted", {
      name: "back-edge-exhausted",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 2,
            escalate_on_exhaust: "human",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-exhausted", {});
    expect(execution.status).toBe("failed");
    expect(recoverSpy).toHaveBeenCalled();
    expect(execution.stepRecords.verify.recovery?.strategy).toBe("escalate");
  });

  it("supports cooldown_ms between back-edge iterations", async () => {
    const wait = vi.fn(async () => undefined);
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 1 } }),
      policyEngine: createPolicyEngine(),
    }, { wait });

    orchestrator.define("back-edge-cooldown", {
      name: "back-edge-cooldown",
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
            cooldown_ms: 250,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-cooldown", {});
    expect(execution.status).toBe("completed");
    expect(wait).toHaveBeenCalledWith(250);
  });

  it("honors max_cost boundary: cost == max_cost continues, cost > max_cost escalates", async () => {
    const continueAudit = new InMemoryAuditStore();
    const continueOrchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 1 }, costByStep: { implement: 0.02, verify: 0.02 } }),
      policyEngine: createPolicyEngine(),
      auditTrail: continueAudit,
    });

    continueOrchestrator.define("back-edge-max-cost-continue", {
      name: "back-edge-max-cost-continue",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 5,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: 0.04,
            max_cost_escalation: "fail",
          },
        },
      ],
    });

    const continued = await continueOrchestrator.run("back-edge-max-cost-continue", {});
    expect(continued.status).toBe("completed");
    const continueEvents = await continueAudit.query({ executionId: continued.id });
    expect(continueEvents.some((event) => event.type === "workflow.back_edge_cost_exceeded")).toBe(false);

    const auditTrail = new InMemoryAuditStore();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 2 }, costByStep: { implement: 0.02, verify: 0.02 } }),
      policyEngine: createPolicyEngine(),
      auditTrail,
    });

    orchestrator.define("back-edge-max-cost", {
      name: "back-edge-max-cost",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 5,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: 0.03,
            max_cost_escalation: "fail",
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-max-cost", {});
    expect(execution.status).toBe("failed");
    const events = await auditTrail.query({ executionId: execution.id });
    const costExceeded = events.find((event) => event.type === "workflow.back_edge_cost_exceeded");
    expect(costExceeded).toBeDefined();
    expect(costExceeded?.data).toMatchObject({
      source_step: "verify",
      target_step: "implement",
      max_cost_usd: 0.03,
    });
  });

  it("does not escalate when loop cost is exactly max_cost", async () => {
    const auditTrail = new InMemoryAuditStore();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 1 }, costByStep: { implement: 0.02, verify: 0.02 } }),
      policyEngine: createPolicyEngine(),
      auditTrail,
    });

    orchestrator.define("back-edge-max-cost-equality", {
      name: "back-edge-max-cost-equality",
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
            max_cost: 0.04,
            max_cost_escalation: "dlq",
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-max-cost-equality", {});
    expect(execution.status).toBe("completed");

    const events = await auditTrail.query({ executionId: execution.id });
    expect(events.some((event) => event.type === "workflow.back_edge_cost_exceeded")).toBe(false);
  });

  it("clears target step output when reset_state=true", async () => {
    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed, undefined, { failCounts: { verify: 1 } }),
      policyEngine: createPolicyEngine(),
    });

    orchestrator.define("back-edge-reset-true", {
      name: "back-edge-reset-true",
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
            reset_state: true,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-reset-true", {});
    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["implement", "verify", "implement", "verify"]);

    const implementOutput = execution.outputs.implement as { previousOutputs?: Record<string, unknown> };
    expect(implementOutput.previousOutputs?.implement).toBeUndefined();
  });

  it("preserves target step output when reset_state=false", async () => {
    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed, undefined, { failCounts: { verify: 1 } }),
      policyEngine: createPolicyEngine(),
    });

    orchestrator.define("back-edge-reset-false", {
      name: "back-edge-reset-false",
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

    const execution = await orchestrator.run("back-edge-reset-false", {});
    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["implement", "verify", "implement", "verify"]);

    const implementOutput = execution.outputs.implement as { previousOutputs?: Record<string, unknown> };
    expect(implementOutput.previousOutputs?.implement).toBeDefined();
  });

  it("uses max_cost_escalation when max_cost and max_iterations are exceeded together", async () => {
    const recoveryEngine = new RecoveryEngine({
      escalationNotifier: { notify: vi.fn(async () => undefined) },
    });

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 1 }, costByStep: { implement: 0.03, verify: 0.03 } }),
      policyEngine: createPolicyEngine(),
      recoveryEngine,
    });

    orchestrator.define("back-edge-cost-wins", {
      name: "back-edge-cost-wins",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 1,
            escalate_on_exhaust: "human",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: 0.01,
            max_cost_escalation: "dlq",
          },
        },
      ],
    });

    const execution = await orchestrator.run("back-edge-cost-wins", {});
    expect(execution.status).toBe("failed");
    expect(execution.stepRecords.verify.recovery?.status).toBe("escalated");
    expect(execution.stepRecords.verify.recovery?.details).toMatchObject({ channel: "dlq" });
  });

  it("escalates to DLQ when max_iterations is exceeded", async () => {
    const recoveryEngine = new RecoveryEngine({
      escalationNotifier: { notify: vi.fn(async () => undefined) },
    });
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 4 } }),
      policyEngine: createPolicyEngine(),
      recoveryEngine,
    });

    orchestrator.define("back-edge-exhausted-dlq", {
      name: "back-edge-exhausted-dlq",
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

    const execution = await orchestrator.run("back-edge-exhausted-dlq", {});
    expect(execution.status).toBe("failed");
    expect(execution.stepRecords.verify.recovery?.status).toBe("escalated");
    expect(execution.stepRecords.verify.recovery?.details).toMatchObject({ channel: "dlq" });
  });

  it("handles nested back-edges without deadlock", async () => {
    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed, undefined, { failCounts: { B: 1, C: 1 } }),
      policyEngine: createPolicyEngine(),
    });

    orchestrator.define("nested-back-edges", {
      name: "nested-back-edges",
      steps: [
        { name: "A", agent: "a" },
        {
          name: "B",
          agent: "b",
          depends_on: ["A"],
          on_fail: {
            goto: "A",
            max_iterations: 3,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
        {
          name: "C",
          agent: "c",
          depends_on: ["B"],
          on_fail: {
            goto: "A",
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

    const execution = await orchestrator.run("nested-back-edges", {});
    expect(execution.status).toBe("completed");
    expect(executed).toEqual(["A", "B", "A", "B", "C", "A", "B", "C"]);
  });

  it("restores loop counters from checkpoint on resume", async () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const executedInitial: string[] = [];
    const attempts = new Map<string, number>();

    const crashyCellManager = new CellManager({
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
          executedInitial.push(stepName);
          const attempt = (attempts.get(stepName) ?? 0) + 1;
          attempts.set(stepName, attempt);

          if (stepName === "verify") {
            return {
              success: false,
              output: { error: "verify failed" },
              stateChanges: [],
              toolCalls: [],
              metrics: { startTime: new Date(), endTime: new Date(), durationMs: 0, toolCallCount: 0, costUsd: 0.01 },
            };
          }

          if (stepName === "implement" && attempt > 1) {
            return {
              success: false,
              output: { error: "crash during implement" },
              stateChanges: [],
              toolCalls: [],
              metrics: { startTime: new Date(), endTime: new Date(), durationMs: 0, toolCallCount: 0 },
            };
          }

          const output = runTask ? await runTask(task, {} as never) : {};
          return {
            success: true,
            output,
            stateChanges: [],
            toolCalls: [],
            metrics: { startTime: new Date(), endTime: new Date(), durationMs: 0, toolCallCount: 0, costUsd: 0.01 },
          };
        },
        suspend: async () => {},
        resume: async () => {},
        abort: async () => {},
      }),
    });

    const runId = "resume-run-1";
    const initial = new DefaultRuntimeOrchestrator({
      cellManager: crashyCellManager,
      policyEngine: createPolicyEngine(),
      storageAdapter,
    }, { createExecutionId: () => runId });

    initial.define("resume-loop-workflow", {
      name: "resume-loop-workflow",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 2,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const firstExecution = await initial.run("resume-loop-workflow", {});
    expect(firstExecution.status).toBe("failed");
    expect(executedInitial).toEqual(["implement", "verify", "implement"]);

    const resumedExecuted: string[] = [];
    const resumed = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(resumedExecuted, undefined, { failCounts: { verify: 1 }, costByStep: { verify: 0.01 } }),
      policyEngine: createPolicyEngine(),
      storageAdapter,
      auditTrail: new InMemoryAuditStore(),
    });
    resumed.define("resume-loop-workflow", {
      name: "resume-loop-workflow",
      steps: [
        { name: "implement", agent: "coder" },
        {
          name: "verify",
          agent: "verifier",
          depends_on: ["implement"],
          on_fail: {
            goto: "implement",
            max_iterations: 2,
            escalate_on_exhaust: "fail",
            cooldown_ms: 0,
            reset_state: false,
            max_cost: null,
            max_cost_escalation: null,
          },
        },
      ],
    });

    const resumedResult = await resumed.resume(runId);
    expect(resumedResult.execution.status).toBe("failed");
    expect(resumedExecuted).toEqual(["implement", "verify"]);
  });

  it("reports resume precondition failures with persisted run records", async () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      storageAdapter,
    });

    await expect(orchestrator.resume("missing-run")).rejects.toThrow("Run not found: missing-run");

    await storageAdapter.saveRun({
      id: "run-without-checkpoint",
      workflowName: "missing-workflow",
      status: "failed",
      input: {},
      startedAt: new Date(0).toISOString(),
    });
    await expect(orchestrator.resume("run-without-checkpoint")).rejects.toThrow(
      "No checkpoint found for run: run-without-checkpoint",
    );
  });

  it("rejects resume on policy drift and reports missing workflow after checkpoint load", async () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const runId = "resume-drift-run";
    const initial = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      storageAdapter,
    }, { createExecutionId: () => runId });
    initial.setPolicyConfig({ resources: { maxCostUsd: 1 } });
    initial.define("resume-drift-workflow", {
      name: "resume-drift-workflow",
      steps: [{ name: "generate", agent: "analyst" }],
    });

    await expect(initial.run("resume-drift-workflow", {})).resolves.toMatchObject({ status: "completed" });

    const drifted = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      storageAdapter,
    });
    drifted.setPolicyConfig({ resources: { maxCostUsd: 2 } });
    await expect(drifted.resume(runId, { driftPolicy: "reject" })).rejects.toThrow("Policy drift detected");

    const withoutDefinition = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
      storageAdapter,
    });
    withoutDefinition.setPolicyConfig({ resources: { maxCostUsd: 1 } });
    await expect(withoutDefinition.resume(runId)).rejects.toThrow("Workflow is not defined: resume-drift-workflow");
  });

  it("restores checkpoint snapshot state and applies restore, skip, and rerun policies", async () => {
    const storageAdapter = createInMemoryStorageAdapter();
    const bind = vi.fn(async () => undefined);
    const stateBinder: StateBinder = { bind };
    const runId = "resume-snapshot-run";
    const startedAt = new Date(0).toISOString();

    await storageAdapter.saveRun({
      id: runId,
      workflowName: "resume-snapshot-workflow",
      status: "failed",
      input: { request: "resume" },
      startedAt,
    });
    await storageAdapter.saveStep({
      id: "step-generate",
      runId,
      stepName: "generate",
      status: "completed",
      output: { cached: true },
      startedAt,
      completedAt: startedAt,
    });
    await storageAdapter.saveStep({
      id: "step-optional",
      runId,
      stepName: "optional",
      status: "skipped",
      startedAt,
    });
    await storageAdapter.saveCheckpoint({
      id: "checkpoint-snapshot",
      runId,
      stepName: "optional",
      completedSteps: ["generate"],
      stateSnapshot: {
        "knowledge.answer": "cached",
        "__obora.loop.verify": { iterationCount: 1 },
        ignoredFunction: () => "skip",
        ignoredSymbol: Symbol("skip"),
      },
      policyHash: computePolicyHash({}),
      createdAt: startedAt,
    });

    const executed: string[] = [];
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager(executed),
      policyEngine: createPolicyEngine(),
      storageAdapter,
      stateBinder,
    });
    orchestrator.define("resume-snapshot-workflow", {
      name: "resume-snapshot-workflow",
      steps: [
        { name: "generate", agent: "analyst" },
        { name: "optional", agent: "reviewer", depends_on: ["generate"] },
        { name: "rerun", agent: "executor", depends_on: ["optional"] },
      ],
    });

    const result = await orchestrator.resume(runId);

    expect(result.execution.status).toBe("completed");
    expect(result.restoredSteps).toEqual(["generate"]);
    expect(result.rerunSteps).toEqual(["rerun"]);
    expect(result.execution.stepRecords.optional.status).toBe("skipped");
    expect(result.execution.outputs.generate).toEqual({ cached: true });
    expect(result.execution.outputs["__obora.loop.verify"]).toEqual({ iterationCount: 1 });
    expect(executed).toEqual(["rerun"]);
    expect(bind).toHaveBeenCalledTimes(2);
    expect(bind.mock.calls.map((call) => call[1][0]?.target)).toEqual([
      "knowledge.answer",
      "__obora.loop.verify",
    ]);
  });

  it("emits starvation timeout warning when a parallel step is repeatedly blocked by loop back-edge", async () => {
    const auditTrail = new InMemoryAuditStore();
    const timestamps = [
      Date.UTC(2026, 1, 17, 0, 0, 0, 0),
      Date.UTC(2026, 1, 17, 0, 0, 0, 1),
      Date.UTC(2026, 1, 17, 0, 0, 0, 2),
      Date.UTC(2026, 1, 17, 0, 0, 0, 3),
      Date.UTC(2026, 1, 17, 0, 0, 0, 4),
      Date.UTC(2026, 1, 17, 0, 0, 0, 5),
    ];
    let idx = 0;
    const now = () => new Date(timestamps[Math.min(idx++, timestamps.length - 1)]!);

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 3 } }),
      policyEngine: createPolicyEngine(),
      auditTrail,
    }, {
      starvationTimeoutMs: -1,
      now,
    });

    orchestrator.define("starvation-parallel-timeout", {
      name: "starvation-parallel-timeout",
      config: { max_parallel: 2 },
      steps: [
        { name: "bootstrap", agent: "init" },
        { name: "implement", agent: "coder", depends_on: ["bootstrap"] },
        { name: "side1", agent: "s", depends_on: ["bootstrap"] },
        { name: "side2", agent: "s", depends_on: ["bootstrap"] },
        { name: "side3", agent: "s", depends_on: ["bootstrap"] },
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

    const execution = await orchestrator.run("starvation-parallel-timeout", {});
    expect(execution.status).toBe("failed");
    const events = await auditTrail.query({ executionId: execution.id });
    const starvationEvent = events.find((event) =>
      event.type === "workflow.step_starvation_warning"
      && (event.data as { action?: string }).action === "timeout");
    expect(starvationEvent).toBeDefined();
  });

  it("emits starvation continue warning while blocked parallel steps remain within the wait budget", async () => {
    const auditTrail = new InMemoryAuditStore();
    const timestamps = [
      Date.UTC(2026, 1, 17, 0, 0, 0, 0),
      Date.UTC(2026, 1, 17, 0, 0, 0, 1),
      Date.UTC(2026, 1, 17, 0, 0, 0, 2),
      Date.UTC(2026, 1, 17, 0, 0, 0, 3),
      Date.UTC(2026, 1, 17, 0, 0, 0, 4),
      Date.UTC(2026, 1, 17, 0, 0, 0, 5),
    ];
    let idx = 0;
    const now = () => new Date(timestamps[Math.min(idx++, timestamps.length - 1)]!);

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], undefined, { failCounts: { verify: 1 } }),
      policyEngine: createPolicyEngine(),
      auditTrail,
    }, {
      starvationTimeoutMs: 60_000,
      now,
    });

    orchestrator.define("starvation-parallel-continue", {
      name: "starvation-parallel-continue",
      config: { max_parallel: 2 },
      steps: [
        { name: "bootstrap", agent: "init" },
        { name: "implement", agent: "coder", depends_on: ["bootstrap"] },
        { name: "side1", agent: "s", depends_on: ["bootstrap"] },
        { name: "side2", agent: "s", depends_on: ["bootstrap"] },
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

    const execution = await orchestrator.run("starvation-parallel-continue", {});
    expect(execution.status).toBe("completed");
    expect(execution.stepRecords.side1.error).toBeUndefined();
    expect(execution.stepRecords.side2.error).toBeUndefined();

    const events = await auditTrail.query({ executionId: execution.id });
    const actions = events
      .filter((event) => event.type === "workflow.step_starvation_warning")
      .map((event) => (event.data as { action?: string }).action);
    expect(actions).toContain("continue");
    expect(actions).not.toContain("timeout");
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
  it("auto-stores artifacts from tagged output and file_write calls", async () => {
    const saveArtifact = vi.fn(async (record) => record);
    const storage: StorageAdapter = {
      saveRun: async () => undefined,
      getRun: async () => null,
      listRuns: async () => [],
      saveStep: async () => undefined,
      getSteps: async () => [],
      saveArtifact,
      getArtifacts: async () => [],
      deleteArtifact: async () => undefined,
      saveCheckpoint: async () => undefined,
      getLatestCheckpoint: async () => null,
      saveCost: async () => undefined,
      getCosts: async () => [],
      getRunCostSummary: async () => ({ totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
      saveAuditEvent: async () => undefined,
      getAuditTimeline: async () => [],
    };

    const artifactStore = {
      save: vi.fn(async (runId: string, stepName: string, name: string, data: Buffer, mime: string) => ({
        id: `${runId}:${stepName}:${name}`,
        runId,
        stepName,
        name,
        mime,
        size: data.byteLength,
        path: `/tmp/${name}`,
        createdAt: new Date().toISOString(),
      })),
      get: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };

    const cellManager = new CellManager({
      createCellContext: () => ({
        cellId: "artifact-cell",
        blackboard: { read: () => undefined, write: () => {} },
        tools: { invoke: async () => ({ ok: true }) },
        audit: { record: () => {} },
        config: {},
      }),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async () => ({
          success: true,
          output: {
            artifacts: [{ name: "tagged.txt", mime: "text/plain", data: "hello" }],
            answer: "ok",
          },
          stateChanges: [],
          toolCalls: [
            {
              id: "tc1",
              toolName: "file_write",
              params: { path: "./out/generated.ts", content: "export const ok = true;" },
              status: "success",
              startedAt: new Date(),
              endedAt: new Date(),
              durationMs: 1,
            },
          ],
          metrics: { startTime: new Date(), endTime: new Date(), durationMs: 1, toolCallCount: 1 },
        }),
        suspend: async () => {},
        resume: async () => {},
        abort: async () => {},
      }),
    });

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager,
      policyEngine: createPolicyEngine(),
      storageAdapter: storage,
      artifactStore: artifactStore as unknown as import("../../artifacts/types.js").ArtifactStore,
    });

    orchestrator.define("artifact-auto", {
      name: "artifact-auto",
      steps: [{ name: "generate", agent: "writer" }],
    });

    const execution = await orchestrator.run("artifact-auto", {});
    expect(execution.status).toBe("completed");
    expect(artifactStore.save).toHaveBeenCalledTimes(2);
    expect(saveArtifact).toHaveBeenCalledTimes(2);
  });

  it("stores structured JSON output as fallback artifact", async () => {
    const saveArtifact = vi.fn(async (record) => record);
    const storage: StorageAdapter = {
      saveRun: async () => undefined,
      getRun: async () => null,
      listRuns: async () => [],
      saveStep: async () => undefined,
      getSteps: async () => [],
      saveArtifact,
      getArtifacts: async () => [],
      deleteArtifact: async () => undefined,
      saveCheckpoint: async () => undefined,
      getLatestCheckpoint: async () => null,
      saveCost: async () => undefined,
      getCosts: async () => [],
      getRunCostSummary: async () => ({ totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
      saveAuditEvent: async () => undefined,
      getAuditTimeline: async () => [],
    };

    const artifactStore = {
      save: vi.fn(async (runId: string, stepName: string, name: string, data: Buffer, mime: string) => ({
        id: `${runId}:${stepName}:${name}`,
        runId,
        stepName,
        name,
        mime,
        size: data.byteLength,
        path: `/tmp/${name}`,
        createdAt: new Date().toISOString(),
      })),
      get: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };

    const cellManager = new CellManager({
      createCellContext: () => ({
        cellId: "artifact-cell-2",
        blackboard: { read: () => undefined, write: () => {} },
        tools: { invoke: async () => ({ ok: true }) },
        audit: { record: () => {} },
        config: {},
      }),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async () => ({
          success: true,
          output: { answer: "ok", value: 1 },
          stateChanges: [],
          toolCalls: [],
          metrics: { startTime: new Date(), endTime: new Date(), durationMs: 1, toolCallCount: 0 },
        }),
        suspend: async () => {},
        resume: async () => {},
        abort: async () => {},
      }),
    });

    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager,
      policyEngine: createPolicyEngine(),
      storageAdapter: storage,
      artifactStore: artifactStore as unknown as import("../../artifacts/types.js").ArtifactStore,
    });

    orchestrator.define("artifact-auto-json", {
      name: "artifact-auto-json",
      steps: [{ name: "generate", agent: "writer" }],
    });

    const execution = await orchestrator.run("artifact-auto-json", {});
    expect(execution.status).toBe("completed");
    expect(artifactStore.save).toHaveBeenCalledTimes(1);
    expect(saveArtifact).toHaveBeenCalledTimes(1);
  });

  it("records an audit error when artifact capture fails without failing the run", async () => {
    const auditTrail = new InMemoryAuditStore();
    const storage: StorageAdapter = {
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
      saveAuditEvent: async () => undefined,
      getAuditTimeline: async () => [],
    };
    const artifactStore = {
      save: vi.fn(async () => {
        throw new Error("artifact backend unavailable");
      }),
      get: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };
    const cellManager = new CellManager({
      createCellContext: () => ({
        cellId: "artifact-error-cell",
        blackboard: { read: () => undefined, write: () => {} },
        tools: { invoke: async () => ({ ok: true }) },
        audit: { record: () => {} },
        config: {},
      }),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async () => ({
          success: true,
          output: { artifacts: [{ name: "report.txt", data: "payload" }] },
          stateChanges: [],
          toolCalls: [],
          metrics: { startTime: new Date(), endTime: new Date(), durationMs: 1, toolCallCount: 0 },
        }),
        suspend: async () => {},
        resume: async () => {},
        abort: async () => {},
      }),
    });
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager,
      policyEngine: createPolicyEngine(),
      storageAdapter: storage,
      artifactStore: artifactStore as unknown as import("../../artifacts/types.js").ArtifactStore,
      auditTrail,
    });
    orchestrator.define("artifact-capture-error", {
      name: "artifact-capture-error",
      steps: [{ name: "generate", agent: "writer" }],
    });

    const execution = await orchestrator.run("artifact-capture-error", {});

    expect(execution.status).toBe("completed");
    expect(artifactStore.save).toHaveBeenCalledOnce();
    const events = await auditTrail.query({ executionId: execution.id });
    expect(events.find((event) => event.type === "error")?.data).toMatchObject({
      stepName: "generate",
      message: "Artifact capture failed",
      error: "artifact backend unavailable",
    });
  });

  it("rejects missing workflows, invalid DAGs, invalid back-edges, and non-waiting gate operations", async () => {
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
    });

    await expect(orchestrator.run("missing", {})).rejects.toThrow("Workflow is not defined: missing");
    await expect(orchestrator.resume("run-without-storage")).rejects.toThrow("StorageAdapter is required for resume");
    expect(() => orchestrator.getExecution("missing-execution")).toThrow("Execution not found: missing-execution");
    await expect(orchestrator.approve("missing-execution")).rejects.toThrow("Execution not found: missing-execution");

    orchestrator.define("cycle", {
      name: "cycle",
      steps: [
        { name: "a", agent: "agent", depends_on: ["b"] },
        { name: "b", agent: "agent", depends_on: ["a"] },
      ],
    });
    await expect(orchestrator.run("cycle", {})).rejects.toThrow("Invalid workflow DAG");

    expect(() =>
      orchestrator.define("back-edge-missing", {
        name: "back-edge-missing",
        steps: [
          {
            name: "verify",
            agent: "verifier",
            on_fail: {
              goto: "missing",
              max_iterations: 1,
              escalate_on_exhaust: "fail",
              cooldown_ms: 0,
              reset_state: false,
              max_cost: null,
              max_cost_escalation: null,
            },
          },
        ],
      })
    ).toThrow("references non-existent step 'missing'");

    expect(() =>
      orchestrator.define("back-edge-self", {
        name: "back-edge-self",
        steps: [
          {
            name: "verify",
            agent: "verifier",
            on_fail: {
              goto: "verify",
              max_iterations: 1,
              escalate_on_exhaust: "fail",
              cooldown_ms: 0,
              reset_state: false,
              max_cost: null,
              max_cost_escalation: null,
            },
          },
        ],
      })
    ).toThrow("self-loop is not allowed");

    expect(() =>
      orchestrator.define("back-edge-forward", {
        name: "back-edge-forward",
        steps: [
          {
            name: "verify",
            agent: "verifier",
            on_fail: {
              goto: "implement",
              max_iterations: 1,
              escalate_on_exhaust: "fail",
              cooldown_ms: 0,
              reset_state: false,
              max_cost: null,
              max_cost_escalation: null,
            },
          },
          { name: "implement", agent: "coder", depends_on: ["verify"] },
        ],
      })
    ).toThrow("must precede source 'verify'");

    orchestrator.define("finished", {
      name: "finished",
      steps: [{ name: "done", agent: "agent" }],
    });
    const finished = await orchestrator.run("finished", {});
    expect(orchestrator.listExecutions({ status: "completed" }).map((execution) => execution.id)).toContain(finished.id);
    expect(orchestrator.listExecutions({ workflowName: "finished" })).toHaveLength(1);
    expect(orchestrator.listExecutions({ workflowName: "other" })).toHaveLength(0);
    await expect(orchestrator.reject(finished.id)).rejects.toThrow(`Execution is not waiting on gate: ${finished.id}`);
    await expect(orchestrator.onGateTimeout(finished.id)).rejects.toThrow(`Execution is not waiting on gate: ${finished.id}`);
  });

  it("covers onGate decisions and step gate config variants", async () => {
    const approvedOnGate = vi.fn(async () => "approved" as const);
    const approved = new DefaultRuntimeOrchestrator(
      {
        cellManager: createCellManager([]),
        policyEngine: createPolicyEngine((action) =>
          action.name === "review"
            ? { type: "gate", gateType: "external", config: { timeout: 5 as unknown as string, fallback: "invalid" as never } }
            : { type: "allow" }
        ),
      },
      { onGate: approvedOnGate }
    );
    approved.define("on-gate-approved", {
      name: "on-gate-approved",
      steps: [{ name: "review", agent: "verifier" }],
    });
    await expect(approved.run("on-gate-approved", {})).resolves.toMatchObject({ status: "completed" });
    expect(approvedOnGate).toHaveBeenCalledOnce();

    const rejected = new DefaultRuntimeOrchestrator(
      {
        cellManager: createCellManager([]),
        policyEngine: createPolicyEngine((action) =>
          action.name === "review"
            ? { type: "gate", gateType: "external", config: { timeout: "1m", fallback: "fail" } }
            : { type: "allow" }
        ),
      },
      { onGate: async () => "rejected" }
    );
    rejected.define("on-gate-rejected", {
      name: "on-gate-rejected",
      steps: [{ name: "review", agent: "verifier" }],
    });
    const rejectedExecution = await rejected.run("on-gate-rejected", {});
    expect(rejectedExecution.status).toBe("failed");
    expect(rejectedExecution.stepRecords.review.error).toBe("Gate rejected: external");

    const gateFalse = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
    });
    gateFalse.define("gate-false", {
      name: "gate-false",
      steps: [{ name: "skipGate", agent: "agent", gate: false }],
    });
    await expect(gateFalse.run("gate-false", {})).resolves.toMatchObject({ status: "completed" });

    const gateString = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
    });
    gateString.define("gate-string", {
      name: "gate-string",
      steps: [{ name: "externalReview", agent: "agent", gate: "external", gate_config: { fallback: "fail" } }],
    });
    const stringWaiting = await gateString.run("gate-string", {});
    expect(stringWaiting.waitingGate).toMatchObject({ gateType: "external", fallback: "fail" });

    const gateObject = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
    });
    gateObject.define("gate-object", {
      name: "gate-object",
      steps: [
        {
          name: "objectReview",
          agent: "agent",
          gate: { type: "consensus", timeout: "5s", fallback: "fail" } as never,
          gate_config: { timeout: "10s", fallback: "auto-approve" },
        },
      ],
    });
    const objectWaiting = await gateObject.run("gate-object", {});
    expect(objectWaiting.waitingGate).toMatchObject({
      gateType: "consensus",
      timeout: "10s",
      fallback: "auto-approve",
    });
  });

  it("covers workflow and step recovery strategy variants", async () => {
    const rollback = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine: new RecoveryEngine({
        snapshotStore: { restore: vi.fn(async () => undefined) },
      }),
    });
    rollback.define("workflow-rollback", {
      name: "workflow-rollback",
      steps: [{ name: "unstable", agent: "executor" }],
      recovery: {
        unstable: {
          on_fail: "rollback",
          snapshot_id: "snapshot-workflow",
        },
      },
    });
    await expect(rollback.run("workflow-rollback", {})).resolves.toMatchObject({
      status: "completed",
      stepRecords: { unstable: { recovery: { strategy: "rollback", status: "recovered" } } },
    });

    const escalated = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine: new RecoveryEngine({
        escalationNotifier: { notify: vi.fn(async () => undefined) },
      }),
    });
    escalated.define("workflow-escalate", {
      name: "workflow-escalate",
      steps: [{ name: "unstable", agent: "executor" }],
      recovery: {
        unstable: {
          on_fail: "escalate",
          to: "ops",
          summary: "needs human",
        },
      },
    });
    const escalatedExecution = await escalated.run("workflow-escalate", {});
    expect(escalatedExecution.status).toBe("failed");
    expect(escalatedExecution.stepRecords.unstable.recovery).toMatchObject({
      strategy: "escalate",
      status: "escalated",
      details: { channel: "ops" },
    });

    const alternative = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine: new RecoveryEngine({
        alternativeExecutor: { executeAlternative: vi.fn(async () => ({ ok: true })) },
      }),
    });
    alternative.define("workflow-alternative", {
      name: "workflow-alternative",
      steps: [{ name: "unstable", agent: "executor" }],
      recovery: {
        unstable: {
          on_fail: "alternative",
          fallback: { name: "fallback-step", payload: { source: "test" } },
        },
      },
    });
    await expect(alternative.run("workflow-alternative", {})).resolves.toMatchObject({
      status: "completed",
      stepRecords: { unstable: { recovery: { strategy: "alternative", status: "recovered" } } },
    });

    const stepRetry = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([], "unstable"),
      policyEngine: createPolicyEngine(),
      recoveryEngine: new RecoveryEngine({
        retryExecutor: { executeRetry: vi.fn(async () => undefined) },
        wait: async () => undefined,
      }),
    });
    stepRetry.define("step-retry", {
      name: "step-retry",
      steps: [
        {
          name: "unstable",
          agent: "executor",
          config: {
            recovery: {
              type: "retry",
              mode: "exponential",
              maxAttempts: 2,
              initialDelayMs: 0,
              maxDelayMs: 0,
              multiplier: 2,
            },
          },
        },
      ],
    });
    await expect(stepRetry.run("step-retry", {})).resolves.toMatchObject({
      status: "completed",
      stepRecords: { unstable: { recovery: { strategy: "retry", status: "recovered" } } },
    });
  });

  it("covers consensus aliases and artifact candidate filtering", async () => {
    const consensusGate = new DefaultConsensusGate({
      executionId: "exec-consensus-alias",
      sessionIdFactory: () => "session-consensus-alias",
    });
    const consensus = new DefaultRuntimeOrchestrator(
      {
        cellManager: createCellManager([]),
        policyEngine: createPolicyEngine(),
        consensusGate,
      },
      {
        consensusVoteProvider: () => [
          { voterId: "required", approved: true },
          { voterId: "best", approved: false },
        ],
      }
    );
    consensus.define("consensus-alias", {
      name: "consensus-alias",
      steps: [
        {
          name: "review",
          agent: "verifier",
          config: {
            consensus: {
              rule: "majority",
              voters: [{ id: "required" }, { id: "best" }],
              minRequired: 1,
              threshold: "invalid",
              timeout: 10,
              bestEffort: ["best", 1],
            },
          },
        },
      ],
    });
    await expect(consensus.run("consensus-alias", {})).resolves.toMatchObject({
      status: "completed",
      stepRecords: { review: { consensus: { status: "pass" } } },
    });

    const saveArtifact = vi.fn(async (record) => record);
    const storage: StorageAdapter = {
      saveRun: async () => undefined,
      getRun: async () => null,
      listRuns: async () => [],
      saveStep: async () => undefined,
      getSteps: async () => [],
      saveArtifact,
      getArtifacts: async () => [],
      deleteArtifact: async () => undefined,
      saveCheckpoint: async () => undefined,
      getLatestCheckpoint: async () => null,
      saveCost: async () => undefined,
      getCosts: async () => [],
      getRunCostSummary: async () => ({ totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
      saveAuditEvent: async () => undefined,
      getAuditTimeline: async () => [],
    };
    const artifactStore = {
      save: vi.fn(async (runId: string, stepName: string, name: string, data: Buffer, mime: string) => ({
        id: `${runId}:${stepName}:${name}`,
        runId,
        stepName,
        name,
        mime,
        size: data.byteLength,
        path: `/tmp/${name}`,
        createdAt: new Date().toISOString(),
      })),
      get: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
    };
    const cellManager = new CellManager({
      createCellContext: () => ({
        cellId: "artifact-filter-cell",
        blackboard: { read: () => undefined, write: () => {} },
        tools: { invoke: async () => ({ ok: true }) },
        audit: { record: () => {} },
        config: {},
      }),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async () => ({
          success: true,
          output: {
            artifacts: [
              null,
              { name: "dup.txt", data: "first" },
              { name: "dup.txt", data: "second" },
              { name: "object.json", data: { ok: true } },
              { name: 3, data: "skip" },
              { name: "missing-data.txt" },
            ],
          },
          stateChanges: [],
          toolCalls: [
            { toolName: "file_write", status: "failed", params: { path: "skip.txt", content: "skip" }, durationMs: 1 },
            { toolName: "file_write", status: "success", params: undefined, durationMs: 1 },
            { toolName: "file_write", status: "success", params: { path: 1, content: "skip" }, durationMs: 1 },
            { toolName: "file_write", status: "success", params: { path: "skip.txt" }, durationMs: 1 },
            { toolName: "file_write", status: "success", params: { path: "dir/tool.txt", content: "tool" }, durationMs: 1 },
          ],
          metrics: { startTime: new Date(), endTime: new Date(), durationMs: 1, toolCallCount: 5 },
        }),
        suspend: async () => {},
        resume: async () => {},
        abort: async () => {},
      }),
    });
    const artifacts = new DefaultRuntimeOrchestrator({
      cellManager,
      policyEngine: createPolicyEngine(),
      storageAdapter: storage,
      artifactStore: artifactStore as unknown as import("../../artifacts/types.js").ArtifactStore,
    });
    artifacts.define("artifact-filter", {
      name: "artifact-filter",
      steps: [{ name: "generate", agent: "writer" }],
    });

    await expect(artifacts.run("artifact-filter", {})).resolves.toMatchObject({ status: "completed" });
    expect(artifactStore.save.mock.calls.map((call) => call[2])).toEqual(["dup.txt", "object.json", "tool.txt"]);
    expect(saveArtifact).toHaveBeenCalledTimes(3);
  });

  it("normalizes runtime helper aliases and defaults", () => {
    interface RuntimeHarness {
      extractGateConfig(step: unknown): unknown;
      mergeGateDecision(policyDecision?: unknown, stepGate?: unknown): unknown;
      extractConsensusConfig(step: unknown): unknown;
      toRecoveryStrategyFromWorkflow(raw?: Record<string, unknown>): unknown;
      toRecoveryStrategyFromStepConfig(raw?: Record<string, unknown>): unknown;
      buildCellConfig(step: { name: string; agent: string; timeout?: string }): unknown;
      extractStateBindings(step: unknown): unknown[];
      isStateBinding(value: unknown): boolean;
      extractError(output: unknown): string;
    }
    const orchestrator = new DefaultRuntimeOrchestrator({
      cellManager: createCellManager([]),
      policyEngine: createPolicyEngine(),
    });
    const harness = orchestrator as unknown as RuntimeHarness;

    expect(harness.extractGateConfig({ name: "none", agent: "agent" })).toBeUndefined();
    expect(harness.extractGateConfig({ name: "false", agent: "agent", gate: false })).toBeUndefined();
    expect(harness.extractGateConfig({ name: "bad", agent: "agent", gate: "unknown" })).toBeUndefined();
    expect(harness.extractGateConfig({ name: "config", agent: "agent", gate: true, config: { gate_config: "bad" } })).toEqual({
      gateType: "human-approval",
      config: undefined,
    });
    expect(harness.extractGateConfig({ name: "string", agent: "agent", gate: "consensus" })).toEqual({
      gateType: "consensus",
      config: undefined,
    });
    expect(harness.extractGateConfig({
      name: "object-default",
      agent: "agent",
      gate: { type: "invalid", fallback: "fail" },
    })).toEqual({
      gateType: "human-approval",
      config: { timeout: undefined, fallback: "fail" },
    });
    expect(harness.mergeGateDecision()).toBeUndefined();
    expect(harness.mergeGateDecision(
      { type: "gate", gateType: undefined, config: "bad" },
      undefined
    )).toEqual({
      type: "gate",
      gateType: "human-approval",
      config: { timeout: undefined, fallback: undefined },
    });

    expect(harness.extractConsensusConfig({ name: "none", agent: "agent" })).toBeUndefined();
    expect(harness.extractConsensusConfig({
      name: "consensus",
      agent: "agent",
      consensus: {
        type: "weighted",
        voters: "bad",
        minRequired: 2,
        best_effort: ["optional", 1],
        threshold: 0.75,
        timeout: "5m",
      },
    })).toEqual({
      type: "weighted",
      voters: [],
      minRequired: 2,
      threshold: 0.75,
      timeout: "5m",
      bestEffort: ["optional"],
    });

    expect(harness.toRecoveryStrategyFromWorkflow()).toBeUndefined();
    expect(harness.toRecoveryStrategyFromWorkflow({ on_fail: "retry" })).toMatchObject({
      type: "retry",
      mode: "linear",
      maxAttempts: 1,
      initialDelayMs: 0,
    });
    expect(harness.toRecoveryStrategyFromWorkflow({ on_fail: "rollback", snapshotId: "snap-1" })).toEqual({
      type: "rollback",
      snapshotId: "snap-1",
    });
    expect(harness.toRecoveryStrategyFromWorkflow({ on_fail: "escalate" })).toEqual({
      type: "escalate",
      severity: "high",
      channel: "human",
      summary: undefined,
    });
    expect(harness.toRecoveryStrategyFromWorkflow({ on_fail: "alternative", to: "fallback" })).toEqual({
      type: "alternative",
      stepName: "fallback",
      payload: undefined,
    });
    expect(harness.toRecoveryStrategyFromWorkflow({ on_fail: "custom" })).toBeUndefined();

    expect(harness.toRecoveryStrategyFromStepConfig()).toBeUndefined();
    expect(harness.toRecoveryStrategyFromStepConfig({ type: "retry" })).toEqual({
      type: "retry",
      mode: "linear",
      maxAttempts: 1,
      initialDelayMs: 0,
      maxDelayMs: 0,
      multiplier: undefined,
    });
    expect(harness.toRecoveryStrategyFromStepConfig({ type: "rollback" })).toEqual({
      type: "rollback",
      snapshotId: "",
    });
    expect(harness.toRecoveryStrategyFromStepConfig({ type: "escalate" })).toEqual({
      type: "escalate",
      severity: "high",
      channel: "human",
      summary: undefined,
    });
    expect(harness.toRecoveryStrategyFromStepConfig({ type: "alternative" })).toEqual({
      type: "alternative",
      stepName: "",
      payload: undefined,
    });
    expect(harness.toRecoveryStrategyFromStepConfig({ type: "custom" })).toBeUndefined();

    expect(harness.buildCellConfig({ name: "timed", agent: "agent", timeout: "2s" })).toMatchObject({
      timeout: 2000,
      metadata: { stepName: "timed", agent: "agent" },
    });

    expect(harness.extractStateBindings({ name: "none", agent: "agent", bindings: "bad" })).toEqual([]);
    expect(harness.extractStateBindings({
      name: "direct",
      agent: "agent",
      bindings: [null, { source: "output.value", target: "state.value" }],
    })).toEqual([{ source: "output.value", target: "state.value" }]);
    expect(harness.extractStateBindings({
      name: "config",
      agent: "agent",
      config: { bindings: [{ source: "output.value", target: "state.configValue" }] },
    })).toEqual([{ source: "output.value", target: "state.configValue" }]);
    expect(harness.isStateBinding({ source: "x" })).toBe(false);
    expect(harness.extractError({ error: 3 })).toBe("Step execution failed");
    expect(harness.extractError({ error: "explicit" })).toBe("explicit");
  });

});

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

  it("enforces max_cost with strict greater-than and emits cost exceeded audit", async () => {
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

});

import { describe, expect, it, vi } from "vitest";
import { CellManager } from "../../cell/CellManager.js";
import type { CellResult } from "../../cell/types.js";
import { DefaultConsensusGate } from "../../consensus/ConsensusGate.js";
import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import type { PolicyAction, PolicyContext, PolicyDecision, PolicySet } from "../../policy/types.js";
import type { PolicyEngine } from "../../policy/PolicyEngine.js";
import { RecoveryEngine } from "../../recovery/RecoveryEngine.js";
import { DefaultRuntimeOrchestrator } from "../RuntimeOrchestrator.js";
import { MockLLMAdapter } from "../../../../adapters/src/llm/mock-adapter";

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

function createScenarioCellManager(options: {
  llm: MockLLMAdapter;
  failFirstReviewAttempt?: boolean;
}): CellManager {
  const attempts = new Map<string, number>();

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
      execute: async (task): Promise<CellResult> => {
        const stepName = String(task.metadata?.stepName ?? "unknown");
        const attempt = (attempts.get(stepName) ?? 0) + 1;
        attempts.set(stepName, attempt);

        if (stepName === "review" && options.failFirstReviewAttempt && attempt === 1) {
          return {
            success: false,
            output: { error: "review consensus inputs are inconsistent" },
            stateChanges: [],
            toolCalls: [
              {
                id: `tool-${stepName}-${attempt}`,
                toolName: "mock.review",
                params: { stepName, attempt },
                status: "error",
                error: "mock review failure",
                startedAt: new Date(),
                endedAt: new Date(),
                durationMs: 0,
              },
            ],
            metrics: {
              startTime: new Date(),
              endTime: new Date(),
              durationMs: 0,
              toolCallCount: 1,
            },
          };
        }

        const llmResult = await options.llm.chatCompletion({
          model: "mock-model",
          messages: [
            { role: "system", content: `scenario1:${stepName}` },
            { role: "user", content: `run:${stepName}:attempt:${attempt}` },
          ],
        });

        const output = runTask
          ? await runTask(task, {} as never)
          : { stepName, attempt, summary: llmResult.message.content };

        return {
          success: true,
          output,
          stateChanges: [],
          toolCalls: [
            {
              id: `tool-${stepName}-${attempt}`,
              toolName: `mock.${stepName}`,
              params: { stepName, attempt },
              status: "success",
              result: { content: llmResult.message.content },
              startedAt: new Date(),
              endedAt: new Date(),
              durationMs: 0,
            },
          ],
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0,
            tokenCount: llmResult.usage.totalTokens,
            toolCallCount: 1,
          },
        };
      },
      suspend: async () => {},
      resume: async () => {},
      abort: async () => {},
    }),
  });
}

function createMonotonicClock(): () => Date {
  let tick = 0;
  const start = Date.UTC(2026, 1, 16, 7, 0, 0);
  return () => new Date(start + tick++);
}

function isReviewFailureCellEndEvent(event: { type: string; data: unknown }): boolean {
  if (event.type !== "cell_end" || typeof event.data !== "object" || event.data === null) {
    return false;
  }

  const data = event.data as { stepName?: string; success?: boolean };
  return data.stepName === "review" && data.success === false;
}

const SCENARIO_1_WORKFLOW_YAML = `
name: scenario-1-e2e-mock
steps:
  - name: generate
    agent: generator
  - name: review
    agent: reviewer
    depends_on: [generate]
    consensus:
      type: majority
      voters:
        - id: opus
        - id: codex
        - id: glm-4.7
        - id: glm-5
      min: 3
      best_effort: [glm-5]
  - name: deploy
    agent: deployer
    depends_on: [review]
`;

describe("Scenario 1 E2E (Mock LLM)", () => {
  it("runs generate -> multi AI review consensus -> human approval gate -> deploy and verifies full audit/replay", async () => {
    const llm = new MockLLMAdapter({
      "run:generate": "generated mock artifact",
      "run:review": "review score: 9.7",
      "run:deploy": "deployed successfully",
    });
    const auditTrail = new InMemoryAuditStore();
    const now = createMonotonicClock();
    const chatSpy = vi.spyOn(llm, "chatCompletion");

    const orchestrator = new DefaultRuntimeOrchestrator(
      {
        cellManager: createScenarioCellManager({ llm }),
        policyEngine: createPolicyEngine((action) =>
          action.name === "deploy"
            ? { type: "gate", gateType: "human-approval", config: { timeout: "24h", fallback: "fail" } }
            : { type: "allow" }
        ),
        consensusGate: new DefaultConsensusGate({ executionId: "scenario1-success", now }),
        auditTrail,
      },
      {
        now,
        consensusVoteProvider: () => [
          { voterId: "opus", approved: true, score: 9.8 },
          { voterId: "codex", approved: true, score: 9.4 },
          { voterId: "glm-4.7", approved: true, score: 9.2 },
        ],
      }
    );

    orchestrator.define("scenario-1", SCENARIO_1_WORKFLOW_YAML);

    const waiting = await orchestrator.run("scenario-1", {
      project: "obora-kit",
      task: "TASK-M1-20",
    });

    expect(waiting.status).toBe("waiting");
    expect(waiting.waitingGate?.stepName).toBe("deploy");
    expect(waiting.waitingGate?.status).toBe("waiting");
    expect(waiting.waitingGate?.gateType).toBe("human-approval");
    expect(waiting.stepRecords.generate.status).toBe("completed");
    expect(waiting.stepRecords.review.status).toBe("completed");
    expect(waiting.stepRecords.review.consensus?.status).toBe("pass");
    if (waiting.stepRecords.review.consensus?.status === "pass") {
      expect(waiting.stepRecords.review.consensus.votes).toHaveLength(3);
    }

    const completed = await orchestrator.approve(waiting.id);

    expect(completed.status).toBe("completed");
    expect(completed.completedSteps).toEqual(["generate", "review", "deploy"]);

    expect(chatSpy).toHaveBeenCalledTimes(3);
    expect(chatSpy.mock.calls.every(([params]) => params.model === "mock-model")).toBe(true);

    const events = await auditTrail.query({ executionId: completed.id });
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes[0]).toBe("execution_start");
    expect(eventTypes[eventTypes.length - 1]).toBe("execution_end");
    expect(eventTypes.filter((type) => type === "gate_wait")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "gate_resolve")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "consensus_vote")).toHaveLength(3);
    expect(eventTypes.filter((type) => type === "consensus_result")).toHaveLength(1);

    const replayedTypes: string[] = [];
    const replay = await auditTrail.replay({
      executionId: completed.id,
      mode: "event-playback",
      speed: 1000,
      onEvent: async (event) => {
        replayedTypes.push(event.type);
      },
    });

    expect(replay.mode).toBe("event-playback");
    expect(replay.totalEvents).toBe(events.length);
    expect(replayedTypes).toEqual(eventTypes);
  });

  it("records review failure -> recovery retry flow in audit and completes deployment", async () => {
    const llm = new MockLLMAdapter({
      "run:generate": "generated mock artifact",
      "run:review": "review recovered",
      "run:deploy": "deployed after recovery",
    });
    const auditTrail = new InMemoryAuditStore();
    const now = createMonotonicClock();

    const retryExecutor = {
      executeRetry: vi.fn(async () => ({ ok: true, reason: "mock retry success" })),
    };

    const consensusVoteProvider = vi.fn(() => [
      { voterId: "opus", approved: true, score: 9.8 },
      { voterId: "codex", approved: true, score: 9.6 },
      { voterId: "glm-4.7", approved: true, score: 9.4 },
    ]);

    const orchestrator = new DefaultRuntimeOrchestrator(
      {
        cellManager: createScenarioCellManager({ llm, failFirstReviewAttempt: true }),
        policyEngine: createPolicyEngine((action) =>
          action.name === "deploy"
            ? { type: "gate", gateType: "human-approval", config: { timeout: "24h", fallback: "fail" } }
            : { type: "allow" }
        ),
        recoveryEngine: new RecoveryEngine({
          retryExecutor,
          wait: async () => {},
        }),
        consensusGate: new DefaultConsensusGate({ executionId: "scenario1-recovery", now }),
        auditTrail,
      },
      {
        now,
        consensusVoteProvider,
        defaultRecoveryStrategy: {
          type: "retry",
          mode: "linear",
          maxAttempts: 2,
          initialDelayMs: 0,
          maxDelayMs: 0,
        },
      }
    );

    orchestrator.define("scenario-1-recovery", SCENARIO_1_WORKFLOW_YAML);

    const waiting = await orchestrator.run("scenario-1-recovery", { task: "TASK-M1-20" });
    expect(waiting.status).toBe("waiting");

    const completed = await orchestrator.approve(waiting.id);
    expect(completed.status).toBe("completed");
    expect(completed.completedSteps).toEqual(["generate", "review", "deploy"]);
    expect(completed.stepRecords.review.recovery?.status).toBe("recovered");
    expect(retryExecutor.executeRetry).toHaveBeenCalledOnce();

    const events = await auditTrail.query({ executionId: completed.id });
    const recoveryTypes = events
      .filter((event) => event.type === "recovery_start" || event.type === "recovery_end")
      .map((event) => event.type);

    expect(recoveryTypes).toEqual(["recovery_start", "recovery_end"]);
    expect(consensusVoteProvider).not.toHaveBeenCalled();
    expect(events.filter((event) => event.type === "consensus_vote")).toHaveLength(0);
    expect(events.filter((event) => event.type === "consensus_result")).toHaveLength(0);
    expect(events.filter((event) => event.type === "gate_wait")).toHaveLength(1);
    expect(events.filter((event) => event.type === "gate_resolve")).toHaveLength(1);

    const failedReviewCellEnd = events.find((event) => isReviewFailureCellEndEvent(event));
    expect(failedReviewCellEnd).toBeDefined();
  });
});

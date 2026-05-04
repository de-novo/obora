import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import { ReExecutionPlanner } from "../../audit/ReExecutionPlanner.js";
import { ReExecutionRuntime } from "../../audit/ReExecutionRuntime.js";
import type { AuditEvent, AuditEventType } from "../../audit/types.js";
import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { PatternRegistry } from "../../patterns/PatternRegistry.js";
import { ConsensusPattern } from "../../patterns/builtin/ConsensusPattern.js";

type GateOutcome = "approve" | "reject";

interface WorkflowStep {
  name: string;
  agent?: string;
  pattern?: string;
  participants?: Record<string, string>;
  consensus?: {
    rule?: "majority";
    min?: number;
    of?: number;
    timeout?: string;
    best_effort?: string[];
  };
  gate?: string;
  gate_config?: {
    timeout?: string;
    fallback?: "escalate";
    escalation_to?: string;
  };
}

interface WorkflowFixture {
  name: string;
  steps: WorkflowStep[];
  recovery?: {
    [stepName: string]: {
      on_fail?: "retry" | "escalate";
      max_retries?: number;
      to?: string;
    };
  };
}

interface ConsensusAttemptInput {
  votes: Record<string, boolean | { approved: boolean; reason?: string }>;
  startedAt?: string;
  timeout?: string;
  now?: string;
}

interface RunOptions {
  executionId: string;
  consensusAttempts: ConsensusAttemptInput[];
  gateOutcome?: GateOutcome;
}

interface RunResult {
  executionId: string;
  status: "completed" | "failed" | "escalated";
  consensus: {
    approved: boolean;
    votes: Array<{ voterId: string; approved: boolean; reason?: string }>;
  };
  errorCode?: OboraErrorCode;
  escalationTo?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

class ThreeAIConsensusE2ERunner {
  private readonly registry = new PatternRegistry();
  private readonly audit = new InMemoryAuditStore();
  private eventSeq = 0;

  constructor(private readonly workflow: WorkflowFixture) {
    this.registry.register(new ConsensusPattern());
  }

  async run(options: RunOptions): Promise<RunResult> {
    const generateStep = this.requireStep("generate");
    const reviewStep = this.requireStep("review");
    const finalizeStep = this.requireStep("finalize");

    await this.record(options.executionId, "execution_start", {
      workflowName: this.workflow.name,
      stepOrder: this.workflow.steps.map((step) => step.name),
    });

    await this.record(options.executionId, "step_start", { stepName: generateStep.name, agent: generateStep.agent });
    const generatedArtifact = {
      title: "Initial spec",
      content: "Generated artifact for consensus review",
    };
    await this.record(options.executionId, "cell_end", {
      stepName: generateStep.name,
      output: generatedArtifact,
    });
    await this.record(options.executionId, "step_end", { stepName: generateStep.name, success: true });

    await this.record(options.executionId, "step_start", { stepName: reviewStep.name, agent: reviewStep.agent });

    const maxRetries = Number(this.workflow.recovery?.review?.max_retries ?? 0);
    const attempts = options.consensusAttempts.length;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const attemptInput = options.consensusAttempts[attempt];

      try {
        const result = await this.registry.get("consensus").run({
          executionId: options.executionId,
          stepName: reviewStep.name,
          pattern: "consensus",
          participants: reviewStep.participants,
          config: {
            rule: reviewStep.consensus?.rule ?? "majority",
            timeout: attemptInput.timeout ?? reviewStep.consensus?.timeout,
            best_effort: reviewStep.consensus?.best_effort,
          },
          input: {
            topic: generatedArtifact.title,
            startedAt: attemptInput.startedAt,
            votes: attemptInput.votes,
          },
          now: attemptInput.now ? () => new Date(attemptInput.now as string) : undefined,
          emit: async (event) => {
            if (event.type === "consensus_vote_cast") {
              const payload = isObject(event.payload) ? event.payload : {};
              await this.record(options.executionId, "consensus_vote", {
                stepName: reviewStep.name,
                ...payload,
                attempt: attempt + 1,
              });
            }

            if (event.type === "consensus_result") {
              await this.record(options.executionId, "consensus_result", {
                stepName: reviewStep.name,
                attempt: attempt + 1,
                payload: event.payload,
              });
            }
          },
        } as never);

        const output = (result.output ?? {}) as { votes?: Array<{ voterId: string; approved: boolean; reason?: string }> };

        await this.record(options.executionId, "cell_end", {
          stepName: reviewStep.name,
          output: {
            approved: result.success,
            votes: output.votes ?? [],
          },
        });

        if (result.success) {
          await this.record(options.executionId, "step_end", {
            stepName: reviewStep.name,
            success: true,
            attempt: attempt + 1,
          });

          return this.finalizeSuccess(options.executionId, finalizeStep, output.votes ?? [], options.gateOutcome ?? "approve");
        }

        if (attempt < maxRetries) {
          await this.record(options.executionId, "recovery_start", {
            stepName: reviewStep.name,
            strategy: "retry",
            attempt: attempt + 1,
          });
          await this.record(options.executionId, "recovery_end", {
            stepName: reviewStep.name,
            status: "recovered",
            nextAttempt: attempt + 2,
          });
          continue;
        }

        await this.record(options.executionId, "step_end", {
          stepName: reviewStep.name,
          success: false,
          attempt: attempt + 1,
        });
        await this.record(options.executionId, "execution_end", {
          status: "failed",
          reason: "consensus rejected",
        });

        return {
          executionId: options.executionId,
          status: "failed",
          consensus: {
            approved: false,
            votes: output.votes ?? [],
          },
          errorCode: OboraErrorCode.CONSENSUS_FAIL,
        };
      } catch (error) {
        const timeoutError = error as { code?: OboraErrorCode };

        if (timeoutError.code !== OboraErrorCode.CONSENSUS_TIMEOUT) {
          throw error;
        }

        await this.record(options.executionId, "recovery_start", {
          stepName: reviewStep.name,
          strategy: "escalate",
          reason: OboraErrorCode.CONSENSUS_TIMEOUT,
        });

        const escalationTo = finalizeStep.gate_config?.escalation_to ?? this.workflow.recovery?.finalize?.to;
        await this.record(options.executionId, "recovery_end", {
          stepName: reviewStep.name,
          status: "escalated",
          to: escalationTo,
        });

        await this.record(options.executionId, "step_end", {
          stepName: reviewStep.name,
          success: false,
          errorCode: OboraErrorCode.CONSENSUS_TIMEOUT,
        });

        await this.record(options.executionId, "execution_end", {
          status: "escalated",
          errorCode: OboraErrorCode.CONSENSUS_TIMEOUT,
          escalation_to: escalationTo,
        });

        return {
          executionId: options.executionId,
          status: "escalated",
          consensus: {
            approved: false,
            votes: [],
          },
          errorCode: OboraErrorCode.CONSENSUS_TIMEOUT,
          escalationTo,
        };
      }
    }

    throw new Error("No consensus attempt provided");
  }

  async reexecute(executionId: string) {
    const planner = new ReExecutionPlanner(this.audit);
    const runtime = new ReExecutionRuntime(this.audit, planner);

    const plan = await planner.createPlan(executionId, {
      mode: "full",
    });

    const result = await runtime.reexecute({
      executionId,
      mode: "full",
    });

    return { plan, result };
  }

  async getEvents(executionId: string): Promise<AuditEvent[]> {
    return this.audit.query({ executionId });
  }

  private async finalizeSuccess(
    executionId: string,
    finalizeStep: WorkflowStep,
    votes: Array<{ voterId: string; approved: boolean; reason?: string }>,
    gateOutcome: GateOutcome
  ): Promise<RunResult> {
    await this.record(executionId, "step_start", {
      stepName: finalizeStep.name,
      agent: finalizeStep.agent,
    });

    await this.record(executionId, "gate_wait", {
      stepName: finalizeStep.name,
      gateType: finalizeStep.gate,
      config: finalizeStep.gate_config,
    });

    await this.record(executionId, "gate_resolve", {
      stepName: finalizeStep.name,
      status: gateOutcome,
    });

    const success = gateOutcome === "approve";

    await this.record(executionId, "cell_end", {
      stepName: finalizeStep.name,
      output: {
        gate: gateOutcome,
        released: success,
      },
    });

    await this.record(executionId, "step_end", {
      stepName: finalizeStep.name,
      success,
    });

    await this.record(executionId, "execution_end", {
      status: success ? "completed" : "failed",
    });

    return {
      executionId,
      status: success ? "completed" : "failed",
      consensus: {
        approved: true,
        votes,
      },
    };
  }

  private requireStep(name: string): WorkflowStep {
    const step = this.workflow.steps.find((entry) => entry.name === name);
    if (!step) {
      throw new Error(`Missing workflow step: ${name}`);
    }
    return step;
  }

  private async record(executionId: string, type: AuditEventType, data: unknown): Promise<void> {
    this.eventSeq += 1;
    await this.audit.record({
      id: `evt-${this.eventSeq}`,
      executionId,
      timestamp: new Date(Date.UTC(2026, 1, 16, 17, 0, this.eventSeq)),
      type,
      data,
    });
  }
}

async function loadWorkflowFixture(): Promise<WorkflowFixture> {
  const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  const workflowPath = join(fixtureDir, "three-ai-consensus-workflow.yaml");
  const workflowYaml = await readFile(workflowPath, "utf8");
  return parse(workflowYaml) as WorkflowFixture;
}

describe("M2-17 Scenario 2: 3AI consensus E2E", () => {
  it("success path: 2/3 approve then finalize gate approve", async () => {
    const workflow = await loadWorkflowFixture();
    const runner = new ThreeAIConsensusE2ERunner(workflow);

    const result = await runner.run({
      executionId: "three-ai-success",
      gateOutcome: "approve",
      consensusAttempts: [
        {
          votes: {
            opus: { approved: true, reason: "looks good" },
            codex: { approved: true, reason: "ready" },
            glm: { approved: false, reason: "minor concern" },
          },
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.consensus.approved).toBe(true);
    expect(result.consensus.votes).toHaveLength(3);
    expect(result.consensus.votes.filter((vote) => vote.approved)).toHaveLength(2);

    const events = await runner.getEvents("three-ai-success");
    expect(events.filter((event) => event.type === "consensus_vote")).toHaveLength(3);
    expect(events.filter((event) => event.type === "consensus_result")).toHaveLength(1);
  });

  it("consensus failure on first attempt then retry succeeds", async () => {
    const workflow = await loadWorkflowFixture();
    const runner = new ThreeAIConsensusE2ERunner(workflow);

    const result = await runner.run({
      executionId: "three-ai-retry",
      gateOutcome: "approve",
      consensusAttempts: [
        {
          votes: {
            opus: false,
            codex: true,
            glm: false,
          },
        },
        {
          votes: {
            opus: true,
            codex: true,
            glm: false,
          },
        },
      ],
    });

    expect(result.status).toBe("completed");
    expect(result.consensus.approved).toBe(true);

    const events = await runner.getEvents("three-ai-retry");
    expect(events.some((event) => event.type === "recovery_start")).toBe(true);
    expect(events.some((event) => event.type === "recovery_end")).toBe(true);
  });

  it("consensus timeout escalates with CONSENSUS_TIMEOUT", async () => {
    const workflow = await loadWorkflowFixture();
    const runner = new ThreeAIConsensusE2ERunner(workflow);

    const result = await runner.run({
      executionId: "three-ai-timeout",
      consensusAttempts: [
        {
          timeout: "1s",
          startedAt: "2026-02-16T00:00:00.000Z",
          now: "2026-02-16T00:00:10.000Z",
          votes: {
            opus: true,
          },
        },
      ],
    });

    expect(result.status).toBe("escalated");
    expect(result.errorCode).toBe(OboraErrorCode.CONSENSUS_TIMEOUT);
    expect(result.escalationTo).toBe("senior-reviewer");

    const events = await runner.getEvents("three-ai-timeout");
    const recoveryEnd = events.find((event) => event.type === "recovery_end");
    expect(recoveryEnd?.data).toMatchObject({ to: "senior-reviewer" });
  });

  it("re-execution full mode creates diff report and audit lifecycle", async () => {
    const workflow = await loadWorkflowFixture();
    const runner = new ThreeAIConsensusE2ERunner(workflow);

    await runner.run({
      executionId: "three-ai-reexecute-origin",
      gateOutcome: "approve",
      consensusAttempts: [
        {
          votes: {
            opus: true,
            codex: true,
            glm: false,
          },
        },
      ],
    });

    const { plan, result } = await runner.reexecute("three-ai-reexecute-origin");

    expect(plan.mode).toBe("full");
    expect(plan.stepsToRerun).toEqual(["generate", "review", "finalize"]);

    expect(result.success).toBe(true);
    expect(result.diffReport.summary.total_steps).toBe(3);
    expect(result.diffReport.differences).toHaveLength(3);

    const reexecEvents = await runner.getEvents(result.reExecutionId);
    expect(reexecEvents.some((event) => event.type === "reexecution_start")).toBe(true);
    expect(reexecEvents.some((event) => event.type === "reexecution_end")).toBe(true);
  });
});

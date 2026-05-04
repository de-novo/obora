import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { InMemoryAuditStore } from "../../audit/InMemoryAuditStore.js";
import type { AuditEvent, AuditEventType } from "../../audit/types.js";
import { PatternRegistry } from "../../patterns/PatternRegistry.js";
import { BrainstormPattern } from "../../patterns/builtin/BrainstormPattern.js";
import { CompositePattern } from "../../patterns/builtin/CompositePattern.js";
import { ConsensusPattern } from "../../patterns/builtin/ConsensusPattern.js";
import { DiscussionPattern } from "../../patterns/builtin/DiscussionPattern.js";
import { FanOutFanInPattern } from "../../patterns/builtin/FanOutFanInPattern.js";
import { PeerReviewPattern } from "../../patterns/builtin/PeerReviewPattern.js";
import { PipelinePattern } from "../../patterns/builtin/PipelinePattern.js";
import { RedBluePattern } from "../../patterns/builtin/RedBluePattern.js";
import { SupervisorPattern } from "../../patterns/builtin/SupervisorPattern.js";
import { DefaultPolicyEngine } from "../../policy/DefaultPolicyEngine.js";
import { loadPolicyFromYaml } from "../../policy/PolicyLoader.js";
import type { PolicyDecision } from "../../policy/types.js";

// ── M2-01R Canonical State Enum ──────────────────────────────────────
type RunState =
  | "queued"
  | "running"
  | "retried"
  | "timeout"
  | "failed"
  | "skipped"
  | "needs-human-review"
  | "done";

type GateOutcome = "approve" | "reject" | "timeout";

// ── Workflow Fixture Types ───────────────────────────────────────────
interface WorkflowStep {
  name: string;
  pattern?: string;
  participants?: Record<string, string>;
  config?: Record<string, unknown>;
  gate?: string;
  gate_config?: Record<string, unknown>;
}

interface WorkflowFixture {
  name: string;
  policy: string;
  steps: WorkflowStep[];
  recovery?: {
    [stepName: string]: {
      on_fail?: string;
      max_retries?: number;
      to?: string;
    };
  };
}

interface ReviewAttemptInput {
  reviews: Record<string, { score: number; issues: Array<{ severity: string; description: string }> }>;
}

interface RunOptions {
  executionId: string;
  reviewAttempts: ReviewAttemptInput[];
  gateOutcome: GateOutcome;
  gateComment?: string;
  triggerDeniedTool?: boolean;
  simulateSkip?: boolean;
  simulateResolveError?: boolean;
  simulateMalformedJson?: boolean;
  simulateNeedsHumanReview?: boolean;
}

// ── Error Codes ──────────────────────────────────────────────────────
type ErrorCode =
  | "RESOLVE_ERROR"
  | "VALIDATION_ERROR"
  | "MALFORMED_JSON"
  | "TIMEOUT"
  | "ESCALATION_FAILED";

// ── Run Result (M2-01R contract-aligned) ─────────────────────────────
interface RunResult {
  runId: string;
  workflow: string;
  status: "pass" | "fail";
  runState: RunState;
  finalPass: boolean | null;
  decisionReason: string;
  errorCode: ErrorCode | null;
  workflowState: "running" | "failed" | "done";
  brainstormSelected: string[];
  draft: string;
  reviewPassed: boolean;
  peerReviewAttemptsUsed: number;
  policyDecisions: PolicyDecision[];
}

interface PolicyCheckResult {
  allow: PolicyDecision;
  deny: PolicyDecision;
}

// ── Runner ───────────────────────────────────────────────────────────
class DocGenE2ERunner {
  private readonly registry = new PatternRegistry();
  private readonly audit = new InMemoryAuditStore();
  private readonly policy = new DefaultPolicyEngine();
  private eventSeq = 0;

  constructor(
    private readonly workflow: WorkflowFixture,
    policySet: Awaited<ReturnType<typeof loadPolicyFromYaml>>,
  ) {
    this.policy.loadInline(policySet, "doc-gen-policy");

    this.registry.register(new PipelinePattern());
    this.registry.register(new DiscussionPattern());
    this.registry.register(new ConsensusPattern());
    this.registry.register(new BrainstormPattern());
    this.registry.register(new PeerReviewPattern());
    this.registry.register(new SupervisorPattern());
    this.registry.register(new FanOutFanInPattern());
    this.registry.register(new RedBluePattern());
    this.registry.register(new CompositePattern(this.registry));
  }

  async run(options: RunOptions): Promise<RunResult> {
    const brainstormStep = this.requireStep("brainstorm");
    const draftStep = this.requireStep("draft");
    const reviewStep = this.requireStep("peer-review");
    const approvalStep = this.requireStep("approval");

    await this.record(options.executionId, "execution_start", { workflow: this.workflow.name });

    const policyDecisions: PolicyDecision[] = [];

    if (options.simulateResolveError) {
      await this.record(options.executionId, "execution_end", {
        status: "failed",
        runState: "failed" as RunState,
        reason: "policy/schema resolve failed",
        errorCode: "RESOLVE_ERROR" as ErrorCode,
      });
      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "fail",
        runState: "failed",
        finalPass: false,
        decisionReason: "policy/schema resolve failed",
        errorCode: "RESOLVE_ERROR",
        workflowState: "failed",
        brainstormSelected: [],
        draft: "",
        reviewPassed: false,
        peerReviewAttemptsUsed: 0,
        policyDecisions,
      };
    }

    if (options.simulateMalformedJson) {
      await this.record(options.executionId, "execution_end", {
        status: "failed",
        runState: "failed" as RunState,
        reason: "model output malformed json",
        errorCode: "MALFORMED_JSON" as ErrorCode,
      });
      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "fail",
        runState: "failed",
        finalPass: false,
        decisionReason: "model output malformed json",
        errorCode: "MALFORMED_JSON",
        workflowState: "failed",
        brainstormSelected: [],
        draft: "",
        reviewPassed: false,
        peerReviewAttemptsUsed: 0,
        policyDecisions,
      };
    }

    if (options.simulateSkip) {
      await this.record(options.executionId, "execution_end", {
        status: "completed",
        runState: "skipped" as RunState,
        reason: "policy skip condition met",
        errorCode: null,
      });
      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "pass",
        runState: "skipped",
        finalPass: true,
        decisionReason: "policy skip condition met",
        errorCode: null,
        workflowState: "done",
        brainstormSelected: [],
        draft: "",
        reviewPassed: true,
        peerReviewAttemptsUsed: 0,
        policyDecisions,
      };
    }

    if (options.simulateNeedsHumanReview) {
      await this.record(options.executionId, "execution_end", {
        status: "escalated",
        runState: "needs-human-review" as RunState,
        reason: "manual review required",
        errorCode: "ESCALATION_FAILED" as ErrorCode,
      });
      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "fail",
        runState: "needs-human-review",
        finalPass: null,
        decisionReason: "manual review required",
        errorCode: "ESCALATION_FAILED",
        workflowState: "running",
        brainstormSelected: [],
        draft: "",
        reviewPassed: false,
        peerReviewAttemptsUsed: 0,
        policyDecisions,
      };
    }

    // ── Step 1: Brainstorm ───────────────────────────────────────────
    await this.record(options.executionId, "step_start", { stepName: brainstormStep.name });
    const brainstorm = await this.registry.get("brainstorming").run({
      executionId: options.executionId,
      stepName: brainstormStep.name,
      pattern: "brainstorming",
      participants: brainstormStep.participants,
      config: brainstormStep.config,
      input: {
        topic: "Obora M2 launch document",
        ideas: {
          alice: ["Problem framing", "Roadmap"],
          bob: ["Architecture", "Roadmap"],
          carol: ["Risks", "Adoption plan"],
        },
        evaluations: {
          alice: { "Problem framing": 8, Roadmap: 9, Architecture: 9, Risks: 7, "Adoption plan": 8 },
          bob: { "Problem framing": 8, Roadmap: 8, Architecture: 9, Risks: 7, "Adoption plan": 7 },
          carol: { "Problem framing": 9, Roadmap: 8, Architecture: 8, Risks: 8, "Adoption plan": 9 },
        },
      },
    });

    if (!brainstorm.success) {
      throw new Error("Brainstorm step failed unexpectedly");
    }
    const selected = this.extractSelectedIdeas(brainstorm.output);
    await this.record(options.executionId, "step_end", {
      stepName: brainstormStep.name,
      success: brainstorm.success,
      selectedIdeas: selected,
    });

    // ── Step 2: Draft (with policy check) ────────────────────────────
    await this.record(options.executionId, "step_start", { stepName: draftStep.name });
    const allowWrite = await this.checkTool(options.executionId, draftStep.name, "file_write");
    policyDecisions.push(allowWrite);
    const draft = `# Document Draft\n\n${selected.map((idea, index) => `${index + 1}. ${idea}`).join("\n")}`;
    await this.record(options.executionId, "step_end", {
      stepName: draftStep.name,
      success: true,
      outputLength: draft.length,
    });

    if (options.triggerDeniedTool) {
      const denied = await this.checkTool(options.executionId, draftStep.name, "shell_exec");
      policyDecisions.push(denied);
    }

    // ── Step 3: Peer Review (with retry) ─────────────────────────────
    await this.record(options.executionId, "step_start", { stepName: reviewStep.name });
    let reviewPassed = false;
    let attemptsUsed = 0;

    for (let attempt = 0; attempt < options.reviewAttempts.length; attempt += 1) {
      attemptsUsed = attempt + 1;
      const reviewResult = await this.registry.get("peer-review").run({
        executionId: options.executionId,
        stepName: reviewStep.name,
        pattern: "peer-review",
        participants: reviewStep.participants,
        config: { ...reviewStep.config, max_rounds: 1 },
        input: {
          subject: draft,
          reviews: options.reviewAttempts[attempt].reviews,
        },
      });

      const voters = Object.entries(options.reviewAttempts[attempt].reviews);
      for (const [voterId, review] of voters) {
        const approved = review.score >= Number(reviewStep.config?.min_score ?? 7);
        await this.record(options.executionId, "consensus_vote", {
          stepName: reviewStep.name,
          voterId,
          approved,
          score: review.score,
        });
      }

      await this.record(options.executionId, "consensus_result", {
        stepName: reviewStep.name,
        success: reviewResult.success,
        attempt: attempt + 1,
      });

      if (reviewResult.success) {
        reviewPassed = true;
        break;
      }

      const maxRetries = Number(this.workflow.recovery?.["peer-review"]?.max_retries ?? 0);
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
      }
    }

    await this.record(options.executionId, "step_end", {
      stepName: reviewStep.name,
      success: reviewPassed,
      attemptsUsed,
    });

    // ── Review failed → runState: "failed" ───────────────────────────
    if (!reviewPassed) {
      await this.record(options.executionId, "execution_end", {
        status: "failed",
        runState: "failed" as RunState,
        reason: "peer-review failed",
        errorCode: "VALIDATION_ERROR" as ErrorCode,
      });
      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "fail",
        runState: "failed",
        finalPass: false,
        decisionReason: "peer-review failed after all retries",
        errorCode: "VALIDATION_ERROR",
        workflowState: "failed",
        brainstormSelected: selected,
        draft,
        reviewPassed,
        peerReviewAttemptsUsed: attemptsUsed,
        policyDecisions,
      };
    }

    // ── Step 4: Approval Gate ────────────────────────────────────────
    await this.record(options.executionId, "step_start", { stepName: approvalStep.name });
    await this.record(options.executionId, "gate_wait", {
      stepName: approvalStep.name,
      gateType: approvalStep.gate,
      config: approvalStep.gate_config,
    });

    // Timeout → runState: "timeout" (M2-01R), workflowState remains failed
    if (options.gateOutcome === "timeout") {
      await this.record(options.executionId, "gate_resolve", {
        stepName: approvalStep.name,
        status: "timeout",
        fallback: approvalStep.gate_config?.fallback,
        escalation_to: approvalStep.gate_config?.escalation_to,
      });
      await this.record(options.executionId, "step_end", {
        stepName: approvalStep.name,
        success: false,
        status: "escalated",
      });
      await this.record(options.executionId, "execution_end", {
        status: "escalated",
        runState: "timeout" as RunState,
        escalation_to: approvalStep.gate_config?.escalation_to,
        errorCode: "TIMEOUT" as ErrorCode,
      });

      return {
        runId: options.executionId,
        workflow: this.workflow.name,
        status: "fail",
        runState: "timeout",
        finalPass: false,
        decisionReason: `escalated to ${String(approvalStep.gate_config?.escalation_to ?? "unknown")}`,
        errorCode: "TIMEOUT",
        workflowState: "failed",
        brainstormSelected: selected,
        draft,
        reviewPassed,
        peerReviewAttemptsUsed: attemptsUsed,
        policyDecisions,
      };
    }

    // Approve or Reject
    await this.record(options.executionId, "gate_resolve", {
      stepName: approvalStep.name,
      status: options.gateOutcome,
      comment: options.gateComment,
    });

    const approvalSuccess = options.gateOutcome === "approve";
    await this.record(options.executionId, "step_end", {
      stepName: approvalStep.name,
      success: approvalSuccess,
    });

    const finalRunState: RunState = approvalSuccess ? "done" : "failed";
    const finalErrorCode: ErrorCode | null = approvalSuccess ? null : "ESCALATION_FAILED";

    await this.record(options.executionId, "execution_end", {
      status: approvalSuccess ? "completed" : "failed",
      runState: finalRunState,
      finalPass: approvalSuccess,
      errorCode: finalErrorCode,
    });

    return {
      runId: options.executionId,
      workflow: this.workflow.name,
      status: approvalSuccess ? "pass" : "fail",
      runState: finalRunState,
      finalPass: approvalSuccess,
      decisionReason: approvalSuccess
        ? "all steps passed and gate approved"
        : `gate rejected${options.gateComment ? `: ${options.gateComment}` : ""}`,
      errorCode: finalErrorCode,
      workflowState: approvalSuccess ? "done" : "failed",
      brainstormSelected: selected,
      draft,
      reviewPassed,
      peerReviewAttemptsUsed: attemptsUsed,
      policyDecisions,
    };
  }

  async verifyPolicy(): Promise<PolicyCheckResult> {
    const executionId = "policy-check";
    const allow = await this.checkTool(executionId, "draft", "file_write");
    const deny = await this.checkTool(executionId, "draft", "shell_exec");
    return { allow, deny };
  }

  async getEvents(executionId: string): Promise<AuditEvent[]> {
    return this.audit.query({ executionId });
  }

  private requireStep(name: string): WorkflowStep {
    const step = this.workflow.steps.find((entry) => entry.name === name);
    if (!step) throw new Error(`Missing workflow step: ${name}`);
    return step;
  }

  private extractSelectedIdeas(output: unknown): string[] {
    if (!output || typeof output !== "object") return [];
    const brainstorm = (output as { brainstorming?: { selected?: Array<{ text?: unknown }> } }).brainstorming;
    if (!brainstorm || !Array.isArray(brainstorm.selected)) return [];
    return brainstorm.selected
      .map((idea) => (typeof idea.text === "string" ? idea.text : ""))
      .filter((text) => text.length > 0);
  }

  /** Policy check with **deterministic** audit recording (no fire-and-forget). */
  private async checkTool(executionId: string, stepName: string, toolName: string): Promise<PolicyDecision> {
    const decision = this.policy.enforce(
      { type: "tool_call", name: toolName },
      { executionId, stepName },
    );

    await this.record(executionId, "policy_check", {
      stepName,
      toolName,
      decision: decision.type,
    });

    if (decision.type === "deny") {
      await this.record(executionId, "policy_deny", {
        stepName,
        toolName,
        reason: decision.reason,
      });
    }

    return decision;
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

// ── Fixtures ─────────────────────────────────────────────────────────
async function loadFixtures(): Promise<{ workflow: WorkflowFixture; policyPath: string }> {
  const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
  const workflowPath = join(fixtureDir, "doc-gen-workflow.yaml");
  const workflowYaml = await readFile(workflowPath, "utf8");
  const workflow = parse(workflowYaml) as WorkflowFixture;
  const policyPath = join(fixtureDir, "doc-gen-policy.yaml");
  return { workflow, policyPath };
}

// ── Tests (all inside single describe) ───────────────────────────────
describe("M2-16 Scenario 2: Document generation E2E", () => {
  it("happy path: brainstorm → draft → peer-review pass → approval", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-happy",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 9, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
    });

    expect(result.status).toBe("pass");
    expect(result.runId).toBe("doc-gen-happy");
    expect(result.workflow).toBe("doc-generation-pipeline");
    expect(result.runState).toBe("done");
    expect(result.finalPass).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.decisionReason).toBe("all steps passed and gate approved");
    expect(result.brainstormSelected.length).toBeGreaterThan(0);
    expect(result.reviewPassed).toBe(true);
    expect(result.peerReviewAttemptsUsed).toBe(1);
  });

  it("review failure on first pass then retry succeeds", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-retry",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 4, issues: [{ severity: "P1", description: "Needs work" }] },
            "reviewer-b": { score: 8, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 9, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
    });

    expect(result.status).toBe("pass");
    expect(result.runState).toBe("done");
    expect(result.reviewPassed).toBe(true);
    expect(result.peerReviewAttemptsUsed).toBe(2);

    const events = await runner.getEvents("doc-gen-retry");
    expect(events.some((event) => event.type === "recovery_start")).toBe(true);
    expect(events.some((event) => event.type === "recovery_end")).toBe(true);
  });

  it("gate timeout escalates → runState 'timeout' + errorCode TIMEOUT", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-timeout",
      gateOutcome: "timeout",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 8, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
    });

    expect(result.status).toBe("fail");
    expect(result.runState).toBe("timeout");
    expect(result.finalPass).toBe(false);
    expect(result.errorCode).toBe("TIMEOUT");

    const events = await runner.getEvents("doc-gen-timeout");
    const gateResolve = events.find((event) => event.type === "gate_resolve");
    expect(gateResolve).toBeDefined();
    expect(gateResolve?.data).toMatchObject({
      status: "timeout",
      escalation_to: "team-lead",
    });

    const execEnd = events.find((e) => e.type === "execution_end");
    expect(execEnd?.data).toMatchObject({
      runState: "timeout",
      errorCode: "TIMEOUT",
    });
  });

  it("records audit trail for full execution", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    await runner.run({
      executionId: "doc-gen-audit",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 9, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
      triggerDeniedTool: true,
    });

    const events = await runner.getEvents("doc-gen-audit");
    const eventTypes = events.map((event) => event.type);

    expect(eventTypes[0]).toBe("execution_start");
    expect(eventTypes[eventTypes.length - 1]).toBe("execution_end");
    expect(eventTypes.filter((type) => type === "step_start")).toHaveLength(4);
    expect(eventTypes.filter((type) => type === "step_end")).toHaveLength(4);
    expect(eventTypes.filter((type) => type === "consensus_vote")).toHaveLength(3);
    expect(eventTypes.filter((type) => type === "consensus_result")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "gate_wait")).toHaveLength(1);
    expect(eventTypes.filter((type) => type === "gate_resolve")).toHaveLength(1);
  });

  it("enforces policy rules for allowed/denied tools", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const policy = await runner.verifyPolicy();
    expect(policy.allow.type).toBe("allow");
    expect(policy.deny.type).toBe("deny");
    if (policy.deny.type === "deny") {
      expect(policy.deny.rule).toBe("tools.shell_exec");
    }
  });

  it("gate reject → status 'fail' + runState 'failed' + errorCode ESCALATION_FAILED", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-reject",
      gateOutcome: "reject",
      gateComment: "insufficient detail in section 3",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 8, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
    });

    expect(result.status).toBe("fail");
    expect(result.runState).toBe("failed");
    expect(result.finalPass).toBe(false);
    expect(result.errorCode).toBe("ESCALATION_FAILED");
    expect(result.decisionReason).toContain("gate rejected");
    expect(result.decisionReason).toContain("insufficient detail");
    expect(result.reviewPassed).toBe(true);

    const events = await runner.getEvents("doc-gen-reject");
    const gateResolve = events.find((e) => e.type === "gate_resolve");
    expect(gateResolve?.data).toMatchObject({ status: "reject" });
    const execEnd = events.find((e) => e.type === "execution_end");
    expect(execEnd?.data).toMatchObject({ errorCode: "ESCALATION_FAILED", runState: "failed" });
  });

  it("retry exhaustion → status 'fail' + runState 'failed' + errorCode VALIDATION_ERROR", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const failingReview: ReviewAttemptInput = {
      reviews: {
        "reviewer-a": { score: 3, issues: [{ severity: "P0", description: "Critical flaw" }] },
        "reviewer-b": { score: 4, issues: [{ severity: "P1", description: "Major issue" }] },
        "reviewer-c": { score: 3, issues: [{ severity: "P0", description: "Broken logic" }] },
      },
    };

    const result = await runner.run({
      executionId: "doc-gen-exhaust",
      gateOutcome: "approve",
      reviewAttempts: [failingReview, failingReview],
    });

    expect(result.status).toBe("fail");
    expect(result.runState).toBe("failed");
    expect(result.finalPass).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_ERROR");
    expect(result.decisionReason).toContain("peer-review failed");
    expect(result.reviewPassed).toBe(false);
    expect(result.peerReviewAttemptsUsed).toBe(2);

    const events = await runner.getEvents("doc-gen-exhaust");
    const execEnd = events.find((e) => e.type === "execution_end");
    expect(execEnd?.data).toMatchObject({
      status: "failed",
      runState: "failed",
      reason: "peer-review failed",
      errorCode: "VALIDATION_ERROR",
    });
  });

  it("policy enforces sandbox root + deny_outside_root + resource limits from fixture", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const policyResult = await runner.verifyPolicy();

    // file_write is allowed (within sandbox)
    expect(policyResult.allow.type).toBe("allow");

    // shell_exec is denied
    expect(policyResult.deny.type).toBe("deny");
    if (policyResult.deny.type === "deny") {
      expect(policyResult.deny.rule).toBe("tools.shell_exec");
      expect(typeof policyResult.deny.reason).toBe("string");
      expect(policyResult.deny.reason.length).toBeGreaterThan(0);
    }

    // Verify deterministic audit — all policy_check/policy_deny events recorded in order
    const events = await runner.getEvents("policy-check");
    const policyChecks = events.filter((e) => e.type === "policy_check");
    const policyDenies = events.filter((e) => e.type === "policy_deny");
    expect(policyChecks).toHaveLength(2); // file_write + shell_exec
    expect(policyDenies).toHaveLength(1); // only shell_exec denied

    // Verify ordering: policy_check for file_write comes first
    const checkData = policyChecks.map((e) => e.data) as Array<{ toolName: string; decision: string }>;
    expect(checkData[0]).toMatchObject({ toolName: "file_write", decision: "allow" });
    expect(checkData[1]).toMatchObject({ toolName: "shell_exec", decision: "deny" });

    // Verify deny event has correct tool name
    const denyData = policyDenies[0].data as { toolName: string };
    expect(denyData.toolName).toBe("shell_exec");

    // Verify the raw policy YAML has sandbox/resources sections
    const policyYaml = await readFile(policyPath, "utf8");
    const parsedPolicy = parse(policyYaml) as Record<string, unknown>;
    expect(parsedPolicy).toHaveProperty("sandbox");
    expect(parsedPolicy).toHaveProperty("resources");
    const sandbox = parsedPolicy.sandbox as Record<string, unknown>;
    expect(sandbox.root).toBe("./output");
    expect(sandbox.deny_outside_root).toBe(true);
    const resources = parsedPolicy.resources as Record<string, unknown>;
    expect(resources.max_tokens).toBe(100000);
    expect(resources.max_cost_usd).toBe(10);
  });

  it("happy path result includes all M2-01R contract fields", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-contract",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 8, issues: [] },
            "reviewer-b": { score: 9, issues: [] },
            "reviewer-c": { score: 8, issues: [] },
          },
        },
      ],
    });

    // M2-01R contract fields
    expect(result.runId).toBe("doc-gen-contract");
    expect(result.workflow).toBe("doc-generation-pipeline");
    expect(result.runState).toBe("done");
    expect(result.finalPass).toBe(true);
    expect(result.errorCode).toBeNull();
    expect(result.decisionReason).toBe("all steps passed and gate approved");
    expect(result.status).toBe("pass");

    // Verify execution_end event also has contract fields
    const events = await runner.getEvents("doc-gen-contract");
    const execEnd = events.find((e) => e.type === "execution_end");
    expect(execEnd?.data).toMatchObject({
      status: "completed",
      runState: "done",
      finalPass: true,
      errorCode: null,
    });
  });

  it("min_score uses integer 10-point scale — boundary at 7", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    // Verify fixture uses integer scale
    const reviewStep = workflow.steps.find((s) => s.name === "peer-review");
    expect(reviewStep?.config?.min_score).toBe(7); // integer, not 0.7

    // score=7 boundary → pass
    const boundaryResult = await runner.run({
      executionId: "doc-gen-boundary",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 7, issues: [] },
            "reviewer-b": { score: 7, issues: [] },
            "reviewer-c": { score: 7, issues: [] },
          },
        },
      ],
    });
    expect(boundaryResult.status).toBe("pass");
    expect(boundaryResult.reviewPassed).toBe(true);
    expect(boundaryResult.runState).toBe("done");

    // score=6 → fail
    const belowResult = await runner.run({
      executionId: "doc-gen-below",
      gateOutcome: "approve",
      reviewAttempts: [
        {
          reviews: {
            "reviewer-a": { score: 6, issues: [] },
            "reviewer-b": { score: 6, issues: [] },
            "reviewer-c": { score: 6, issues: [] },
          },
        },
      ],
    });
    expect(belowResult.status).toBe("fail");
    expect(belowResult.reviewPassed).toBe(false);
    expect(belowResult.errorCode).toBe("VALIDATION_ERROR");
  });

  it("errorCode is correctly mapped for each failure mode", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);

    // VALIDATION_ERROR
    const r1 = new DocGenE2ERunner(workflow, policySet);
    const reviewFail = await r1.run({
      executionId: "err-review",
      gateOutcome: "approve",
      reviewAttempts: [
        { reviews: { "reviewer-a": { score: 2, issues: [] }, "reviewer-b": { score: 2, issues: [] }, "reviewer-c": { score: 2, issues: [] } } },
      ],
    });
    expect(reviewFail.errorCode).toBe("VALIDATION_ERROR");

    // ESCALATION_FAILED
    const r2 = new DocGenE2ERunner(workflow, policySet);
    const gateReject = await r2.run({
      executionId: "err-reject",
      gateOutcome: "reject",
      reviewAttempts: [
        { reviews: { "reviewer-a": { score: 8, issues: [] }, "reviewer-b": { score: 8, issues: [] }, "reviewer-c": { score: 8, issues: [] } } },
      ],
    });
    expect(gateReject.errorCode).toBe("ESCALATION_FAILED");

    // TIMEOUT
    const r3 = new DocGenE2ERunner(workflow, policySet);
    const gateTimeout = await r3.run({
      executionId: "err-timeout",
      gateOutcome: "timeout",
      reviewAttempts: [
        { reviews: { "reviewer-a": { score: 8, issues: [] }, "reviewer-b": { score: 8, issues: [] }, "reviewer-c": { score: 8, issues: [] } } },
      ],
    });
    expect(gateTimeout.errorCode).toBe("TIMEOUT");

    // null on success
    const r4 = new DocGenE2ERunner(workflow, policySet);
    const success = await r4.run({
      executionId: "err-none",
      gateOutcome: "approve",
      reviewAttempts: [
        { reviews: { "reviewer-a": { score: 9, issues: [] }, "reviewer-b": { score: 9, issues: [] }, "reviewer-c": { score: 9, issues: [] } } },
      ],
    });
    expect(success.errorCode).toBeNull();
  });

  it("covers skipped runState via policy skip simulation", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-skipped",
      gateOutcome: "approve",
      reviewAttempts: [],
      simulateSkip: true,
    });

    expect(result.runState).toBe("skipped");
    expect(result.status).toBe("pass");
    expect(result.errorCode).toBeNull();
  });

  it("covers needs-human-review runState simulation", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);
    const runner = new DocGenE2ERunner(workflow, policySet);

    const result = await runner.run({
      executionId: "doc-gen-needs-human-review",
      gateOutcome: "approve",
      reviewAttempts: [],
      simulateNeedsHumanReview: true,
    });

    expect(result.runState).toBe("needs-human-review");
    expect(result.status).toBe("fail");
    expect(result.finalPass).toBeNull();
    expect(result.errorCode).toBe("ESCALATION_FAILED");
    expect(result.workflowState).toBe("running");
  });

  it("covers RESOLVE_ERROR and MALFORMED_JSON mappings", async () => {
    const { workflow, policyPath } = await loadFixtures();
    const policySet = await loadPolicyFromYaml(policyPath);

    const r1 = new DocGenE2ERunner(workflow, policySet);
    const resolveErr = await r1.run({
      executionId: "err-resolve",
      gateOutcome: "approve",
      reviewAttempts: [],
      simulateResolveError: true,
    });
    expect(resolveErr.errorCode).toBe("RESOLVE_ERROR");
    expect(resolveErr.runState).toBe("failed");

    const r2 = new DocGenE2ERunner(workflow, policySet);
    const malformed = await r2.run({
      executionId: "err-malformed",
      gateOutcome: "approve",
      reviewAttempts: [],
      simulateMalformedJson: true,
    });
    expect(malformed.errorCode).toBe("MALFORMED_JSON");
    expect(malformed.runState).toBe("failed");
  });

});

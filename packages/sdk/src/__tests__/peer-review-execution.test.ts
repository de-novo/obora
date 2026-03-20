import { describe, expect, it, vi } from "vitest";

import { StepExecutor, type LLMAdapterLike } from "../step-executor.js";
import {
  parseVote,
  parseReviewerScore,
  parseReviewerIssues,
  buildPeerReviewSummary,
  evaluatePeerReview,
  executeReviewersInParallel,
  extractPeerReviewConfig,
  type Vote,
  type ReviewerScore,
  type PeerReviewStepResult,
} from "../execution/peer-review-executor.js";

// ── Unit tests for parsing helpers ────────────────────────────────────────

describe("parseVote", () => {
  it("parses APPROVE", () => {
    expect(parseVote("APPROVE: looks good")).toBe("APPROVE");
  });

  it("parses REJECT", () => {
    expect(parseVote("REJECT: not acceptable")).toBe("REJECT");
  });

  it("parses REQUEST_CHANGES", () => {
    expect(parseVote("REQUEST_CHANGES: needs work")).toBe("REQUEST_CHANGES");
  });

  it("defaults to REQUEST_CHANGES for ambiguous text", () => {
    expect(parseVote("this looks fine")).toBe("REQUEST_CHANGES");
  });

  it("prioritizes REQUEST_CHANGES over APPROVE", () => {
    expect(parseVote("APPROVE but REQUEST_CHANGES needed")).toBe("REQUEST_CHANGES");
  });
});

describe("parseReviewerScore", () => {
  it("extracts explicit score", () => {
    expect(parseReviewerScore("Score: 85\nLooks good", "APPROVE")).toBe(85);
  });

  it("extracts score with /100 suffix", () => {
    expect(parseReviewerScore("score: 72/100", "APPROVE")).toBe(72);
  });

  it("extracts score with = separator", () => {
    expect(parseReviewerScore("score=90", "APPROVE")).toBe(90);
  });

  it("clamps score to 0-100 range", () => {
    expect(parseReviewerScore("Score: 150", "APPROVE")).toBe(100);
  });

  it("derives score from APPROVE vote when no explicit score", () => {
    expect(parseReviewerScore("Looks great!", "APPROVE")).toBe(80);
  });

  it("derives score from REJECT vote when no explicit score", () => {
    expect(parseReviewerScore("Not good", "REJECT")).toBe(20);
  });

  it("derives score from REQUEST_CHANGES vote when no explicit score", () => {
    expect(parseReviewerScore("Needs work", "REQUEST_CHANGES")).toBe(50);
  });
});

describe("parseReviewerIssues", () => {
  it("extracts P0 issues", () => {
    const issues = parseReviewerIssues("P0: Critical security vulnerability\nP1: Missing tests");
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({ severity: "P0", description: "Critical security vulnerability" });
    expect(issues[1]).toEqual({ severity: "P1", description: "Missing tests" });
  });

  it("handles dash separator", () => {
    const issues = parseReviewerIssues("P0 - Memory leak in connection pool");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("P0");
  });

  it("handles en-dash separator", () => {
    const issues = parseReviewerIssues("P2 – Minor style issue");
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe("P2");
  });

  it("returns empty array when no issues found", () => {
    expect(parseReviewerIssues("Everything looks fine")).toEqual([]);
  });

  it("normalizes severity to uppercase", () => {
    const issues = parseReviewerIssues("p0: something critical");
    expect(issues[0]!.severity).toBe("P0");
  });
});

// ── Scoring & quorum ──────────────────────────────────────────────────────

describe("buildPeerReviewSummary", () => {
  it("calculates average score and counts", () => {
    const votes: Vote[] = [
      { participant: "a", vote: "APPROVE", response: "" },
      { participant: "b", vote: "APPROVE", response: "" },
      { participant: "c", vote: "REJECT", response: "" },
    ];
    const scores: ReviewerScore[] = [
      { reviewer: "a", score: 90, issues: [] },
      { reviewer: "b", score: 80, issues: [{ severity: "P1", description: "x" }] },
      { reviewer: "c", score: 40, issues: [{ severity: "P0", description: "y" }] },
    ];

    const summary = buildPeerReviewSummary(votes, scores);

    expect(summary.averageScore).toBeCloseTo(70, 1);
    expect(summary.approveCount).toBe(2);
    expect(summary.totalReviewers).toBe(3);
    expect(summary.p0Count).toBe(1);
  });

  it("handles empty inputs", () => {
    const summary = buildPeerReviewSummary([], []);
    expect(summary.averageScore).toBe(0);
    expect(summary.approveCount).toBe(0);
    expect(summary.totalReviewers).toBe(0);
    expect(summary.p0Count).toBe(0);
  });
});

describe("evaluatePeerReview", () => {
  it("passes when all criteria met", () => {
    const summary = { averageScore: 85, approveCount: 2, totalReviewers: 3, p0Count: 0 };
    const result = evaluatePeerReview(summary, { min_score: 70, max_p0: 0, quorum: 2 });
    expect(result.passed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("fails when score below threshold", () => {
    const summary = { averageScore: 50, approveCount: 3, totalReviewers: 3, p0Count: 0 };
    const result = evaluatePeerReview(summary, { min_score: 70 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("score");
  });

  it("fails when P0 count exceeds max", () => {
    const summary = { averageScore: 90, approveCount: 3, totalReviewers: 3, p0Count: 2 };
    const result = evaluatePeerReview(summary, { max_p0: 0 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("P0");
  });

  it("fails when quorum not met", () => {
    const summary = { averageScore: 90, approveCount: 1, totalReviewers: 3, p0Count: 0 };
    const result = evaluatePeerReview(summary, { quorum: 2 });
    expect(result.passed).toBe(false);
    expect(result.reasons[0]).toContain("Quorum");
  });

  it("supports fractional quorum", () => {
    const summary = { averageScore: 90, approveCount: 2, totalReviewers: 4, p0Count: 0 };
    const result = evaluatePeerReview(summary, { quorum: 0.5 });
    expect(result.passed).toBe(true);
  });

  it("uses defaults when config is empty", () => {
    // Default: min_score=70, max_p0=0, strict majority quorum
    const summary = { averageScore: 80, approveCount: 2, totalReviewers: 3, p0Count: 0 };
    const result = evaluatePeerReview(summary, {});
    expect(result.passed).toBe(true);
  });
});

// ── executeReviewersInParallel ────────────────────────────────────────────

describe("executeReviewersInParallel", () => {
  it("executes all participants and returns results", async () => {
    const results = await executeReviewersInParallel(
      ["a", "b", "c"],
      async (p) => `result_${p}`,
      10,
    );

    expect(results).toHaveLength(3);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(results.map((r) => r.participant)).toEqual(["a", "b", "c"]);
  });

  it("respects maxConcurrency", async () => {
    let active = 0;
    let maxObserved = 0;

    const results = await executeReviewersInParallel(
      ["a", "b", "c", "d"],
      async (p) => {
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        await new Promise((r) => setTimeout(r, 10));
        active -= 1;
        return p;
      },
      2,
    );

    expect(results).toHaveLength(4);
    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("handles partial failures without blocking others", async () => {
    const results = await executeReviewersInParallel(
      ["ok_a", "fail_b", "ok_c"],
      async (p) => {
        if (p === "fail_b") throw new Error("boom");
        return p;
      },
      10,
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.participant).toBe("fail_b");
  });
});

// ── extractPeerReviewConfig ───────────────────────────────────────────────

describe("extractPeerReviewConfig", () => {
  it("extracts all fields", () => {
    const config = extractPeerReviewConfig({
      min_score: 80,
      max_p0: 1,
      quorum: 2,
      parallel: false,
      maxConcurrency: 5,
    });

    expect(config).toEqual({
      min_score: 80,
      max_p0: 1,
      quorum: 2,
      parallel: false,
      maxConcurrency: 5,
    });
  });

  it("returns empty config for undefined input", () => {
    expect(extractPeerReviewConfig(undefined)).toEqual({});
  });

  it("ignores non-numeric values", () => {
    const config = extractPeerReviewConfig({
      min_score: "high",
      max_p0: null,
      quorum: "majority",
    });

    expect(config.min_score).toBeUndefined();
    expect(config.max_p0).toBeUndefined();
    expect(config.quorum).toBeUndefined();
  });
});

// ── Integration: StepExecutor peer-review ─────────────────────────────────

describe("StepExecutor peer-review", () => {
  it("runs reviewers in parallel and returns structured result", async () => {
    const callOrder: string[] = [];
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockImplementation(async ({ messages }) => {
        const userMsg = messages.find((m) => m.role === "user")?.content ?? "";
        // Simulate slight delay to test parallelism
        await new Promise((r) => setTimeout(r, 5));

        if (typeof userMsg === "string" && userMsg.includes("reviewer_a")) {
          callOrder.push("a");
        } else if (typeof userMsg === "string" && userMsg.includes("reviewer_b")) {
          callOrder.push("b");
        } else if (typeof userMsg === "string" && userMsg.includes("reviewer_c")) {
          callOrder.push("c");
        }

        return {
          message: {
            role: "assistant" as const,
            content: "APPROVE\nScore: 85\nP1: Minor style issue",
          },
        };
      });

    const events: Array<{ event: string; data: unknown }> = [];
    const executor = new StepExecutor({ chatCompletion }, new Map(), {
      onEvent: async (event, data) => {
        events.push({ event, data });
      },
    });

    const result = (await executor.executeStep(
      {
        name: "review_code",
        pattern: "peer-review",
        participants: ["reviewer_a", "reviewer_b", "reviewer_c"],
        input: { task: "Review the generated code" },
        config: { min_score: 70, max_p0: 0, quorum: 2 },
      },
      { previousOutputs: {} },
    )) as PeerReviewStepResult;

    expect(result.passed).toBe(true);
    expect(result.votes).toHaveLength(3);
    expect(result.scores).toHaveLength(3);
    expect(result.summary.averageScore).toBe(85);
    expect(result.summary.approveCount).toBe(3);
    expect(result.summary.p0Count).toBe(0);
    expect(result.output).toContain("[reviewer_a] APPROVE");

    // Check peer_review_vote events were emitted
    const voteEvents = events.filter((e) => e.event === "peer_review_vote");
    expect(voteEvents).toHaveLength(3);

    // Check peer_review_result event
    const resultEvents = events.filter((e) => e.event === "peer_review_result");
    expect(resultEvents).toHaveLength(1);
    expect((resultEvents[0]!.data as { passed: boolean }).passed).toBe(true);
  });

  it("fails when average score below threshold", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "APPROVE\nScore: 40" },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "low_score_review",
          pattern: "peer-review",
          participants: ["r1", "r2"],
          input: { task: "Review" },
          config: { min_score: 70 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("score");
  });

  it("fails when P0 issues exceed max", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: {
        role: "assistant",
        content: "APPROVE\nScore: 90\nP0: Critical security flaw\nP0: Data loss risk",
      },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "p0_review",
          pattern: "peer-review",
          participants: ["r1", "r2"],
          input: { task: "Review" },
          config: { min_score: 70, max_p0: 0 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("P0");
  });

  it("fails when quorum not met", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE\nScore: 90" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT\nScore: 90" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "REJECT\nScore: 90" } });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "quorum_review",
          pattern: "peer-review",
          participants: ["r1", "r2", "r3"],
          input: { task: "Review" },
          config: { min_score: 70, max_p0: 0, quorum: 2 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("Quorum");
  });

  it("falls back to sequential when parallel=false", async () => {
    const callOrder: string[] = [];
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async () => {
      return {
        message: { role: "assistant" as const, content: "APPROVE\nScore: 85" },
      };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {
      onEvent: async (event, data) => {
        if (event === "peer_review_vote") {
          callOrder.push((data as { participant: string }).participant);
        }
      },
    });

    const result = (await executor.executeStep(
      {
        name: "sequential_review",
        pattern: "peer-review",
        participants: ["r1", "r2", "r3"],
        input: { task: "Review" },
        config: { min_score: 70, max_p0: 0, parallel: false },
      },
      { previousOutputs: {} },
    )) as PeerReviewStepResult;

    expect(result.passed).toBe(true);
    // Sequential order is preserved
    expect(callOrder).toEqual(["r1", "r2", "r3"]);
  });

  it("handles partial reviewer failures gracefully in parallel mode", async () => {
    let callCount = 0;
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async () => {
      callCount++;
      // Second call fails
      if (callCount === 2) {
        throw new Error("LLM timeout");
      }
      return {
        message: { role: "assistant" as const, content: "APPROVE\nScore: 85" },
      };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    // With 2 of 3 reviewers succeeding and quorum=2, this should pass
    const result = (await executor.executeStep(
      {
        name: "partial_failure_review",
        pattern: "peer-review",
        participants: ["r1", "r2", "r3"],
        input: { task: "Review" },
        config: { min_score: 70, max_p0: 0, quorum: 2 },
      },
      { previousOutputs: {} },
    )) as PeerReviewStepResult;

    expect(result.passed).toBe(true);
    expect(result.votes).toHaveLength(2);
    expect(result.summary.totalReviewers).toBe(2);
  });

  it("throws when no participants provided", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>();
    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "no_participants",
          pattern: "peer-review",
          participants: [],
          input: { task: "Review" },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("requires participants");
  });

  it("applies consensus timeout to peer-review step", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 100));
      return { message: { role: "assistant", content: "APPROVE\nScore: 85" } };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await expect(
      executor.executeStep(
        {
          name: "timeout_review",
          pattern: "peer-review",
          participants: ["r1", "r2", "r3"],
          input: { task: "Review" },
          config: { llmTimeoutMs: 500, consensusTimeoutMs: 30 },
        },
        { previousOutputs: {} },
      ),
    ).rejects.toThrow("Peer review timed out");
  });

  it("consensus pattern still routes to old executeConsensusStep", async () => {
    const chatCompletion = vi
      .fn<LLMAdapterLike["chatCompletion"]>()
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE: good" } })
      .mockResolvedValueOnce({ message: { role: "assistant", content: "APPROVE: good" } });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    const result = await executor.executeStep(
      {
        name: "consensus_step",
        pattern: "consensus",
        participants: ["r1", "r2"],
        input: { task: "Review" },
      },
      { previousOutputs: {} },
    );

    // Consensus result format: no scores, no summary, no passed
    expect(result.votes).toHaveLength(2);
    expect(result.output).toContain("[r1] APPROVE");
    expect((result as PeerReviewStepResult).scores).toBeUndefined();
    expect((result as PeerReviewStepResult).passed).toBeUndefined();
  });

  it("respects maxConcurrency config", async () => {
    let active = 0;
    let maxObserved = 0;

    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockImplementation(async () => {
      active++;
      maxObserved = Math.max(maxObserved, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return {
        message: { role: "assistant" as const, content: "APPROVE\nScore: 85" },
      };
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    await executor.executeStep(
      {
        name: "concurrency_review",
        pattern: "peer-review",
        participants: ["r1", "r2", "r3", "r4", "r5"],
        input: { task: "Review" },
        config: { min_score: 70, max_p0: 0, maxConcurrency: 2 },
      },
      { previousOutputs: {} },
    );

    expect(maxObserved).toBeLessThanOrEqual(2);
  });

  it("includes score in merged output text", async () => {
    const chatCompletion = vi.fn<LLMAdapterLike["chatCompletion"]>().mockResolvedValue({
      message: { role: "assistant", content: "APPROVE\nScore: 92\nGreat work!" },
    });

    const executor = new StepExecutor({ chatCompletion }, new Map(), {});

    const result = (await executor.executeStep(
      {
        name: "score_output",
        pattern: "peer-review",
        participants: ["r1"],
        input: { task: "Review" },
        config: { min_score: 70, max_p0: 0 },
      },
      { previousOutputs: {} },
    )) as PeerReviewStepResult;

    expect(result.output).toContain("score: 92");
  });
});

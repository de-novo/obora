import { describe, expect, it, vi } from "vitest";

import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import { PeerReviewPattern } from "./PeerReviewPattern.js";

describe("PeerReviewPattern", () => {
  it("passes when average score meets min_score and p0 count is within allowed", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        reviewerA: "agent-a",
        reviewerB: "agent-b",
      },
      config: {
        min_score: 0.8,
        p0_allowed: 0,
      },
      input: {
        subject: "PR#123",
        reviews: {
          reviewerA: {
            score: 0.9,
            issues: [{ severity: "P1", description: "naming" }],
          },
          reviewerB: {
            score: 0.8,
            issues: [{ severity: "P2", description: "comment" }],
          },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      status: "pass",
      review: {
        report: {
          issue_counts: { P0: 0, P1: 1, P2: 1 },
        },
      },
    });
    const averageScore = (result.output as { review: { report: { average_score: number } } }).review.report.average_score;
    expect(averageScore).toBeCloseTo(0.85, 10);
    expect(result.metadata?.blackboard_domains).toEqual(["decision", "consensus-rule-engine"]);
  });

  it("fails when average score is below min_score", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        reviewerA: "agent-a",
        reviewerB: "agent-b",
      },
      config: {
        min_score: 0.9,
      },
      input: {
        reviews: {
          reviewerA: {
            score: 0.7,
            issues: [],
          },
          reviewerB: {
            score: 0.8,
            issues: [],
          },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "fail",
      reason: "score_below_threshold",
      error_codes: [OboraErrorCode.CONSENSUS_FAIL],
    });
  });

  it("fails when p0 count exceeds p0_allowed", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        reviewerA: "agent-a",
      },
      config: {
        min_score: 0,
        p0_allowed: 0,
      },
      input: {
        reviews: {
          reviewerA: {
            score: 1,
            issues: [{ severity: "P0", description: "critical bug" }],
          },
        },
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "fail",
      reason: "p0_exceeded",
      error_codes: [OboraErrorCode.CONSENSUS_FAIL],
      review: {
        report: {
          issue_counts: {
            P0: 1,
          },
        },
      },
    });
  });

  it("repeats rounds up to max_rounds and uses later round reviews", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        required: "agent-a",
        optional: "agent-b",
      },
      config: {
        max_rounds: 2,
      },
      input: {
        rounds: [
          {
            reviews: {
              optional: { score: 0.4, issues: [] },
            },
          },
          {
            reviews: {
              required: { score: 0.9, issues: [] },
              optional: { score: 0.8, issues: [] },
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.output).toMatchObject({
      review: {
        final_round: 2,
      },
    });
    const averageScore = (result.output as { review: { report: { average_score: number } } }).review.report.average_score;
    expect(averageScore).toBeCloseTo(0.85, 10);
  });

  it("allows best_effort reviewers to be missing", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        required: "agent-a",
        bestEffort: "agent-b",
      },
      config: {
        best_effort: ["bestEffort"],
        min_score: 0.5,
      },
      input: {
        reviews: {
          required: { score: 0.7, issues: [] },
        },
      },
    });

    expect(result.success).toBe(true);
    expect(result.metadata).toMatchObject({
      best_effort_reviewers: ["bestEffort"],
    });
  });

  it("fails with quorum_not_met when required reviewers do not respond within max_rounds", async () => {
    const pattern = new PeerReviewPattern();

    const result = await pattern.execute({
      pattern: "peer-review",
      participants: {
        requiredA: "agent-a",
        requiredB: "agent-b",
      },
      config: {
        max_rounds: 2,
      },
      input: {
        rounds: [
          {
            reviews: {
              requiredA: { score: 0.8, issues: [] },
            },
          },
          {
            reviews: {
              requiredA: { score: 0.9, issues: [] },
            },
          },
        ],
      },
    });

    expect(result.success).toBe(false);
    expect(result.output).toMatchObject({
      status: "fail",
      reason: "quorum_not_met",
      error_codes: [OboraErrorCode.CONSENSUS_FAIL],
    });
  });

  it("emits round and result events", async () => {
    const pattern = new PeerReviewPattern();
    const emit = vi.fn();

    await pattern.execute({
      pattern: "peer-review",
      participants: {
        reviewer: "agent-a",
      },
      input: {
        reviews: {
          reviewer: { score: 1, issues: [] },
        },
      },
      emit,
    });

    expect(emit.mock.calls.map((call) => call[0].type)).toEqual([
      "peer_review_round_start",
      "peer_review_round_end",
      "peer_review_result",
    ]);
  });

  it("throws CONSENSUS_TIMEOUT when required reviewers remain missing after timeout", async () => {
    const pattern = new PeerReviewPattern();

    await expect(
      pattern.execute({
        pattern: "peer-review",
        participants: {
          requiredA: "agent-a",
          requiredB: "agent-b",
        },
        config: {
          max_rounds: 1,
          timeout: "1s",
        } as never,
        input: {
          startedAt: "2026-02-16T23:59:00.000Z",
          reviews: {
            requiredA: { score: 0.8, issues: [] },
          },
        },
        now: () => new Date("2026-02-17T00:00:10.000Z"),
      } as never)
    ).rejects.toMatchObject({ code: OboraErrorCode.CONSENSUS_TIMEOUT });
  });

  it("validates config", () => {
    const pattern = new PeerReviewPattern();

    expect(() => pattern.validateConfig({ min_score: 0 })).not.toThrow();
    expect(() => pattern.validateConfig({ min_score: -1 })).toThrow("peer-review.min_score must be a finite number >= 0");
    expect(() => pattern.validateConfig({ p0_allowed: -1 })).toThrow("peer-review.p0_allowed must be an integer >= 0");
    expect(() => pattern.validateConfig({ max_rounds: 0 })).toThrow("peer-review.max_rounds must be an integer >= 1");
    expect(() => pattern.validateConfig({ best_effort: [""] })).toThrow(
      "peer-review.best_effort must contain non-empty reviewer ids"
    );
  });

  // === M2-05 Canonical contract regression tests ===

  it("includes canonical runState/finalPass/decisionReason on pass output", async () => {
    const pattern = new PeerReviewPattern();
    const result = await pattern.execute({
      pattern: "peer-review",
      participants: { r: "agent-a" },
      config: { min_score: 0 },
      input: { reviews: { r: { score: 1, issues: [] } } },
    });

    expect(result.success).toBe(true);
    const out = result.output as Record<string, unknown>;
    expect(out.runState).toBe("done");
    expect(out.finalPass).toBe(true);
    expect(out.decisionReason).toBe("criteria_satisfied");
    // pass output should not have errorCode
    expect(out.errorCode).toBeUndefined();
  });

  it("includes canonical runState/finalPass/decisionReason/errorCode on fail output", async () => {
    const pattern = new PeerReviewPattern();
    const result = await pattern.execute({
      pattern: "peer-review",
      participants: { r: "agent-a" },
      config: { min_score: 0.9 },
      input: { reviews: { r: { score: 0.5, issues: [] } } },
    });

    expect(result.success).toBe(false);
    const out = result.output as Record<string, unknown>;
    expect(out.runState).toBe("failed");
    expect(out.finalPass).toBe(false);
    expect(out.decisionReason).toBe("score_below_threshold");
    // Single errorCode (not just array)
    expect(out.errorCode).toBe(OboraErrorCode.CONSENSUS_FAIL);
    // Backward compat: error_codes array still present
    expect(out.error_codes).toEqual([OboraErrorCode.CONSENSUS_FAIL]);
  });

  it("includes canonical errorCode on timeout error object", async () => {
    const pattern = new PeerReviewPattern();
    try {
      await pattern.execute({
        pattern: "peer-review",
        participants: { r: "agent-a" },
        config: { max_rounds: 1, timeout: "1s" } as never,
        input: {
          startedAt: "2026-02-16T00:00:00.000Z",
          reviews: { r: { score: 1, issues: [] } },
        },
        now: () => new Date("2026-02-16T00:01:00.000Z"),
      } as never);
      expect.unreachable("should have thrown");
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      expect(e.code).toBe(OboraErrorCode.CONSENSUS_TIMEOUT);
      expect(e.errorCode).toBe(OboraErrorCode.CONSENSUS_TIMEOUT);
      expect(e.runState).toBe("timeout");
      expect(e.finalPass).toBe(false);
    }
  });

  it("quorum_not_met failure includes canonical fields", async () => {
    const pattern = new PeerReviewPattern();
    const result = await pattern.execute({
      pattern: "peer-review",
      participants: { a: "agent-a", b: "agent-b" },
      config: { max_rounds: 1 },
      input: { rounds: [{ reviews: { a: { score: 1, issues: [] } } }] },
    });

    expect(result.success).toBe(false);
    const out = result.output as Record<string, unknown>;
    expect(out.runState).toBe("failed");
    expect(out.finalPass).toBe(false);
    expect(out.decisionReason).toBe("quorum_not_met");
    expect(out.errorCode).toBe(OboraErrorCode.CONSENSUS_FAIL);
  });
});

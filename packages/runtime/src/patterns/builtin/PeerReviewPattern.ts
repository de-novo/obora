import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
  type PeerReviewPatternConfig,
} from "../types.js";

type IssueSeverity = "P0" | "P1" | "P2";

interface ReviewIssue {
  severity?: unknown;
  description?: unknown;
}

interface RawReview {
  score?: unknown;
  issues?: unknown;
}

interface RoundInput {
  reviews?: Record<string, RawReview>;
}

interface PeerReviewInputShape {
  subject?: unknown;
  startedAt?: string | Date;
  reviews?: Record<string, RawReview>;
  rounds?: RoundInput[];
}

interface NormalizedIssue {
  severity: IssueSeverity;
  description: string;
}

interface NormalizedReview {
  reviewer: string;
  score: number;
  issues: NormalizedIssue[];
}

interface RoundSummary {
  round: number;
  reviewed_by: string[];
  missing_reviewers: string[];
  report: {
    issue_counts: Record<IssueSeverity, number>;
    scores_by_reviewer: Record<string, number[]>;
    average_score: number;
  };
}

const DEFAULT_MIN_SCORE = 0;
const DEFAULT_P0_ALLOWED = 0;
const DEFAULT_MAX_ROUNDS = 1;

export class PeerReviewPattern extends CollaborationPatternBase {
  readonly name = "peer-review";
  readonly kind: BuiltinPatternKind = "peer-review";

  validateConfig(config: PeerReviewPatternConfig & { timeout?: string }): void {
    if (config.min_score !== undefined && (!Number.isFinite(config.min_score) || config.min_score < 0)) {
      throw new Error("peer-review.min_score must be a finite number >= 0");
    }

    if (config.p0_allowed !== undefined && (!Number.isInteger(config.p0_allowed) || config.p0_allowed < 0)) {
      throw new Error("peer-review.p0_allowed must be an integer >= 0");
    }

    if (config.max_rounds !== undefined && (!Number.isInteger(config.max_rounds) || config.max_rounds < 1)) {
      throw new Error("peer-review.max_rounds must be an integer >= 1");
    }

    if (config.best_effort !== undefined && !Array.isArray(config.best_effort)) {
      throw new Error("peer-review.best_effort must be a string[]");
    }

    if (config.best_effort && config.best_effort.some((reviewer) => typeof reviewer !== "string" || reviewer.trim().length === 0)) {
      throw new Error("peer-review.best_effort must contain non-empty reviewer ids");
    }

    if (config.timeout !== undefined && parseTimeoutToMs(config.timeout) === undefined) {
      throw new Error("peer-review.timeout must match /^(\\d+)(ms|s|m|h)$/");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const reviewers = Object.keys(context.participants ?? {});
    if (reviewers.length === 0) {
      throw new Error("peer-review pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as PeerReviewPatternConfig & { timeout?: string };
    const minScore = config.min_score ?? DEFAULT_MIN_SCORE;
    const p0Allowed = config.p0_allowed ?? DEFAULT_P0_ALLOWED;
    const maxRounds = config.max_rounds ?? DEFAULT_MAX_ROUNDS;
    const bestEffort = new Set(config.best_effort ?? []);

    const requiredReviewers = reviewers.filter((reviewer) => !bestEffort.has(reviewer));
    const input = this.getInput(context);

    const rounds = this.resolveRounds(input, maxRounds);
    const roundSummaries: RoundSummary[] = [];
    let finalReviews: NormalizedReview[] = [];

    for (let index = 0; index < maxRounds; index += 1) {
      const roundNumber = index + 1;
      const round = rounds[index] ?? {};

      await context.emit?.({
        type: "peer_review_round_start",
        payload: {
          round: roundNumber,
          max_rounds: maxRounds,
          required_reviewers: requiredReviewers,
          best_effort_reviewers: [...bestEffort],
        },
      });

      const reviews = this.collectReviews(reviewers, round.reviews);
      const reviewedBy = reviews.map((review) => review.reviewer);
      const missingReviewers = reviewers.filter((reviewer) => !reviewedBy.includes(reviewer));
      const missingRequired = missingReviewers.filter((reviewer) => requiredReviewers.includes(reviewer));

      const report = this.buildReport(reviews);
      roundSummaries.push({
        round: roundNumber,
        reviewed_by: reviewedBy,
        missing_reviewers: missingReviewers,
        report,
      });

      await context.emit?.({
        type: "peer_review_round_end",
        payload: {
          round: roundNumber,
          reviewed_by: reviewedBy,
          missing_reviewers: missingReviewers,
          average_score: report.average_score,
          issue_counts: report.issue_counts,
        },
      });

      if (missingRequired.length > 0) {
        const isLastRound = roundNumber >= maxRounds;
        if (isLastRound) {
          const timeoutMs = parseTimeoutToMs(config.timeout);
          if (timeoutMs !== undefined && this.hasTimedOut(timeoutMs, input.startedAt, context)) {
            await context.emit?.({
              type: "peer_review_result",
              payload: {
                status: "timeout",
                reason: "required_reviewers_timeout",
                missing_required_reviewers: missingRequired,
              },
            });

            throw Object.assign(new Error("peer-review timed out waiting for required reviewers"), {
              code: OboraErrorCode.CONSENSUS_TIMEOUT,
            });
          }
        }

        if (!isLastRound) {
          continue;
        }
      }

      finalReviews = reviews;
      break;
    }

    if (finalReviews.length === 0) {
      const last = roundSummaries.at(-1);
      finalReviews = this.collectReviews(reviewers, rounds[Math.max(0, roundSummaries.length - 1)]?.reviews);
      if (!last) {
        throw new Error("peer-review failed to collect review rounds");
      }
    }

    const finalReport = this.buildReport(finalReviews);
    const passByScore = finalReport.average_score >= minScore;
    const passByP0 = finalReport.issue_counts.P0 <= p0Allowed;
    const passed = passByScore && passByP0;

    await context.emit?.({
      type: "peer_review_result",
      payload: {
        status: passed ? "pass" : "fail",
        reason: passed ? "criteria_satisfied" : "criteria_not_satisfied",
        average_score: finalReport.average_score,
        min_score: minScore,
        p0_count: finalReport.issue_counts.P0,
        p0_allowed: p0Allowed,
      },
    });

    return {
      success: passed,
      output: {
        status: passed ? "pass" : "fail",
        reason: passed ? undefined : OboraErrorCode.CONSENSUS_FAIL,
        subject: input.subject,
        review: {
          rounds: roundSummaries,
          final_round: roundSummaries.at(-1)?.round ?? 0,
          criteria: {
            min_score: minScore,
            p0_allowed: p0Allowed,
          },
          report: finalReport,
        },
      },
      metadata: {
        blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP["peer-review"],
        decision: passed ? "PASS" : "FAIL",
        max_rounds: maxRounds,
        best_effort_reviewers: [...bestEffort],
      },
    };
  }

  private getInput(context: PatternRuntimeContext): PeerReviewInputShape {
    if (!context.input || typeof context.input !== "object") {
      return {};
    }

    return context.input as PeerReviewInputShape;
  }

  private resolveRounds(input: PeerReviewInputShape, maxRounds: number): RoundInput[] {
    if (Array.isArray(input.rounds) && input.rounds.length > 0) {
      return input.rounds.slice(0, maxRounds);
    }

    return [{ reviews: input.reviews }];
  }

  private collectReviews(reviewers: string[], rawReviews: Record<string, RawReview> | undefined): NormalizedReview[] {
    if (!rawReviews) {
      return [];
    }

    const reviews: NormalizedReview[] = [];

    for (const reviewer of reviewers) {
      if (!(reviewer in rawReviews)) {
        continue;
      }

      const raw = rawReviews[reviewer] ?? {};
      const scoreValue = typeof raw.score === "number" ? raw.score : Number(raw.score ?? 0);
      const score = Number.isFinite(scoreValue) ? scoreValue : 0;

      const issuesArray = Array.isArray(raw.issues) ? raw.issues : [];
      const issues = issuesArray
        .filter((issue): issue is ReviewIssue => !!issue && typeof issue === "object")
        .map((issue) => ({
          severity: normalizeSeverity(issue.severity),
          description: typeof issue.description === "string" ? issue.description : "",
        }));

      reviews.push({
        reviewer,
        score,
        issues,
      });
    }

    return reviews;
  }

  private buildReport(reviews: NormalizedReview[]): {
    issue_counts: Record<IssueSeverity, number>;
    scores_by_reviewer: Record<string, number[]>;
    average_score: number;
  } {
    const issueCounts: Record<IssueSeverity, number> = {
      P0: 0,
      P1: 0,
      P2: 0,
    };

    const scoresByReviewer: Record<string, number[]> = {};
    let scoreTotal = 0;

    for (const review of reviews) {
      scoreTotal += review.score;
      scoresByReviewer[review.reviewer] = [...(scoresByReviewer[review.reviewer] ?? []), review.score];

      for (const issue of review.issues) {
        issueCounts[issue.severity] += 1;
      }
    }

    const average = reviews.length === 0 ? 0 : scoreTotal / reviews.length;

    return {
      issue_counts: issueCounts,
      scores_by_reviewer: scoresByReviewer,
      average_score: average,
    };
  }

  private hasTimedOut(timeoutMs: number, startedAt: Date | string | undefined, context: PatternRuntimeContext): boolean {
    const now = this.resolveNow(context);
    const start = resolveStartTime(startedAt, now);
    return now.getTime() - start.getTime() >= timeoutMs;
  }

  private resolveNow(context: PatternRuntimeContext): Date {
    const nowFn = (context as PatternRuntimeContext & { now?: unknown }).now;
    if (typeof nowFn === "function") {
      const now = nowFn();
      if (now instanceof Date) {
        return now;
      }
    }
    return new Date();
  }
}

function normalizeSeverity(value: unknown): IssueSeverity {
  if (typeof value !== "string") {
    return "P2";
  }

  const upper = value.toUpperCase();
  if (upper === "P0" || upper === "P1" || upper === "P2") {
    return upper;
  }

  return "P2";
}

function parseTimeoutToMs(timeout?: string): number | undefined {
  if (!timeout) {
    return undefined;
  }

  const match = timeout.trim().match(/^(\d+)(ms|s|m|h)$/);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1]);
  const unit = match[2];
  if (unit === "ms") return value;
  if (unit === "s") return value * 1_000;
  if (unit === "m") return value * 60_000;
  return value * 3_600_000;
}

function resolveStartTime(startedAt: Date | string | undefined, fallback: Date): Date {
  if (startedAt instanceof Date) {
    return startedAt;
  }

  if (typeof startedAt === "string") {
    const parsed = new Date(startedAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return fallback;
}

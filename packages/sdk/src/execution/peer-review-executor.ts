import type { StepResult } from "../step-executor-types.js";
import { DEFAULTS } from "../defaults.js";

// ── Types ──────────────────────────────────────────────────────────────────

type IssueSeverity = "P0" | "P1" | "P2";

export interface ReviewerScore {
  reviewer: string;
  score: number;
  issues: Array<{ severity: IssueSeverity; description: string }>;
}

export interface Vote {
  participant: string;
  vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
  response: string;
}

export interface PeerReviewSummary {
  averageScore: number;
  approveCount: number;
  totalReviewers: number;
  p0Count: number;
}

export interface PeerReviewStepResult extends StepResult {
  output: string;
  votes: Vote[];
  scores: ReviewerScore[];
  passed: boolean;
  summary: PeerReviewSummary;
}

export interface PeerReviewStepConfig {
  /** Minimum average score to pass. Default: 70. */
  min_score?: number;
  /** Maximum P0 issues allowed. Default: 0. */
  max_p0?: number;
  /** Number of approvals required, or fraction of total. Default: strict majority. */
  quorum?: number;
  /** Run reviewers in parallel. Default: true. */
  parallel?: boolean;
  /** Max concurrent reviewer LLM calls. Default: 3. */
  maxConcurrency?: number;
}

// ── Response Parsing ───────────────────────────────────────────────────────

const SCORE_PATTERN = /\bscore\s*[:=]\s*(\d+(?:\.\d+)?)\s*(?:\/\s*100)?/i;
const ISSUE_PATTERN = /\b(P[012])\s*[:–-]\s*(.+)/gi;

export function parseVote(text: string): "APPROVE" | "REJECT" | "REQUEST_CHANGES" {
  const normalized = text.toUpperCase();
  if (normalized.includes("REQUEST_CHANGES")) return "REQUEST_CHANGES";
  if (normalized.includes("REJECT")) return "REJECT";
  if (normalized.includes("APPROVE")) return "APPROVE";
  return "REQUEST_CHANGES";
}

export function parseReviewerScore(text: string, vote: string): number {
  const match = SCORE_PATTERN.exec(text);
  if (match) {
    const score = parseFloat(match[1]!);
    if (Number.isFinite(score)) return Math.min(DEFAULTS.PEER_REVIEW_SCORE_MAX, Math.max(DEFAULTS.PEER_REVIEW_SCORE_MIN, score));
  }

  // Derive score from vote if no explicit score found
  switch (vote) {
    case "APPROVE":
      return 80;
    case "REJECT":
      return 20;
    case "REQUEST_CHANGES":
      return 50;
    default:
      return 50;
  }
}

export function parseReviewerIssues(
  text: string,
): Array<{ severity: IssueSeverity; description: string }> {
  return Array.from(text.matchAll(ISSUE_PATTERN)).flatMap((match) => {
    const severity = match[1]!.toUpperCase() as IssueSeverity;
    const description = match[2]!.trim();
    return description.length > 0 ? [{ severity, description }] : [];
  });
}

// ── Scoring & Quorum ───────────────────────────────────────────────────────

export function buildPeerReviewSummary(
  votes: Vote[],
  scores: ReviewerScore[],
): PeerReviewSummary {
  const totalReviewers = scores.length;
  const averageScore =
    totalReviewers === 0
      ? 0
      : scores.reduce((sum, s) => sum + s.score, 0) / totalReviewers;
  const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
  const p0Count = scores.reduce(
    (sum, s) => sum + s.issues.filter((i) => i.severity === "P0").length,
    0,
  );

  return { averageScore, approveCount, totalReviewers, p0Count };
}

export function evaluatePeerReview(
  summary: PeerReviewSummary,
  config: PeerReviewStepConfig,
): { passed: boolean; reasons: string[] } {
  const minScore = config.min_score ?? 70;
  const maxP0 = config.max_p0 ?? 0;
  const reasons: string[] = [];

  const passByScore = summary.averageScore >= minScore;
  if (!passByScore) {
    reasons.push(
      `Average score ${summary.averageScore.toFixed(1)} below threshold ${minScore}`,
    );
  }

  const passByP0 = summary.p0Count <= maxP0;
  if (!passByP0) {
    reasons.push(`P0 count ${summary.p0Count} exceeds max ${maxP0}`);
  }

  const quorumMet = checkQuorum(summary, config);
  if (!quorumMet) {
    reasons.push(
      `Quorum not met: ${summary.approveCount}/${summary.totalReviewers} approvals`,
    );
  }

  return { passed: passByScore && passByP0 && quorumMet, reasons };
}

function checkQuorum(
  summary: PeerReviewSummary,
  config: PeerReviewStepConfig,
): boolean {
  const rawQuorum = config.quorum;
  const total = summary.totalReviewers;

  if (typeof rawQuorum === "number" && Number.isFinite(rawQuorum) && rawQuorum > 0) {
    if (rawQuorum <= 1) {
      // Fraction: e.g. 0.5 = 50%
      const required = Math.min(total, Math.max(1, Math.ceil(total * rawQuorum)));
      return summary.approveCount >= required;
    }
    // Absolute count
    const required = Math.min(total, Math.max(1, Math.ceil(rawQuorum)));
    return summary.approveCount >= required;
  }

  // Default: strict majority (>50%)
  const required = Math.floor(total / 2) + 1;
  return summary.approveCount >= required;
}

// ── Parallel Execution ─────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 3;

/**
 * Run reviewer calls in parallel with concurrency limiting.
 * Uses Promise.allSettled so one failure doesn't cancel others.
 */
export async function executeReviewersInParallel<T>(
  participants: string[],
  executeOne: (participant: string) => Promise<T>,
  maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
): Promise<Array<{ participant: string; status: "fulfilled"; value: T } | { participant: string; status: "rejected"; error: unknown }>> {
  const concurrency = Math.max(1, Math.floor(maxConcurrency));
  const chunks = chunk(participants, concurrency);

  return chunks.reduce<Promise<Array<
    | { participant: string; status: "fulfilled"; value: T }
    | { participant: string; status: "rejected"; error: unknown }
  >>>(async (previousResults, batch) => {
    const results = await previousResults;
    const settled = await Promise.allSettled(
      batch.map(async (participant) => {
        const value = await executeOne(participant);
        return { participant, value };
      }),
    );

    return [
      ...results,
      ...settled.map((entry, index) =>
        entry.status === "fulfilled"
          ? {
          participant: entry.value.participant,
          status: "fulfilled",
          value: entry.value.value,
        } as const
          : {
          participant: batch[index]!,
          status: "rejected",
          error: entry.reason,
        } as const
      ),
    ];
  }, Promise.resolve([]));
}

// ── Utility ────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, index) =>
    arr.slice(index * size, index * size + size)
  );
}

/**
 * Extract PeerReviewStepConfig from step config object.
 */
export function extractPeerReviewConfig(
  config: Record<string, unknown> | undefined,
): PeerReviewStepConfig {
  if (!config) return {};
  return {
    min_score: typeof config.min_score === "number" ? config.min_score : undefined,
    max_p0: typeof config.max_p0 === "number" ? config.max_p0 : undefined,
    quorum: typeof config.quorum === "number" ? config.quorum : undefined,
    parallel: typeof config.parallel === "boolean" ? config.parallel : undefined,
    maxConcurrency:
      typeof config.maxConcurrency === "number" ? config.maxConcurrency : undefined,
  };
}

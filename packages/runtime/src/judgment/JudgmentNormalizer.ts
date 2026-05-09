/**
 * JudgmentNormalizer — normalize raw model output + duplicate latest selection.
 * TASK-M1-26
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NormalizeErrorCode = 'RESOLVE_ERROR' | 'VALIDATION_ERROR' | 'MALFORMED_JSON';

export interface IssueEntry {
  level: 'P0' | 'P1' | 'P2';
  message: string;
}

export interface NormalizeInput {
  rawModelOutput: unknown;
  attempt: number;
  receivedAt?: string;
  ingestSeq: number;
}

export interface NormalizeOutput {
  judgmentStatus: 'pass' | 'fail';
  score: number;
  issues: IssueEntry[];
  errorCode?: NormalizeErrorCode;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Half-up rounding to 2 decimal places.
 */
function roundHalfUp2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clampScore(raw: number): number {
  const clamped = Math.max(0, Math.min(100, raw));
  return roundHalfUp2(clamped);
}

/**
 * Strict ISO-8601 UTC Z regex: YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS.nnnZ
 */
const ISO_UTC_Z_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Parse ISO-8601 receivedAt. Accepts ONLY UTC Z format (e.g. '2026-01-01T00:00:00Z').
 * Returns epoch ms or -Infinity on failure/missing/non-Z format.
 */
export function parseReceivedAt(value?: string): number {
  if (value === undefined || value === null) return -Infinity;
  if (!ISO_UTC_Z_RE.test(value)) return -Infinity;
  const d = new Date(value);
  if (isNaN(d.getTime())) return -Infinity;
  return d.getTime();
}

// ---------------------------------------------------------------------------
// Error-path helper
// ---------------------------------------------------------------------------

function errorOutput(code: NormalizeErrorCode, message: string): NormalizeOutput {
  return {
    judgmentStatus: 'fail',
    score: 0,
    issues: [{ level: 'P1', message }],
    errorCode: code,
  };
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

export class JudgmentNormalizer {
  /**
   * Normalize a single raw model output into deterministic NormalizeOutput.
   */
  normalize(input: NormalizeInput): NormalizeOutput {
    const { rawModelOutput } = input;

    // 1. Parse rawModelOutput
    if (rawModelOutput === null || rawModelOutput === undefined ||
        typeof rawModelOutput === 'number' || typeof rawModelOutput === 'boolean') {
      return errorOutput('MALFORMED_JSON', `rawModelOutput has invalid type: ${String(rawModelOutput)}`);
    }

    const parseResult = (() => {
      if (typeof rawModelOutput === 'string') {
        try {
          const result = JSON.parse(rawModelOutput);
          if (typeof result !== 'object' || result === null || Array.isArray(result)) {
            return { ok: false as const, output: errorOutput('MALFORMED_JSON', 'Parsed JSON is not a plain object') };
          }
          return { ok: true as const, parsed: result as Record<string, unknown> };
        } catch {
          return { ok: false as const, output: errorOutput('MALFORMED_JSON', 'Failed to parse rawModelOutput as JSON') };
        }
      }
      if (typeof rawModelOutput === 'object' && !Array.isArray(rawModelOutput)) {
        return { ok: true as const, parsed: rawModelOutput as Record<string, unknown> };
      }
      return { ok: false as const, output: errorOutput('MALFORMED_JSON', 'rawModelOutput is not a string or object') };
    })();
    if (!parseResult.ok) {
      return parseResult.output;
    }
    const { parsed } = parseResult;

    // 2. Validate judgmentStatus
    const status = parsed['judgmentStatus'] ?? parsed['status'];
    if (status !== 'pass' && status !== 'fail') {
      return errorOutput('VALIDATION_ERROR', `Invalid or missing judgmentStatus: ${JSON.stringify(status)}`);
    }

    // 3. Normalize score
    const rawScore = parsed['score'];
    const score = typeof rawScore === 'number' && !isNaN(rawScore) ? clampScore(rawScore) : 0;

    // 4. Collect issues
    const rawIssues = parsed['issues'];
    const issues: IssueEntry[] = Array.isArray(rawIssues)
      ? rawIssues.flatMap((item) => {
        if (item && typeof item === 'object' && 'level' in item && 'message' in item) {
          const lvl = (item as Record<string, unknown>)['level'];
          const msg = (item as Record<string, unknown>)['message'];
          if ((lvl === 'P0' || lvl === 'P1' || lvl === 'P2') && typeof msg === 'string') {
            return [{ level: lvl, message: msg }];
          }
        }
        return [];
      })
      : [];

    return {
      judgmentStatus: status as 'pass' | 'fail',
      score,
      issues,
    };
  }

  /**
   * Select the latest entry among duplicates.
   * Tie-break: attempt > receivedAt > ingestSeq (all descending / largest wins).
   */
  selectLatest(entries: NormalizeInput[]): NormalizeInput {
    if (entries.length === 0) throw new Error('No entries to select from');
    if (entries.length === 1) return entries[0]!;

    return entries.reduce((best, current) => {
      // 1. attempt — larger wins
      if (current.attempt !== best.attempt) {
        return current.attempt > best.attempt ? current : best;
      }
      // 2. receivedAt — later wins
      const bestRa = parseReceivedAt(best.receivedAt);
      const currRa = parseReceivedAt(current.receivedAt);
      if (currRa !== bestRa) {
        return currRa > bestRa ? current : best;
      }
      // 3. ingestSeq — larger wins
      return current.ingestSeq > best.ingestSeq ? current : best;
    });
  }
}

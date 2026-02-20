export interface SchemaAISuggestion {
  input: string;
  normalized?: string;
  valid: boolean;
  reason?: string;
  suggestions: string[];
}

export function normalizeTag(tag: string): string {
  const parts = tag.split(".").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return tag;
  const [domain, ...rest] = parts;
  const normalizedDomain = domain.length > 0 ? domain[0]!.toUpperCase() + domain.slice(1).toLowerCase() : domain;
  const normalizedRest = rest.map((p) => p.toLowerCase());
  return [normalizedDomain, ...normalizedRest].join(".");
}

function scoreSimilarity(input: string, candidate: string): number {
  const a = normalizeTag(input);
  const b = normalizeTag(candidate);
  if (a === b) return 1;
  const aParts = a.split(".");
  const bParts = b.split(".");
  let score = 0;
  for (let i = 0; i < Math.min(aParts.length, bParts.length); i++) {
    if (aParts[i] === bParts[i]) score += 0.4;
  }
  if (b.includes(aParts[aParts.length - 1] ?? "")) score += 0.2;
  return score;
}

export function suggestTags(inputTag: string, examples: string[], limit = 3): string[] {
  return [...examples]
    .map((tag) => ({ tag, score: scoreSimilarity(inputTag, tag) }))
    .sort((a, b) => b.score - a.score)
    .filter((x) => x.score > 0)
    .slice(0, limit)
    .map((x) => x.tag);
}

export function validateAndSuggestTag(inputTag: string, pattern: RegExp, examples: string[]): SchemaAISuggestion {
  const normalized = normalizeTag(inputTag);
  const valid = pattern.test(normalized);

  if (valid) {
    return {
      input: inputTag,
      normalized,
      valid: true,
      suggestions: normalized === inputTag ? [] : [normalized],
    };
  }

  const parts = normalized.split(".");
  const reason = parts.length < 3 ? "depth 부족" : parts.length > 3 ? "depth 초과" : "패턴 불일치";
  const suggestions = suggestTags(normalized, examples);

  return {
    input: inputTag,
    normalized,
    valid: false,
    reason,
    suggestions,
  };
}

export type ConflictReasonCode = "depth_short" | "depth_long" | "pattern_mismatch" | "domain_not_allowed" | "low_confidence";

export interface TagMergeConflict {
  input: string;
  reason: string;
  reasonCode: ConflictReasonCode;
  suggestions: string[];
}

export interface TagMergeResult {
  merged: string[];
  conflicts: TagMergeConflict[];
}

export interface TagMergeOptions {
  allowedDomains?: string[];
  autoMergeThreshold?: number;
  maxSuggestions?: number;
}

/**
 * SchemaAI v3: normalize + validate + policy-based conflict resolution
 */
export function mergeTagsWithConflictResolution(
  inputTags: string[],
  pattern: RegExp,
  examples: string[],
  options: TagMergeOptions = {},
): TagMergeResult {
  const mergedSet = new Set<string>();
  const conflicts: TagMergeConflict[] = [];

  const allowed = new Set((options.allowedDomains ?? []).map((d) => d.toLowerCase()));
  const threshold = options.autoMergeThreshold ?? 0.75;
  const maxSuggestions = options.maxSuggestions ?? 3;

  for (const raw of inputTags) {
    const check = validateAndSuggestTag(raw, pattern, examples);
    const normalized = check.normalized ?? normalizeTag(raw);
    const domain = normalized.split(".")[0]?.toLowerCase() ?? "";

    if (check.valid && normalized) {
      if (allowed.size > 0 && !allowed.has(domain)) {
        conflicts.push({
          input: raw,
          reason: "허용되지 않은 도메인",
          reasonCode: "domain_not_allowed",
          suggestions: [],
        });
        continue;
      }
      mergedSet.add(normalized);
      continue;
    }

    const scored = suggestTags(normalized, examples, maxSuggestions).map((tag) => ({
      tag,
      score: scoreSimilarity(normalized, tag),
    }));

    const reasonCode: ConflictReasonCode = check.reason?.includes("부족")
      ? "depth_short"
      : check.reason?.includes("초과")
        ? "depth_long"
        : "pattern_mismatch";

    const conflict: TagMergeConflict = {
      input: raw,
      reason: check.reason ?? "invalid",
      reasonCode,
      suggestions: scored.map((s) => s.tag),
    };

    const best = scored[0];
    if (best && best.score >= threshold) {
      const bestDomain = best.tag.split(".")[0]?.toLowerCase() ?? "";
      if (allowed.size === 0 || allowed.has(bestDomain)) {
        mergedSet.add(best.tag);
      } else {
        conflict.reason = "허용되지 않은 도메인";
        conflict.reasonCode = "domain_not_allowed";
      }
    } else if (best) {
      conflict.reason = "자동 병합 임계치 미달";
      conflict.reasonCode = "low_confidence";
    }

    conflicts.push(conflict);
  }

  return {
    merged: Array.from(mergedSet),
    conflicts,
  };
}

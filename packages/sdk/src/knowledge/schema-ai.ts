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

export interface TagMergeResult {
  merged: string[];
  conflicts: Array<{ input: string; reason: string; suggestions: string[] }>;
}

/**
 * SchemaAI v2: normalize + validate + conflict reporting
 */
export function mergeTagsWithConflictResolution(
  inputTags: string[],
  pattern: RegExp,
  examples: string[],
): TagMergeResult {
  const mergedSet = new Set<string>();
  const conflicts: Array<{ input: string; reason: string; suggestions: string[] }> = [];

  for (const raw of inputTags) {
    const check = validateAndSuggestTag(raw, pattern, examples);
    if (check.valid && check.normalized) {
      mergedSet.add(check.normalized);
      continue;
    }

    conflicts.push({
      input: raw,
      reason: check.reason ?? "invalid",
      suggestions: check.suggestions,
    });

    // auto-merge first high-confidence suggestion when available
    if (check.suggestions[0]) {
      mergedSet.add(check.suggestions[0]);
    }
  }

  return {
    merged: Array.from(mergedSet),
    conflicts,
  };
}

/**
 * M6-02: Policy hash computation for drift detection.
 *
 * Includes resources + policies config; excludes persistence/artifacts settings.
 * Uses deterministic JSON serialization (sorted keys) + SHA-256.
 */

import { createHash } from "node:crypto";

export interface PolicyHashInput {
  resources?: Record<string, unknown>;
  policies?: Record<string, unknown>;
}

function sortedStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(sortedStringify).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + sortedStringify(obj[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}

export function computePolicyHash(input: PolicyHashInput): string {
  const data = sortedStringify({
    resources: input.resources ?? {},
    policies: input.policies ?? {},
  });
  return createHash("sha256").update(data).digest("hex");
}

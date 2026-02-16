import { OboraErrorCode } from "../errors/OboraErrorCode.js";
import type { PatternRegistry } from "./PatternRegistry.js";
import type { CollaborationPattern } from "./types.js";

export interface ResolveCustomPatternOptions {
  cwd?: string;
  loadFromFile?: (filePath: string, options?: { cwd?: string }) => CollaborationPattern;
}

export function resolveCustomPattern(
  registry: PatternRegistry,
  patternRef: string,
  options: ResolveCustomPatternOptions = {}
): CollaborationPattern {
  if (typeof patternRef !== "string" || patternRef.trim().length === 0) {
    throw createStepNotFoundError(patternRef, "Pattern name is required");
  }

  if (registry.has(patternRef)) {
    return registry.get(patternRef);
  }

  if (looksLikeFilePath(patternRef)) {
    const loader = options.loadFromFile ?? loadCustomPatternFromFile;
    return loader(patternRef, { cwd: options.cwd });
  }

  throw createStepNotFoundError(
    patternRef,
    `Custom pattern '${patternRef}' is not registered. Register it via registerCustomPattern() before workflow execution.`
  );
}

/**
 * File-path based pattern loading (experimental — not yet implemented).
 * Provide a custom `fileLoader` to enable. Default loader throws NotImplementedError.
 * @experimental
 */
export function loadCustomPatternFromFile(_filePath: string, _options?: { cwd?: string }): CollaborationPattern {
  throw new Error("Custom pattern file loader is not implemented yet. Register custom patterns inline for now.");
}

function looksLikeFilePath(value: string): boolean {
  return value.includes("/") || value.includes("\\") || value.endsWith(".js") || value.endsWith(".ts") || value.endsWith(".mjs");
}

function createStepNotFoundError(patternRef: string, detail: string): Error & { code: OboraErrorCode } {
  const error = new Error(`[${OboraErrorCode.ORCH_STEP_NOT_FOUND}] ${detail} (pattern: '${patternRef}')`) as Error & {
    code: OboraErrorCode;
  };
  error.code = OboraErrorCode.ORCH_STEP_NOT_FOUND;
  return error;
}

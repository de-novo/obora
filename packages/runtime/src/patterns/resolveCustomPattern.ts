import * as nodePath from "node:path";
import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { OboraErrorCode } from "../errors/OboraErrorCode.js";
import { validatePatternContract } from "./CustomPatternAPI.js";
import type { PatternRegistry } from "./PatternRegistry.js";
import type { CollaborationPattern } from "./types.js";

export interface ResolveCustomPatternOptions {
  cwd?: string;
  loadFromFile?: (filePath: string, options?: { cwd?: string }) => CollaborationPattern | Promise<CollaborationPattern>;
}

/**
 * Normalize and resolve a file path, handling relative paths via cwd.
 * Uses node:path for cross-platform correctness.
 */
function resolveFilePath(filePath: string, cwd?: string): string {
  const normalized = nodePath.normalize(filePath);
  if (nodePath.isAbsolute(normalized)) {
    return normalized;
  }
  const base = cwd ?? process.cwd();
  return nodePath.resolve(base, normalized);
}

/**
 * Check if a file path looks like a YAML file reference.
 */
function isYamlPath(filePath: string): boolean {
  const ext = nodePath.extname(filePath).toLowerCase();
  return ext === ".yaml" || ext === ".yml";
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
    const resolvedPath = resolveFilePath(patternRef, options.cwd);

    // YAML file refs use built-in YAML loader by default
    if (isYamlPath(resolvedPath) && !options.loadFromFile) {
      const pattern = loadPatternFromYamlFile(resolvedPath);
      validateResolvedPattern(pattern, patternRef);
      return pattern;
    }

    const loader = options.loadFromFile ?? loadCustomPatternFromFile;
    const result = loader(resolvedPath, { cwd: options.cwd });
    if (result && typeof (result as Promise<CollaborationPattern>).then === "function") {
      throw new Error(
        `Custom pattern file loader returned a Promise. Use resolveCustomPatternAsync() for async loading, or provide a synchronous loader.`
      );
    }
    validateResolvedPattern(result as CollaborationPattern, patternRef);
    return result as CollaborationPattern;
  }

  throw createStepNotFoundError(
    patternRef,
    `Custom pattern '${patternRef}' is not registered. Register it via registerCustomPattern() before workflow execution.`
  );
}

export async function resolveCustomPatternAsync(
  registry: PatternRegistry,
  patternRef: string,
  options: ResolveCustomPatternOptions = {}
): Promise<CollaborationPattern> {
  if (typeof patternRef !== "string" || patternRef.trim().length === 0) {
    throw createStepNotFoundError(patternRef, "Pattern name is required");
  }

  if (registry.has(patternRef)) {
    return registry.get(patternRef);
  }

  if (looksLikeFilePath(patternRef)) {
    const resolvedPath = resolveFilePath(patternRef, options.cwd);

    // YAML file refs use built-in YAML loader by default
    if (isYamlPath(resolvedPath) && !options.loadFromFile) {
      const pattern = loadPatternFromYamlFile(resolvedPath);
      validateResolvedPattern(pattern, patternRef);
      return pattern;
    }

    const loader = options.loadFromFile ?? loadCustomPatternFromFile;
    const result = await loader(resolvedPath, { cwd: options.cwd });
    validateResolvedPattern(result, patternRef);
    return result;
  }

  throw createStepNotFoundError(
    patternRef,
    `Custom pattern '${patternRef}' is not registered. Register it via registerCustomPattern() before workflow execution.`
  );
}

/**
 * Load a CollaborationPattern from a YAML file.
 * Reads the file synchronously, parses YAML, and returns the parsed object.
 */
export function loadPatternFromYamlFile(resolvedPath: string): CollaborationPattern {
  try {
    const content = readFileSync(resolvedPath, "utf-8");
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object") {
      throw new Error(`YAML file did not produce a valid object`);
    }
    return parsed as CollaborationPattern;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to load custom pattern from YAML '${resolvedPath}': ${message}`,
      { cause: err }
    );
  }
}

/**
 * Validate that a resolved pattern meets the contract requirements.
 * Reuses the same validation logic as registerCustomPattern.
 */
function validateResolvedPattern(pattern: CollaborationPattern, patternRef: string): void {
  try {
    validatePatternContract(pattern);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw createStepNotFoundError(
      patternRef,
      `Pattern loaded from '${patternRef}' failed contract validation: ${message}`
    );
  }
}

/**
 * Default file-path based pattern loading for JS/TS modules.
 * Path is already resolved by the caller.
 */
export function loadCustomPatternFromFile(filePath: string, options?: { cwd?: string }): CollaborationPattern {
  const resolvedPath = filePath;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(resolvedPath);
    return extractPatternFromModule(mod, resolvedPath);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("ERR_REQUIRE_ESM") || message.includes("Must use import")) {
      throw new Error(
        `Cannot synchronously load ESM pattern file '${resolvedPath}'. ` +
        `Use resolveCustomPatternAsync() or provide a synchronous loadFromFile option.`,
        { cause: err }
      );
    }
    throw new Error(
      `Failed to load custom pattern from '${resolvedPath}': ${message}`,
      { cause: err }
    );
  }
}

function extractPatternFromModule(mod: Record<string, unknown>, filePath: string): CollaborationPattern {
  const candidate = mod.default ?? mod.pattern;
  if (!candidate) {
    throw new Error(
      `Pattern file '${filePath}' must export a default or named 'pattern' export implementing CollaborationPattern.`
    );
  }
  return candidate as CollaborationPattern;
}

function looksLikeFilePath(value: string): boolean {
  return (
    value.includes("/") ||
    value.includes("\\") ||
    value.endsWith(".js") ||
    value.endsWith(".ts") ||
    value.endsWith(".mjs") ||
    value.endsWith(".yaml") ||
    value.endsWith(".yml")
  );
}

function createStepNotFoundError(patternRef: string, detail: string): Error & { code: OboraErrorCode } {
  const error = new Error(`[${OboraErrorCode.ORCH_STEP_NOT_FOUND}] ${detail} (pattern: '${patternRef}')`) as Error & {
    code: OboraErrorCode;
  };
  error.code = OboraErrorCode.ORCH_STEP_NOT_FOUND;
  return error;
}

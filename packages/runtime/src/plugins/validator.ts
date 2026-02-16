import type { AnyPlugin, PluginType, PluginValidationResult } from "./types.js";

const REQUIRED_METHODS_BY_TYPE: Record<PluginType, string[]> = {
  agent: ["createAgent"],
  tool: ["schema", "execute"],
  pattern: ["execute"],
  "policy-rule": ["evaluate"],
  "recovery-strategy": ["handle"],
  "consensus-rule": ["evaluate"],
  "audit-store": ["record", "query"],
  "state-transform": ["transform"],
};

const VALID_TYPES = new Set<PluginType>(Object.keys(REQUIRED_METHODS_BY_TYPE) as PluginType[]);

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function hasOwnKey(target: unknown, key: string): boolean {
  return !!target && typeof target === "object" && key in target;
}

export function validatePlugin(plugin: unknown): PluginValidationResult {
  const errors: string[] = [];

  if (!plugin || typeof plugin !== "object") {
    return { valid: false, errors: ["plugin must be an object"] };
  }

  const candidate = plugin as Record<string, unknown>;

  if (!isNonEmptyString(candidate.name)) {
    errors.push("plugin.name is required");
  }

  if (!isNonEmptyString(candidate.version)) {
    errors.push("plugin.version is required");
  }

  if (!isNonEmptyString(candidate.type) || !VALID_TYPES.has(candidate.type as PluginType)) {
    errors.push("plugin.type is invalid");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const requiredMethods = REQUIRED_METHODS_BY_TYPE[candidate.type as PluginType];
  for (const field of requiredMethods) {
    if (!hasOwnKey(candidate, field)) {
      errors.push(`plugin.${field} is required for type '${candidate.type}'`);
      continue;
    }

    if (field === "schema") {
      const schema = candidate.schema;
      if (!schema || typeof schema !== "object") {
        errors.push("plugin.schema must be an object");
      }
      continue;
    }

    if (typeof candidate[field] !== "function") {
      errors.push(`plugin.${field} must be a function`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertValidPlugin(plugin: unknown): asserts plugin is AnyPlugin {
  const result = validatePlugin(plugin);
  if (!result.valid) {
    throw new Error(`Invalid plugin: ${result.errors.join(", ")}`);
  }
}

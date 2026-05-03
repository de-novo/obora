import { PLUGIN_TYPES, type PluginType } from "./plugin-types.js";
import { OboraError, OboraErrorCode } from "./runtime.js";

/**
 * Short alias → SCHEMAS.md PluginType mapping.
 */
export const PLUGIN_TYPE_ALIASES: Record<string, PluginType> = {
  pattern: "pattern",
  policy: "policy-rule",
  tool: "tool",
  agent: "agent",
  audit: "audit-store",
  recovery: "recovery-strategy",
  gate: "consensus-rule",
  state: "state-transform",
};

export function resolvePluginType(typeOrAlias: string): PluginType {
  if (typeOrAlias in PLUGIN_TYPE_ALIASES) {
    const alias = PLUGIN_TYPE_ALIASES[typeOrAlias];
    if (alias !== undefined) return alias;
  }

  if (PLUGIN_TYPES.includes(typeOrAlias as PluginType)) {
    return typeOrAlias as PluginType;
  }

  throw OboraError.invalidPluginType(typeOrAlias);
}

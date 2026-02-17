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
    return PLUGIN_TYPE_ALIASES[typeOrAlias];
  }

  if (PLUGIN_TYPES.includes(typeOrAlias as PluginType)) {
    return typeOrAlias as PluginType;
  }

  throw new OboraError(
    `Unknown plugin type: ${typeOrAlias}. Must be one of aliases (${Object.keys(PLUGIN_TYPE_ALIASES).join(", ")}) or canonical types (${PLUGIN_TYPES.join(", ")}).`,
    OboraErrorCode.SDK_INVALID_PLUGIN,
  );
}

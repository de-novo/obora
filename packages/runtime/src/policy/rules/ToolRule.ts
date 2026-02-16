import type { PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet, ToolPolicy } from "../types.js";

function toActionText(action: PolicyAction): string {
  if (typeof action.params === "string") {
    return action.params;
  }
  if (action.params === undefined) {
    return "";
  }

  try {
    return JSON.stringify(action.params);
  } catch {
    return String(action.params);
  }
}

function matchesToolRule(rule: ToolPolicy, action: PolicyAction): boolean {
  if (rule.name !== action.name) {
    return false;
  }

  const when = rule.when;
  if (!when) {
    return true;
  }

  const text = toActionText(action);
  const matches = when.matches ?? [];
  const notMatches = when.not_matches ?? [];

  const includesAnyMatch = matches.length === 0 || matches.some((pattern) => text.includes(pattern));
  const includesNotMatch = notMatches.some((pattern) => text.includes(pattern));

  return includesAnyMatch && !includesNotMatch;
}

export class ToolRule implements PolicyRulePlugin {
  readonly name = "tool";
  readonly version = "1.0.0";
  readonly type = "policy-rule" as const;

  evaluate(action: PolicyAction, _context: PolicyContext, policies: PolicySet): PolicyDecision | null {
    if (action.type !== "tool_call") {
      return null;
    }

    for (const rule of policies.tools ?? []) {
      if (!matchesToolRule(rule, action)) {
        continue;
      }

      if (rule.effect === "allow") {
        return { type: "allow" };
      }

      if (rule.effect === "deny") {
        return {
          type: "deny",
          reason: `Tool call denied for ${action.name}`,
          rule: `tools.${rule.name}`,
        };
      }

      if (rule.effect === "gate") {
        return {
          type: "gate",
          gateType: rule.gate?.type ?? "human-approval",
          config: {
            tool: action.name,
            timeout: rule.gate?.timeout,
            rule: `tools.${rule.name}`,
          },
        };
      }

      return {
        type: "transform",
        original: action.params,
        transformed: {
          params: action.params,
          transform: rule.transform?.fn,
        },
        rule: `tools.${rule.name}`,
        transformFn: rule.transform?.fn,
      };
    }

    return null;
  }
}

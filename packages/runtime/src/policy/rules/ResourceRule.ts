import type { PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet } from "../types.js";

export class ResourceRule implements PolicyRulePlugin {
  readonly name = "resource";
  readonly version = "1.0.0";
  readonly type = "policy-rule" as const;

  evaluate(action: PolicyAction, context: PolicyContext, policies: PolicySet): PolicyDecision | null {
    if (action.type !== "resource_use" || !policies.resources) {
      return null;
    }

    const resources = policies.resources;
    if (resources.timeoutMs !== undefined && (context.currentDurationMs ?? 0) > resources.timeoutMs) {
      return { type: "deny", reason: "Timeout exceeded", rule: "resources.timeoutMs" };
    }
    if (resources.maxTokens !== undefined && (context.currentTokens ?? 0) > resources.maxTokens) {
      return { type: "deny", reason: "Token limit exceeded", rule: "resources.maxTokens" };
    }
    if (resources.maxCostUsd !== undefined && (context.currentCost ?? 0) > resources.maxCostUsd) {
      return { type: "deny", reason: "Cost limit exceeded", rule: "resources.maxCostUsd" };
    }
    if (resources.maxToolCalls !== undefined && (context.currentToolCalls ?? 0) > resources.maxToolCalls) {
      return { type: "deny", reason: "Tool call limit exceeded", rule: "resources.maxToolCalls" };
    }

    return null;
  }
}

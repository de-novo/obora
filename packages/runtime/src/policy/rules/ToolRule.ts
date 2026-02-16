import { resolveDynamicToolRule } from "../DynamicToolPolicy.js";
import { evaluateExpression, type ExpressionContext } from "../expressions/ExpressionEvaluator.js";
import { parseExpression, type ExpressionAST } from "../expressions/ExpressionParser.js";
import type { DynamicToolRule, PolicyAction, PolicyContext, PolicyDecision, PolicyRulePlugin, PolicySet, ToolPolicy } from "../types.js";

export interface PolicyConditionAuditEvent {
  type: "policy_condition_evaluated";
  expression: string;
  result: boolean;
  rule: string;
  action: string;
  error?: string;
}

export interface ToolRuleOptions {
  onAuditEvent?: (event: PolicyConditionAuditEvent) => void | Promise<void>;
}

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

function matchesToolRule(
  rule: ToolPolicy,
  action: PolicyAction,
  context: PolicyContext,
  getExpressionAst: (expression: string) => ExpressionAST,
  onAuditEvent?: ToolRuleOptions["onAuditEvent"],
): { matched: boolean; evaluationError?: string } {
  if (rule.name !== action.name) {
    return { matched: false };
  }

  const when = rule.when;
  if (!when) {
    return { matched: true };
  }

  const text = toActionText(action);
  const matches = when.matches ?? [];
  const notMatches = when.not_matches ?? [];

  const includesAnyMatch = matches.length === 0 || matches.some((pattern) => text.includes(pattern));
  const includesNotMatch = notMatches.some((pattern) => text.includes(pattern));

  if (!(includesAnyMatch && !includesNotMatch)) {
    return { matched: false };
  }

  if (!when.condition) {
    return { matched: true };
  }

  const rulePath = `tools.${rule.name}`;

  try {
    const ast = getExpressionAst(when.condition);
    const evalContext: ExpressionContext = { action, context };
    const result = evaluateExpression(ast, evalContext);

    void onAuditEvent?.({
      type: "policy_condition_evaluated",
      expression: when.condition,
      result,
      rule: rulePath,
      action: action.name,
    });

    return { matched: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    void onAuditEvent?.({
      type: "policy_condition_evaluated",
      expression: when.condition,
      result: false,
      rule: rulePath,
      action: action.name,
      error: message,
    });

    return {
      matched: true,
      evaluationError: `Policy condition evaluation failed for '${rulePath}': ${message}`,
    };
  }
}

export class ToolRule implements PolicyRulePlugin {
  readonly name = "tool";
  readonly version = "1.1.0";
  readonly type = "policy-rule" as const;

  private readonly expressionCache = new Map<string, ExpressionAST>();
  private readonly onAuditEvent?: ToolRuleOptions["onAuditEvent"];

  constructor(options?: ToolRuleOptions) {
    this.onAuditEvent = options?.onAuditEvent;
  }

  evaluate(action: PolicyAction, context: PolicyContext, policies: PolicySet): PolicyDecision | null {
    if (action.type !== "tool_call") {
      return null;
    }

    const dynamicResolution = resolveDynamicToolRule(action, context, policies.dynamicToolRules);
    if (dynamicResolution.denyDecision) {
      return dynamicResolution.denyDecision;
    }

    if (dynamicResolution.matchedRule) {
      return this.toDecisionFromDynamicRule(action, dynamicResolution.matchedRule);
    }

    for (const rule of policies.tools ?? []) {
      const matchResult = matchesToolRule(rule, action, context, this.getExpressionAst.bind(this), this.onAuditEvent);
      if (!matchResult.matched) {
        continue;
      }

      if (matchResult.evaluationError) {
        return {
          type: "deny",
          reason: matchResult.evaluationError,
          rule: `tools.${rule.name}`,
        };
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

  private toDecisionFromDynamicRule(action: PolicyAction, rule: DynamicToolRule): PolicyDecision {
    if (rule.effect === "allow") {
      return { type: "allow" };
    }

    if (rule.effect === "deny") {
      return {
        type: "deny",
        reason: `Tool call denied for ${action.name}`,
        rule: `dynamicTools.${rule.name}`,
      };
    }

    if (rule.effect === "gate") {
      return {
        type: "gate",
        gateType: "human-approval",
        config: {
          tool: action.name,
          rule: `dynamicTools.${rule.name}`,
        },
      };
    }

    return {
      type: "transform",
      original: action.params,
      transformed: {
        params: action.params,
        transform: "dynamic",
      },
      rule: `dynamicTools.${rule.name}`,
      transformFn: "dynamic",
    };
  }

  private getExpressionAst(expression: string): ExpressionAST {
    const cached = this.expressionCache.get(expression);
    if (cached) {
      return cached;
    }

    const ast = parseExpression(expression);
    this.expressionCache.set(expression, ast);
    return ast;
  }
}

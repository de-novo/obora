import { evaluateExpression, type ExpressionContext } from "./expressions/ExpressionEvaluator.js";
import { parseExpression, type ExpressionAST } from "./expressions/ExpressionParser.js";
import type { DynamicToolRule, PolicyAction, PolicyContext, PolicyDecision } from "./types.js";

const MAX_CACHE_SIZE = 1000;
const expressionCache = new Map<string, ExpressionAST>();

function getExpressionAst(expression: string): ExpressionAST {
  const cached = expressionCache.get(expression);
  if (cached) {
    return cached;
  }

  const ast = parseExpression(expression);
  if (expressionCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = expressionCache.keys().next().value;
    if (oldestKey !== undefined) {
      expressionCache.delete(oldestKey);
    }
  }
  expressionCache.set(expression, ast);
  return ast;
}

function compareDynamicRules(a: DynamicToolRule, b: DynamicToolRule): number {
  const priorityDiff = (b.priority ?? 0) - (a.priority ?? 0);
  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  if (a.effect === "deny" && b.effect !== "deny") {
    return -1;
  }
  if (b.effect === "deny" && a.effect !== "deny") {
    return 1;
  }

  return 0;
}

export interface DynamicToolRuleResolution {
  matchedRule?: DynamicToolRule;
  denyDecision?: PolicyDecision;
}

export function resolveDynamicToolRule(
  action: PolicyAction,
  context: PolicyContext,
  rules: DynamicToolRule[] | undefined,
): DynamicToolRuleResolution {
  if (action.type !== "tool_call" || !rules || rules.length === 0) {
    return {};
  }

  const candidates: DynamicToolRule[] = [];

  for (const rule of rules) {
    if (rule.name !== action.name) {
      continue;
    }

    try {
      const ast = getExpressionAst(rule.condition);
      const evalContext: ExpressionContext = {
        action,
        context,
        state: context.dynamicVars?.state,
        step: context.dynamicVars?.step,
        execution: context.dynamicVars?.execution,
        actor: context.dynamicVars?.actor,
        metrics: context.dynamicVars?.metrics,
        previousResults: context.dynamicVars?.previousResults,
      };

      if (evaluateExpression(ast, evalContext)) {
        candidates.push(rule);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        denyDecision: {
          type: "deny",
          reason: `dynamic tool rule condition evaluation failed: ${message}`,
          rule: rule.name,
        },
      };
    }
  }

  if (candidates.length === 0) {
    return {};
  }

  return { matchedRule: [...candidates].sort(compareDynamicRules)[0] };
}

export const __internal = {
  getExpressionCacheSize: (): number => expressionCache.size,
  clearExpressionCache: (): void => {
    expressionCache.clear();
  },
};

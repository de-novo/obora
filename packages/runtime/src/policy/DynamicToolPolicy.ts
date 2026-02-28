import { evaluateExpression, type ExpressionContext } from "./expressions/ExpressionEvaluator.js";
import { parseExpression, type ExpressionAST } from "./expressions/ExpressionParser.js";
import type { DynamicToolRule, PolicyAction, PolicyContext, PolicyDecision } from "./types.js";

// Module-level expression AST cache shared across all resolveDynamicToolRule calls.
// Uses FIFO eviction at MAX_CACHE_SIZE. For multi-engine isolation, consider
// injecting cache via options in the future.
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

interface IndexedDynamicToolRule extends DynamicToolRule {
  /** Original array index, used for deterministic tie-breaking */
  _index: number;
}

function compareDynamicRules(a: IndexedDynamicToolRule, b: IndexedDynamicToolRule): number {
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

  // Stable tie-break: preserve original declaration order
  return a._index - b._index;
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

  const candidates: IndexedDynamicToolRule[] = [];

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
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
        candidates.push({ ...rule, _index: i });
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

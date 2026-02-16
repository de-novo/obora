import { evaluateExpression, type ExpressionContext } from "./expressions/ExpressionEvaluator.js";
import { parseExpression, type ExpressionAST } from "./expressions/ExpressionParser.js";
import type { DynamicToolRule, PolicyAction, PolicyContext } from "./types.js";

const expressionCache = new Map<string, ExpressionAST>();

function getExpressionAst(expression: string): ExpressionAST {
  const cached = expressionCache.get(expression);
  if (cached) {
    return cached;
  }

  const ast = parseExpression(expression);
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

export function resolveDynamicToolRule(
  action: PolicyAction,
  context: PolicyContext,
  rules: DynamicToolRule[] | undefined,
): DynamicToolRule | undefined {
  if (action.type !== "tool_call" || !rules || rules.length === 0) {
    return undefined;
  }

  const candidates = rules
    .filter((rule) => rule.name === action.name)
    .filter((rule) => {
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
      return evaluateExpression(ast, evalContext);
    });

  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort(compareDynamicRules)[0];
}

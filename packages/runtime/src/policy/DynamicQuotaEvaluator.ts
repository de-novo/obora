import { evaluateExpression, type ExpressionContext } from "./expressions/ExpressionEvaluator.js";
import { parseExpression, type ExpressionAST } from "./expressions/ExpressionParser.js";
import type { DynamicResourceLimit, PolicyAction, PolicyContext, PolicyDecision, PolicyWarning, ResourcePolicy } from "./types.js";

const fieldToContextValue: Record<DynamicResourceLimit["field"], (context: PolicyContext) => number> = {
  tokens: (context) => context.currentTokens ?? 0,
  cost: (context) => context.currentCost ?? 0,
  tool_calls: (context) => context.currentToolCalls ?? 0,
  duration_ms: (context) => context.currentDurationMs ?? 0,
};

const fieldToRulePath: Record<DynamicResourceLimit["field"], string> = {
  tokens: "resources.maxTokens",
  cost: "resources.maxCostUsd",
  tool_calls: "resources.maxToolCalls",
  duration_ms: "resources.timeoutMs",
};

const fieldToReason: Record<DynamicResourceLimit["field"], string> = {
  tokens: "Token limit exceeded",
  cost: "Cost limit exceeded",
  tool_calls: "Tool call limit exceeded",
  duration_ms: "Timeout exceeded",
};

// Module-level expression AST cache shared across all evaluateDynamicResourceDecision calls.
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

function conditionMatches(limit: DynamicResourceLimit, action: PolicyAction, context: PolicyContext): boolean {
  const ast = getExpressionAst(limit.condition);
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
}

export function evaluateDynamicResourceDecision(
  policy: ResourcePolicy,
  action: PolicyAction,
  context: PolicyContext,
): PolicyDecision | null {
  const limits = policy.dynamicQuota?.limits ?? [];

  return limits.flatMap((limit): PolicyDecision[] => {
    const matchResult:
      | { status: "ok"; matches: boolean }
      | { status: "error"; message: string } = (() => {
      try {
        return { status: "ok", matches: conditionMatches(limit, action, context) };
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    })();

    if (matchResult.status === "error") {
      return [{
        type: "deny",
        reason: `dynamic quota condition evaluation failed: ${matchResult.message}`,
        rule: "dynamic-quota",
      }];
    }

    if (!matchResult.matches) {
      return [];
    }

    const current = fieldToContextValue[limit.field](context);
    if (current <= limit.limit) {
      return [];
    }

    if (limit.action === "deny") {
      return [{
        type: "deny",
        reason: fieldToReason[limit.field],
        rule: `resources.dynamic.${limit.field}`,
      }];
    }

    if (limit.action === "warn") {
      // warn: allow the action but attach a warning for upstream consumers
      return [{
        type: "allow",
        warning: {
          reason: `${fieldToReason[limit.field]} (dynamic)`,
          rule: `resources.dynamic.${limit.field}`,
          field: limit.field,
          limit: limit.limit,
          current,
        },
      }];
    }

    // action === "gate"
    return [{
      type: "gate",
      gateType: "human-approval",
      config: {
        reason: `${fieldToReason[limit.field]} (dynamic)`,
        action: limit.action,
        field: limit.field,
        limit: limit.limit,
        current,
        rule: `resources.dynamic.${limit.field}`,
      },
    }];
  }).at(0) ?? null;
}

export function getEffectiveStaticLimit(policy: ResourcePolicy, field: DynamicResourceLimit["field"]): number | undefined {
  switch (field) {
    case "tokens":
      return policy.maxTokens;
    case "cost":
      return policy.maxCostUsd;
    case "tool_calls":
      return policy.maxToolCalls;
    case "duration_ms":
      return policy.timeoutMs;
    default:
      return undefined;
  }
}

export function getStaticRulePath(field: DynamicResourceLimit["field"]): string {
  return fieldToRulePath[field];
}

export function getStaticReason(field: DynamicResourceLimit["field"]): string {
  return fieldToReason[field];
}

export const __internal = {
  getExpressionCacheSize: (): number => expressionCache.size,
  clearExpressionCache: (): void => {
    expressionCache.clear();
  },
};

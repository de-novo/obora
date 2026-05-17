import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import type { PolicyAction, PolicyContext } from "../types.js";
import type { ArrayLiteralExpression, ComparisonExpression, ExpressionAST, FunctionCallExpression } from "./ExpressionParser.js";

export interface ExpressionContext {
  action: PolicyAction;
  context: PolicyContext;
  state?: Record<string, unknown>;
  step?: {
    name: string;
    agent: string;
    config?: Record<string, unknown>;
  };
  execution?: {
    id: string;
    workflowName: string;
    startedAt: Date;
    elapsedMs: number;
    totalTokens: number;
    totalCost: number;
    totalToolCalls: number;
    completedSteps: string[];
  };
  actor?: {
    id: string;
    role?: string;
  };
  metrics?: {
    errorCount: number;
    retryCount: number;
    avgStepDurationMs: number;
    maxStepDurationMs: number;
  };
  previousResults?: Record<string, { success: boolean; output?: unknown }>;
}

import { BLOCKED_FIELD_NAMES, MAX_REGEX_PATTERN_LENGTH } from "./constants.js";

class ExpressionEvaluationError extends Error {
  readonly code = OboraErrorCode.POLICY_DENY;

  constructor(message: string) {
    super(`[${OboraErrorCode.POLICY_DENY}] ${message}`);
    this.name = "ExpressionEvaluationError";
  }
}

export function evaluateExpression(ast: ExpressionAST, ctx: ExpressionContext): boolean {
  const result = evaluateNode(ast, ctx);
  return Boolean(result);
}

function evaluateNode(ast: ExpressionAST, ctx: ExpressionContext): unknown {
  switch (ast.type) {
    case "literal":
      return ast.value;
    case "field_ref":
      return resolveField(ast.path, ctx);
    case "array_literal":
      return ast.items.map((item) => evaluateNode(item, ctx));
    case "not":
      return !evaluateNode(ast.expression, ctx);
    case "logical": {
      if (ast.operator === "&&") {
        return Boolean(evaluateNode(ast.left, ctx)) && Boolean(evaluateNode(ast.right, ctx));
      }
      return Boolean(evaluateNode(ast.left, ctx)) || Boolean(evaluateNode(ast.right, ctx));
    }
    case "comparison":
      return evaluateComparison(ast, ctx);
    case "function_call":
      return evaluateFunctionCall(ast, ctx);
    default:
      return assertNever(ast);
  }
}

function evaluateComparison(ast: ComparisonExpression, ctx: ExpressionContext): boolean {
  const left = evaluateNode(ast.left, ctx);
  const right = evaluateNode(ast.right, ctx);

  switch (ast.operator) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      ensureComparable(left, right, ast.operator);
      return (left as number | string) > (right as number | string);
    case ">=":
      ensureComparable(left, right, ast.operator);
      return (left as number | string) >= (right as number | string);
    case "<":
      ensureComparable(left, right, ast.operator);
      return (left as number | string) < (right as number | string);
    case "<=":
      ensureComparable(left, right, ast.operator);
      return (left as number | string) <= (right as number | string);
    default:
      return assertNever(ast.operator);
  }
}

function evaluateFunctionCall(ast: FunctionCallExpression, ctx: ExpressionContext): boolean {
  const evaluatedArgs = ast.args.map((arg) => evaluateNode(arg, ctx));

  switch (ast.name) {
    case "contains": {
      ensureArgCount(ast, 2);
      const [value, needle] = evaluatedArgs;
      return String(value ?? "").includes(String(needle ?? ""));
    }
    case "startsWith": {
      ensureArgCount(ast, 2);
      const [value, prefix] = evaluatedArgs;
      return String(value ?? "").startsWith(String(prefix ?? ""));
    }
    case "endsWith": {
      ensureArgCount(ast, 2);
      const [value, suffix] = evaluatedArgs;
      return String(value ?? "").endsWith(String(suffix ?? ""));
    }
    case "matches": {
      ensureArgCount(ast, 2);
      const [value, regexPattern] = evaluatedArgs;
      try {
        const pattern = String(regexPattern ?? "");
        validateRegexPattern(pattern);
        const regex = new RegExp(pattern);
        return regex.test(String(value ?? ""));
      } catch (error) {
        throw new ExpressionEvaluationError(
          `Invalid regex in matches(): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    case "in": {
      ensureArgCount(ast, 2);
      const [value, list] = evaluatedArgs;
      if (!Array.isArray(list)) {
        throw new ExpressionEvaluationError("in() expects an array as the second argument");
      }
      return list.some((item) => item === value);
    }
    default:
      return assertNever(ast.name);
  }
}


function validateRegexPattern(pattern: string): void {
  if (pattern.length > MAX_REGEX_PATTERN_LENGTH) {
    throw new Error(`regex pattern exceeds maximum length (${MAX_REGEX_PATTERN_LENGTH})`);
  }

  // Basic ReDoS guard: block obvious nested quantifiers like (a+)+, (.*)+, (.+)*
  if (/\((?:[^()]*[+*][^()]*)\)[+*{]/.test(pattern)) {
    throw new Error("potentially unsafe regex pattern (nested quantifier) is not allowed");
  }
}

function resolveField(path: string[], ctx: ExpressionContext): unknown {
  const [root, ...segments] = path;
  const roots: Record<string, unknown> = {
    action: ctx.action,
    context: ctx.context,
    state: ctx.state,
    step: ctx.step,
    execution: ctx.execution,
    actor: ctx.actor,
    metrics: ctx.metrics,
    previousResults: ctx.previousResults,
  };

  if (!root || !Object.hasOwn(roots, root)) {
    throw new ExpressionEvaluationError(`Unsupported root '${root}' in field path`);
  }

  return segments.reduce<unknown>((current, segment) => {
    if (BLOCKED_FIELD_NAMES.has(segment)) {
      throw new ExpressionEvaluationError(`Blocked field segment '${segment}'`);
    }

    if (!isObject(current)) {
      return undefined;
    }

    if (!Object.hasOwn(current, segment)) {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, roots[root]);
}

function ensureComparable(left: unknown, right: unknown, operator: string): void {
  const sameType = typeof left === typeof right;
  const allowedType = typeof left === "number" || typeof left === "string";

  if (!sameType || !allowedType) {
    throw new ExpressionEvaluationError(
      `Operator '${operator}' expects both sides to be the same comparable type (number or string)`,
    );
  }
}

function ensureArgCount(ast: FunctionCallExpression, expected: number): void {
  if (ast.args.length !== expected) {
    throw new ExpressionEvaluationError(`${ast.name}() expects ${expected} arguments, got ${ast.args.length}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function assertNever(value: never): never {
  throw new ExpressionEvaluationError(`Unsupported AST node: ${JSON.stringify(value)}`);
}

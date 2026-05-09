import type { ValidationResult } from "./validation-repair.js";

export interface OnFailRoute {
  when?: string;
  target: string;
}

export interface RouteResolution {
  target: string;
  matchedRoute?: OnFailRoute;
  matchReason: "suggestedTargets" | `expression:${string}` | "default";
}

interface ExpressionContext {
  passed: boolean;
  summary: string;
  errorCode?: string;
  failedChecks: Array<{ name: string; message: string; severity?: string; file?: string }>;
  signature?: string;
  suggestedTargets?: string[];
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function evaluateSimpleExpression(expression: string, ctx: ExpressionContext): boolean {
  const trimmed = expression.trim();

  const suggestedTargetsIncludes = trimmed.match(
    /^suggestedTargets\.includes\s*\(\s*["'](.+?)["']\s*\)$/
  );
  if (suggestedTargetsIncludes) {
    const target = suggestedTargetsIncludes[1]!;
    return ctx.suggestedTargets?.includes(target) ?? false;
  }

  const failedChecksSomeNameIncludes = trimmed.match(
    /^failedChecks\.some\s*\(\s*c\s*=>\s*c\.name\.includes\s*\(\s*["'](.+?)["']\s*\)\s*\)$/
  );
  if (failedChecksSomeNameIncludes) {
    const keyword = failedChecksSomeNameIncludes[1]!;
    return ctx.failedChecks.some((c) => c.name.includes(keyword));
  }

  const failedChecksSomeMessageIncludes = trimmed.match(
    /^failedChecks\.some\s*\(\s*c\s*=>\s*c\.message\.includes\s*\(\s*["'](.+?)["']\s*\)\s*\)$/
  );
  if (failedChecksSomeMessageIncludes) {
    const keyword = failedChecksSomeMessageIncludes[1]!;
    return ctx.failedChecks.some((c) => c.message.includes(keyword));
  }

  const summaryIncludes = trimmed.match(/^summary\.includes\s*\(\s*["'](.+?)["']\s*\)$/);
  if (summaryIncludes) {
    const keyword = summaryIncludes[1]!;
    return ctx.summary.includes(keyword);
  }

  const errorCodeExact = trimmed.match(/^errorCode\s*===\s*["'](.+?)["']$/);
  if (errorCodeExact) {
    const code = errorCodeExact[1]!;
    return ctx.errorCode === code;
  }

  throw new Error(`Unsupported expression syntax: ${expression}`);
}

export function resolveFailureRoute(
  goto: string | OnFailRoute[],
  validationResult: ValidationResult
): RouteResolution {
  if (typeof goto === "string") {
    return {
      target: goto,
      matchReason: "default",
    };
  }

  if (!Array.isArray(goto) || goto.length === 0) {
    throw new Error("goto must be a string or non-empty array of routes");
  }

  const ctx: ExpressionContext = {
    passed: validationResult.passed,
    summary: validationResult.summary,
    errorCode: validationResult.errorCode,
    failedChecks: validationResult.failedChecks,
    signature: validationResult.signature,
    suggestedTargets: validationResult.suggestedTargets,
  };

  const suggestedRoute =
    ctx.suggestedTargets && ctx.suggestedTargets.length > 0
      ? goto.find((route) => route.target && ctx.suggestedTargets?.includes(route.target))
      : undefined;

  if (suggestedRoute) {
    return {
      target: suggestedRoute.target,
      matchedRoute: suggestedRoute,
      matchReason: "suggestedTargets",
    };
  }

  const expressionRoute = goto.find((route) => {
    if (route.when === undefined) {
      return false;
    }

    try {
      return evaluateSimpleExpression(route.when, ctx);
    } catch {
      return false;
    }
  });

  if (expressionRoute?.when !== undefined) {
    return {
      target: expressionRoute.target,
      matchedRoute: expressionRoute,
      matchReason: `expression:${expressionRoute.when}`,
    };
  }

  const defaultRoute = goto.find((route) => route.when === undefined);

  if (defaultRoute) {
    return {
      target: defaultRoute.target,
      matchedRoute: defaultRoute,
      matchReason: "default",
    };
  }

  throw new Error("No matching route found and no default fallback route defined");
}

export function validateRoutes(
  goto: unknown,
  stepNames: Set<string>,
  stepName: string
): string | null {
  if (typeof goto === "string") {
    if (!stepNames.has(goto)) {
      return `Step '${stepName}' on_fail.goto targets non-existent step '${goto}'`;
    }
    return null;
  }

  if (!Array.isArray(goto)) {
    return `Step '${stepName}' on_fail.goto must be a string or array of routes`;
  }

  if (goto.length === 0) {
    return `Step '${stepName}' on_fail.goto array cannot be empty`;
  }

  const validation = goto.reduce<{
    error: string | null;
    hasDefault: boolean;
    seenTargets: ReadonlySet<string>;
  }>(
    (state, route, index) => {
      if (state.error) {
        return state;
      }

      if (!route || typeof route !== "object") {
        return {
          ...state,
          error: `Step '${stepName}' on_fail.goto[${index}] must be an object`,
        };
      }

      const r = route as Record<string, unknown>;

      if (typeof r.target !== "string" || r.target.length === 0) {
        return {
          ...state,
          error: `Step '${stepName}' on_fail.goto[${index}].target must be a non-empty string`,
        };
      }

      if (!stepNames.has(r.target)) {
        return {
          ...state,
          error: `Step '${stepName}' on_fail.goto[${index}].target targets non-existent step '${r.target}'`,
        };
      }

      if (state.seenTargets.has(r.target)) {
        return {
          ...state,
          error: `Step '${stepName}' on_fail.goto has duplicate target '${r.target}'`,
        };
      }

      if (r.when === undefined) {
        return state.hasDefault
          ? {
              ...state,
              error: `Step '${stepName}' on_fail.goto has multiple default routes (routes without 'when')`,
            }
          : {
              error: null,
              hasDefault: true,
              seenTargets: new Set([...state.seenTargets, r.target]),
            };
      }

      if (typeof r.when !== "string" || r.when.length === 0) {
        return {
          ...state,
          error: `Step '${stepName}' on_fail.goto[${index}].when must be a non-empty string if provided`,
        };
      }

      return {
        error: null,
        hasDefault: state.hasDefault,
        seenTargets: new Set([...state.seenTargets, r.target]),
      };
    },
    {
      error: null,
      hasDefault: false,
      seenTargets: new Set<string>(),
    }
  );

  return validation.error;
}

export function getAllRouteTargets(goto: string | OnFailRoute[]): string[] {
  if (typeof goto === "string") {
    return [goto];
  }
  return goto.map((r) => r.target);
}

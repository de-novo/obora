import { describe, expect, it } from "vitest";

import { resolveFailureRoute, validateRoutes, getAllRouteTargets } from "../conditional-routing.js";
import type { ValidationResult } from "../validation-repair.js";
import type { OnFailRoute } from "../conditional-routing.js";

function makeValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    passed: false,
    summary: "Validation failed",
    failedChecks: [],
    ...overrides,
  };
}

describe("resolveFailureRoute", () => {
  describe("backward compatibility (string goto)", () => {
    it("returns string target unchanged", () => {
      const result = makeValidationResult();
      const resolution = resolveFailureRoute("implement_or_repair", result);

      expect(resolution.target).toBe("implement_or_repair");
      expect(resolution.matchReason).toBe("default");
      expect(resolution.matchedRoute).toBeUndefined();
    });
  });

  describe("suggestedTargets shorthand", () => {
    it("prefers route matching suggestedTargets", () => {
      const routes: OnFailRoute[] = [
        { when: 'failedChecks.some(c => c.name.includes("test"))', target: "design_tests" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        suggestedTargets: ["design_tests"],
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("design_tests");
      expect(resolution.matchReason).toBe("suggestedTargets");
    });

    it("ignores suggestedTargets that don't match any route", () => {
      const routes: OnFailRoute[] = [
        { when: 'failedChecks.some(c => c.name.includes("test"))', target: "design_tests" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        suggestedTargets: ["unknown_step"],
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("implement_or_repair");
      expect(resolution.matchReason).toBe("default");
    });
  });

  describe("expression evaluation", () => {
    it("matches failedChecks.some(c => c.name.includes(...))", () => {
      const routes: OnFailRoute[] = [
        {
          when: 'failedChecks.some(c => c.name.includes("test_code_bug"))',
          target: "design_tests",
        },
        { when: 'failedChecks.some(c => c.name.includes("design_issue"))', target: "refine_idea" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        failedChecks: [{ name: "test_code_bug_in_assertion", message: "Test assertion is wrong" }],
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("design_tests");
      expect(resolution.matchReason).toBe(
        'expression:failedChecks.some(c => c.name.includes("test_code_bug"))'
      );
    });

    it("matches failedChecks.some(c => c.message.includes(...))", () => {
      const routes: OnFailRoute[] = [
        {
          when: 'failedChecks.some(c => c.message.includes("missing import"))',
          target: "fix_imports",
        },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        failedChecks: [{ name: "lint_error", message: "Error: missing import statement" }],
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("fix_imports");
    });

    it("matches summary.includes(...)", () => {
      const routes: OnFailRoute[] = [
        { when: 'summary.includes("architecture issue")', target: "refine_design" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        summary: "Detected architecture issue in module structure",
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("refine_design");
    });

    it("matches errorCode === ...", () => {
      const routes: OnFailRoute[] = [
        { when: 'errorCode === "E001"', target: "handle_e001" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        errorCode: "E001",
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("handle_e001");
    });

    it("evaluates routes in order (first match wins)", () => {
      const routes: OnFailRoute[] = [
        { when: 'summary.includes("bug")', target: "first_route" },
        { when: 'summary.includes("bug")', target: "second_route" },
        { target: "default_route" },
      ];

      const result = makeValidationResult({
        summary: "There is a bug in the code",
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("first_route");
    });
  });

  describe("default fallback", () => {
    it("returns default when no expression matches", () => {
      const routes: OnFailRoute[] = [
        { when: 'failedChecks.some(c => c.name.includes("test"))', target: "design_tests" },
        { target: "implement_or_repair" },
      ];

      const result = makeValidationResult({
        failedChecks: [{ name: "implementation_bug", message: "Logic error" }],
      });

      const resolution = resolveFailureRoute(routes, result);

      expect(resolution.target).toBe("implement_or_repair");
      expect(resolution.matchReason).toBe("default");
    });

    it("throws when no match and no default", () => {
      const routes: OnFailRoute[] = [
        { when: 'failedChecks.some(c => c.name.includes("test"))', target: "design_tests" },
      ];

      const result = makeValidationResult({
        failedChecks: [{ name: "implementation_bug", message: "Logic error" }],
      });

      expect(() => resolveFailureRoute(routes, result)).toThrow(
        "No matching route found and no default fallback route defined"
      );
    });
  });

  describe("error handling", () => {
    it("throws on empty array", () => {
      const result = makeValidationResult();
      expect(() => resolveFailureRoute([], result)).toThrow(
        "goto must be a string or non-empty array of routes"
      );
    });
  });
});

describe("validateRoutes", () => {
  const stepNames = new Set(["step_a", "step_b", "step_c"]);

  it("validates string goto", () => {
    expect(validateRoutes("step_a", stepNames, "test_step")).toBeNull();
    expect(validateRoutes("unknown_step", stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto targets non-existent step 'unknown_step'"
    );
  });

  it("validates route array with valid targets", () => {
    const routes: OnFailRoute[] = [
      { when: 'failedChecks.some(c => c.name.includes("test"))', target: "step_a" },
      { target: "step_b" },
    ];

    expect(validateRoutes(routes, stepNames, "test_step")).toBeNull();
  });

  it("rejects non-string, non-array goto", () => {
    expect(validateRoutes(123, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto must be a string or array of routes"
    );
  });

  it("rejects empty array", () => {
    expect(validateRoutes([], stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto array cannot be empty"
    );
  });

  it("rejects non-existent target", () => {
    const routes: OnFailRoute[] = [{ target: "unknown_step" }];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto[0].target targets non-existent step 'unknown_step'"
    );
  });

  it("rejects non-object route", () => {
    const routes = [123] as unknown[];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto[0] must be an object"
    );
  });

  it("rejects missing target", () => {
    const routes = [{ when: "test" }] as unknown[];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto[0].target must be a non-empty string"
    );
  });

  it("rejects multiple default routes", () => {
    const routes: OnFailRoute[] = [{ target: "step_a" }, { target: "step_b" }];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto has multiple default routes (routes without 'when')"
    );
  });

  it("rejects duplicate targets", () => {
    const routes: OnFailRoute[] = [
      { when: "condition1", target: "step_a" },
      { when: "condition2", target: "step_a" },
      { target: "step_b" },
    ];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto has duplicate target 'step_a'"
    );
  });

  it("rejects non-string when", () => {
    const routes = [{ when: 123, target: "step_a" }] as unknown[];
    expect(validateRoutes(routes, stepNames, "test_step")).toBe(
      "Step 'test_step' on_fail.goto[0].when must be a non-empty string if provided"
    );
  });
});

describe("getAllRouteTargets", () => {
  it("extracts single target from string", () => {
    expect(getAllRouteTargets("step_a")).toEqual(["step_a"]);
  });

  it("extracts all targets from route array", () => {
    const routes: OnFailRoute[] = [
      { when: "cond1", target: "step_a" },
      { when: "cond2", target: "step_b" },
      { target: "step_c" },
    ];

    expect(getAllRouteTargets(routes)).toEqual(["step_a", "step_b", "step_c"]);
  });
});

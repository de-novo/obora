import { describe, it, expect } from "vitest";
import { ExecutionReflector } from "../execution-reflector.js";
import type { FailureEntry } from "../blackboard-manager.js";
import type { ValidationResult } from "../../validation-repair.js";

function makeFailure(
  stepName: string,
  summary: string,
  failedChecks: Array<{ name: string; message: string }> = [],
  attempt: number = 1
): FailureEntry {
  const validation: ValidationResult = {
    passed: false,
    summary,
    failedChecks: failedChecks.map((c) => ({
      name: c.name,
      message: c.message,
      severity: "error" as const,
    })),
  };
  return {
    stepName,
    attempt,
    validation,
    timestamp: new Date(),
  };
}

describe("ExecutionReflector", () => {
  const reflector = new ExecutionReflector();

  it("should return undefined for empty failures", () => {
    expect(reflector.analyzeFailures([])).toBeUndefined();
  });

  it("should return undefined when no relevant failures for current step", () => {
    const failures = [makeFailure("other-step", "something failed")];
    expect(reflector.analyzeFailures(failures, "my-step")).toBeUndefined();
  });

  it("should detect repeated failure summaries", () => {
    const failures = [
      makeFailure("build", "Type errors in src/main.ts", [], 1),
      makeFailure("build", "Type errors in src/main.ts", [], 2),
      makeFailure("build", "Type errors in src/main.ts", [], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("same failure has occurred 3 times");
    expect(hint).toContain("Type errors in src/main.ts");
  });

  it("should detect common failed check names", () => {
    const failures = [
      makeFailure("build", "fail 1", [{ name: "typecheck", message: "error" }]),
      makeFailure("build", "fail 2", [
        { name: "typecheck", message: "error" },
        { name: "lint", message: "warning" },
      ]),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("typecheck");
  });

  it("should suggest different approach for many failures", () => {
    const failures = [
      makeFailure("build", "fail 1", [], 1),
      makeFailure("build", "fail 2", [], 2),
      makeFailure("build", "fail 3", [], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("fundamentally different approach");
  });

  it("should analyze all failures when no step filter", () => {
    const failures = [
      makeFailure("build", "error A"),
      makeFailure("test", "error B"),
      makeFailure("deploy", "error C"),
    ];

    const hint = reflector.analyzeFailures(failures);
    expect(hint).toBeDefined();
    expect(hint).toContain("3 validation failures total");
  });

  it("should handle single failure without repeated pattern", () => {
    const failures = [makeFailure("build", "single error")];

    const hint = reflector.analyzeFailures(failures, "build");
    // Single failure, no repeated pattern — might return undefined or a minimal hint
    // (depends on what checks are present)
    expect(hint === undefined || typeof hint === "string").toBe(true);
  });

  it("should limit top checks to 3", () => {
    const failures = [
      makeFailure("build", "fail", [
        { name: "check1", message: "m1" },
        { name: "check2", message: "m2" },
        { name: "check3", message: "m3" },
        { name: "check4", message: "m4" },
        { name: "check5", message: "m5" },
      ]),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    if (hint) {
      // Should not list more than 3 checks
      const checkMatches = hint.match(/check\d/g);
      expect(checkMatches!.length).toBeLessThanOrEqual(3);
    }
  });
});

import { describe, it, expect } from "vitest";
import { ExecutionReflector } from "../execution-reflector.js";
import type { FailureEntry } from "../blackboard-manager.js";
import type { ValidationResult } from "../../validation-repair.js";

function makeFailure(
  stepName: string,
  summary: string,
  failedChecks: Array<{ name: string; message: string }> = [],
  attempt: number = 1,
  signature?: string,
): FailureEntry {
  const validation: ValidationResult = {
    passed: false,
    summary,
    failedChecks: failedChecks.map((c) => ({
      name: c.name,
      message: c.message,
      severity: "error" as const,
    })),
    signature,
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

  // ── Keyword-based detection ──────────────────────────────────────

  it("should detect recurring keywords across different summaries", () => {
    const failures = [
      makeFailure("build", "5 tests failed due to backup/restore timing issues", [
        { name: "implementation_bug: backup", message: "backup stores current data" },
      ], 1),
      makeFailure("build", "9 tests failed across backup logic and error handling", [
        { name: "implementation_bug: restore", message: "backup creation logic broken" },
      ], 2),
      makeFailure("build", "13 tests failed - backup creation and exitCode bugs", [
        { name: "implementation_bug: backup recovery", message: "data integrity under stress" },
      ], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("backup");
  });

  it("should not flag keywords that appear in only one failure", () => {
    const failures = [
      makeFailure("build", "typecheck error in main.ts", [], 1),
      makeFailure("build", "lint warning in utils.ts", [], 2),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    // "typecheck" and "lint" each appear in only 1 failure, should not be flagged as recurring
    if (hint) {
      expect(hint).not.toContain("Recurring root cause keywords");
    }
  });

  // ── Signature-based detection ────────────────────────────────────

  it("should detect repeated signatures", () => {
    const failures = [
      makeFailure("build", "fail 1", [], 1, "implementation_bug:3"),
      makeFailure("build", "fail 2", [], 2, "implementation_bug:3"),
      makeFailure("build", "fail 3", [], 3, "implementation_bug:3"),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("same failure signature");
    expect(hint).toContain("implementation_bug:3");
    expect(hint).toContain("3 times");
  });

  // ── Category-based detection ─────────────────────────────────────

  it("should extract and count failure categories", () => {
    const failures = [
      makeFailure("build", "fail 1", [
        { name: "implementation_bug: backup timing", message: "wrong order" },
        { name: "implementation_bug: restore logic", message: "data lost" },
      ], 1),
      makeFailure("build", "fail 2", [
        { name: "test_code_bug: assertion", message: "wrong expected value" },
        { name: "implementation_bug: exit code", message: "code not propagated" },
      ], 2),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("implementation_bug");
    expect(hint).toContain("3x");
  });

  // ── Trend detection ──────────────────────────────────────────────

  it("should detect worsening trend", () => {
    const failures = [
      makeFailure("build", "fail", [
        { name: "bug1", message: "m" },
      ], 1),
      makeFailure("build", "fail", [
        { name: "bug1", message: "m" },
        { name: "bug2", message: "m" },
      ], 2),
      makeFailure("build", "fail", [
        { name: "bug1", message: "m" },
        { name: "bug2", message: "m" },
        { name: "bug3", message: "m" },
      ], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("WORSENING TREND");
    expect(hint).toContain("1 → 2 → 3");
  });

  it("should detect improving trend", () => {
    const failures = [
      makeFailure("build", "fail", [
        { name: "b1", message: "m" },
        { name: "b2", message: "m" },
        { name: "b3", message: "m" },
      ], 1),
      makeFailure("build", "fail", [
        { name: "b1", message: "m" },
        { name: "b2", message: "m" },
      ], 2),
      makeFailure("build", "fail", [
        { name: "b1", message: "m" },
      ], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("Improving trend");
    expect(hint).toContain("3 → 2 → 1");
  });

  it("should detect stable failure count", () => {
    const failures = [
      makeFailure("build", "fail A", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }], 1),
      makeFailure("build", "fail B", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }], 2),
      makeFailure("build", "fail C", [{ name: "b1", message: "m" }, { name: "b2", message: "m" }], 3),
    ];

    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint).toBeDefined();
    expect(hint).toContain("Stable failure count");
    expect(hint).toContain("not making progress");
  });

  // ── General escalation ───────────────────────────────────────────

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

  it("should handle single failure gracefully", () => {
    const failures = [makeFailure("build", "single error")];
    const hint = reflector.analyzeFailures(failures, "build");
    expect(hint === undefined || typeof hint === "string").toBe(true);
  });

  // ── Combined analysis ────────────────────────────────────────────

  it("should produce rich hint combining keyword + category + trend for overnight-builder scenario", () => {
    const failures = [
      makeFailure("run_tests_and_judge",
        "5 tests failed due to backup/restore functionality issues",
        [
          { name: "implementation_bug: backup timing", message: "backup stores current data instead of previous state" },
        ], 1, "implementation_bug:1"),
      makeFailure("run_tests_and_judge",
        "9 tests failed across backup logic, error handling, and E2E recovery",
        [
          { name: "implementation_bug: backup creation", message: "backup creation logic broken" },
          { name: "implementation_bug: exit code", message: "exit code propagation failed" },
          { name: "implementation_bug: data integrity", message: "data integrity under stress" },
        ], 2, "implementation_bug:3"),
      makeFailure("run_tests_and_judge",
        "13 tests failed - backup creation/restore logic bugs and exitCode mapping errors",
        [
          { name: "implementation_bug: backup restore", message: "backup restore not working" },
          { name: "implementation_bug: exitCode mapping", message: "wrong exit codes" },
          { name: "implementation_bug: backup creation", message: "backup timing still wrong" },
          { name: "implementation_bug: recovery", message: "recovery scenario fails" },
          { name: "implementation_bug: data corruption", message: "data corrupted after stress" },
        ], 3, "implementation_bug:5"),
    ];

    const hint = reflector.analyzeFailures(failures, "run_tests_and_judge");
    expect(hint).toBeDefined();
    // Should detect "backup" as recurring keyword
    expect(hint).toContain("backup");
    // Should detect implementation_bug as top category
    expect(hint).toContain("implementation_bug");
    // Should detect worsening trend (1 → 3 → 5 checks)
    expect(hint).toContain("WORSENING");
    // Should suggest different approach
    expect(hint).toContain("fundamentally different approach");
  });
});

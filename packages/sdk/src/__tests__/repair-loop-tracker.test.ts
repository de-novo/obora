import { describe, expect, it } from "vitest";
import { RepairLoopTracker } from "../execution/repair-loop-tracker.js";
import type { ValidationResult } from "../validation-repair.js";

describe("RepairLoopTracker", () => {
  const tracker = new RepairLoopTracker();
  const executionId = "exec-1";

  const makeValidationResult = (overrides?: Partial<ValidationResult>): ValidationResult => ({
    passed: false,
    summary: "validation failed",
    failedChecks: [{ name: "check-1", message: "error msg", severity: "error" }],
    ...overrides,
  });

  it("returns undefined for unknown execution", () => {
    expect(tracker.getSummary("unknown")).toBeUndefined();
  });

  it("creates summary lazily and returns undefined when no activity", () => {
    tracker.ensureSummary(executionId);
    expect(tracker.getSummary(executionId)).toBeUndefined();
  });

  it("records validation failure", () => {
    const result = makeValidationResult({ summary: "schema mismatch", errorCode: "E001" });
    tracker.recordValidationFailure(executionId, "step-a", result);

    const summary = tracker.getSummary(executionId)!;
    expect(summary.validationFailed).toBe(1);
    expect(summary.lastValidationStep).toBe("step-a");
    expect(summary.lastValidationSummary).toBe("schema mismatch");
    expect(summary.recentValidationFailures).toHaveLength(1);
    expect(summary.recentValidationFailures[0]).toMatchObject({
      stepName: "step-a",
      summary: "schema mismatch",
      errorCode: "E001",
      failedChecks: [{ name: "check-1", message: "error msg", severity: "error" }],
    });
  });

  it("keeps at most 5 recent validation failures", () => {
    const id = "exec-2";
    for (let i = 0; i < 7; i++) {
      tracker.recordValidationFailure(id, `step-${i}`, makeValidationResult({ summary: `fail-${i}` }));
    }
    const summary = tracker.getSummary(id)!;
    expect(summary.recentValidationFailures).toHaveLength(5);
    expect(summary.recentValidationFailures[0]!.summary).toBe("fail-2");
    expect(summary.recentValidationFailures[4]!.summary).toBe("fail-6");
  });

  it("records validation pass", () => {
    const id = "exec-3";
    const result = makeValidationResult({ passed: true, summary: "looks good" });
    tracker.recordValidationPass(id, "step-b", result);

    const summary = tracker.getSummary(id)!;
    expect(summary.validationPassed).toBe(1);
    expect(summary.lastValidationStep).toBe("step-b");
    expect(summary.lastValidationSummary).toBe("looks good");
  });

  it("records repair started and completed", () => {
    const id = "exec-4";
    tracker.recordRepairStarted(id, "step-c", 2);
    tracker.recordRepairCompleted(id, "step-c", 2);

    const summary = tracker.getSummary(id)!;
    expect(summary.repairStarted).toBe(1);
    expect(summary.repairCompleted).toBe(1);
    expect(summary.lastRepairStep).toBe("step-c");
    expect(summary.lastAttempt).toBe(2);
  });

  it("records repair no progress", () => {
    const id = "exec-5";
    tracker.recordRepairNoProgress(id, "stuck on syntax");

    const summary = tracker.getSummary(id)!;
    expect(summary.repairNoProgress).toBe(1);
    expect(summary.lastNoProgressReason).toBe("stuck on syntax");
    expect(summary.lastStopCategory).toBe("no_progress");
  });

  it("records back edge triggered and exhausted", () => {
    const id = "exec-6";
    tracker.recordBackEdgeTriggered(id);
    tracker.recordBackEdgeExhausted(id, "max iterations reached");

    const summary = tracker.getSummary(id)!;
    expect(summary.backEdgeTriggered).toBe(1);
    expect(summary.backEdgeExhausted).toBe(1);
    expect(summary.lastExhaustReason).toBe("max iterations reached");
    expect(summary.lastStopCategory).toBe("exhausted");
  });

  it("clears summary", () => {
    const id = "exec-7";
    tracker.recordBackEdgeTriggered(id);
    expect(tracker.getSummary(id)).toBeDefined();
    tracker.clearSummary(id);
    expect(tracker.getSummary(id)).toBeUndefined();
  });

  it("returns cloned summary to prevent external mutation", () => {
    const id = "exec-8";
    tracker.recordValidationFailure(id, "step-x", makeValidationResult());
    const summary1 = tracker.getSummary(id)!;
    summary1.validationFailed = 999;
    const summary2 = tracker.getSummary(id)!;
    expect(summary2.validationFailed).toBe(1);
  });
});

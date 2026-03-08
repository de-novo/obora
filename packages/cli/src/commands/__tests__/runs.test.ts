import { describe, expect, it, vi, afterEach } from "vitest";

import { inspectPersistedRun, summarizeRepairLoopTimeline } from "../runs.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runs inspect repair-loop summary", () => {
  it("summarizes repair-loop audit timeline", () => {
    const summary = summarizeRepairLoopTimeline([
      {
        action: "workflow.validation_failed",
        stepName: "validate",
        detail: { summary: "Missing READY marker" },
      },
      {
        action: "workflow.repair_started",
        stepName: "build_or_repair",
        detail: { attempt: 2, stepName: "build_or_repair" },
      },
      {
        action: "workflow.repair_completed",
        stepName: "build_or_repair",
        detail: { attempt: 2, stepName: "build_or_repair" },
      },
      {
        action: "workflow.validation_passed",
        stepName: "validate",
        detail: { summary: "Validation passed" },
      },
    ]);

    expect(summary).toEqual(
      expect.objectContaining({
        validationFailed: 1,
        validationPassed: 1,
        repairStarted: 1,
        repairCompleted: 1,
        lastValidationSummary: "Validation passed",
        lastValidationStep: "validate",
        lastRepairStep: "build_or_repair",
        lastAttempt: 2,
      }),
    );
  });

  it("prints repair-loop summary in text inspect output", async () => {
    const runtime = {
      async getRunRecord() {
        return {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "completed",
          startedAt: "2026-03-08T10:00:00.000Z",
          completedAt: "2026-03-08T10:01:00.000Z",
        };
      },
      async getRunSteps() {
        return [
          { stepName: "build_or_repair", status: "completed", durationMs: 100 },
          { stepName: "validate", status: "completed", durationMs: 50 },
        ];
      },
      async getRunArtifacts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async getRunAuditTimeline() {
        return [
          {
            action: "workflow.validation_failed",
            stepName: "validate",
            detail: { summary: "Missing READY marker" },
          },
          {
            action: "workflow.repair_started",
            stepName: "build_or_repair",
            detail: { attempt: 2, stepName: "build_or_repair" },
          },
          {
            action: "workflow.validation_passed",
            stepName: "validate",
            detail: { summary: "Validation passed" },
          },
        ];
      },
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await inspectPersistedRun(runtime, "run-1", { json: false, cost: false, steps: true });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Repair Loop Summary:");
    expect(output).toContain("Validation Failed:   1");
    expect(output).toContain("Validation Passed:   1");
    expect(output).toContain("Repair Started:      1");
    expect(output).toContain("Last Validation:     Validation passed");
  });

  it("includes repairLoop summary in JSON inspect output", async () => {
    const runtime = {
      async getRunRecord() {
        return {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "completed",
          startedAt: "2026-03-08T10:00:00.000Z",
        };
      },
      async getRunSteps() {
        return [];
      },
      async getRunArtifacts() {
        return [];
      },
      async getRunCostSummary() {
        return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] };
      },
      async getRunAuditTimeline() {
        return [
          {
            action: "workflow.validation_failed",
            stepName: "validate",
            detail: { summary: "Missing READY marker" },
          },
          {
            action: "workflow.repair_started",
            stepName: "build_or_repair",
            detail: { attempt: 2, stepName: "build_or_repair" },
          },
        ];
      },
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await inspectPersistedRun(runtime, "run-1", { json: true, cost: false, steps: false });

    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"repairLoop"'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"validationFailed": 1'),
    );
  });
});

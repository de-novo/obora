import { describe, expect, it, vi, afterEach } from "vitest";

import { inspectPersistedRun, listRunsForCli, sortRunsForCli, summarizeRepairLoopTimeline } from "../runs.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runs list triage sorting", () => {
  it("sorts runs by validationFailed descending using persisted repairLoop metadata", () => {
    const runs = [
      { id: "run-a", startedAt: "2026-03-08T10:00:00.000Z", metadata: { repairLoop: { validationFailed: 1, repairStarted: 1 } } },
      { id: "run-b", startedAt: "2026-03-08T11:00:00.000Z", metadata: { repairLoop: { validationFailed: 3, repairStarted: 2 } } },
      { id: "run-c", startedAt: "2026-03-08T12:00:00.000Z" },
    ];

    const sorted = sortRunsForCli(runs, "validationFailed", "desc");
    expect(sorted.map((run) => run.id)).toEqual(["run-b", "run-a", "run-c"]);
  });

  it("sorts runs by repairStarted ascending", () => {
    const runs = [
      { id: "run-a", startedAt: "2026-03-08T10:00:00.000Z", metadata: { repairLoop: { validationFailed: 1, repairStarted: 4 } } },
      { id: "run-b", startedAt: "2026-03-08T11:00:00.000Z", metadata: { repairLoop: { validationFailed: 3, repairStarted: 2 } } },
      { id: "run-c", startedAt: "2026-03-08T12:00:00.000Z" },
    ];

    const sorted = sortRunsForCli(runs, "repairStarted", "asc");
    expect(sorted.map((run) => run.id)).toEqual(["run-c", "run-b", "run-a"]);
  });

  it("filters and sorts post-processed runs for CLI list", async () => {
    const runtime = {
      async listRunRecords() {
        return [
          { id: "run-a", startedAt: "2026-03-08T10:00:00.000Z", metadata: { repairLoop: { validationFailed: 1, repairStarted: 1, repairNoProgress: 0, backEdgeExhausted: 0 } } },
          { id: "run-b", startedAt: "2026-03-08T11:00:00.000Z", metadata: { repairLoop: { validationFailed: 3, repairStarted: 2, repairNoProgress: 1, backEdgeExhausted: 0 } } },
          { id: "run-c", startedAt: "2026-03-08T12:00:00.000Z", metadata: { repairLoop: { validationFailed: 2, repairStarted: 2, repairNoProgress: 0, backEdgeExhausted: 1 } } },
          { id: "run-d", startedAt: "2026-03-08T13:00:00.000Z" },
        ];
      },
    };

    const runs = await listRunsForCli(runtime, {
      repairLoop: "stalled",
      sortBy: "validationFailed",
      order: "desc",
      limit: 10,
    });

    expect(runs.map((run) => run.id)).toEqual(["run-b"]);
  });
});

describe("runs inspect repair-loop summary", () => {
  it("summarizes repair-loop audit timeline", () => {
    const summary = summarizeRepairLoopTimeline([
      {
        action: "workflow.validation_failed",
        stepName: "validate",
        detail: {
          summary: "Missing READY marker",
          errorCode: "VALIDATION_ERROR",
          logPath: "artifacts/VALIDATION-ATTEMPT-01.log",
          failedChecks: [
            { name: "marker", message: "Missing READY marker", file: "artifacts/release-note.md" },
          ],
        },
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
        recentValidationFailures: [
          expect.objectContaining({
            stepName: "validate",
            summary: "Missing READY marker",
          }),
        ],
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
            detail: {
              summary: "Missing READY marker",
              errorCode: "VALIDATION_ERROR",
              logPath: "artifacts/VALIDATION-ATTEMPT-01.log",
              failedChecks: [
                { name: "marker", message: "Missing READY marker", file: "artifacts/release-note.md" },
              ],
            },
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
    expect(output).toContain("Recent Validation Failures (1):");
    expect(output).toContain("artifacts/VALIDATION-ATTEMPT-01.log");
    expect(output).toContain("artifacts/release-note.md");
  });

  it("prefers persisted repairLoop metadata over audit replay", async () => {
    const getRunAuditTimeline = vi.fn(async () => {
      throw new Error("should not load audit timeline when persisted metadata exists");
    });

    const runtime = {
      async getRunRecord() {
        return {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "completed",
          startedAt: "2026-03-08T10:00:00.000Z",
          metadata: {
            repairLoop: {
              validationFailed: 1,
              validationPassed: 1,
              repairStarted: 1,
              repairCompleted: 1,
              repairNoProgress: 0,
              backEdgeTriggered: 1,
              backEdgeExhausted: 0,
              lastValidationSummary: "Validation passed",
              lastValidationStep: "validate",
              lastRepairStep: "build_or_repair",
              lastAttempt: 2,
              recentValidationFailures: [
                {
                  stepName: "validate",
                  summary: "Missing READY marker",
                  errorCode: "VALIDATION_ERROR",
                  logPath: "artifacts/VALIDATION-ATTEMPT-01.log",
                  failedChecks: [
                    { name: "marker", message: "Missing READY marker", file: "artifacts/release-note.md" },
                  ],
                },
              ],
            },
          },
        };
      },
      async getRunSteps() { return []; },
      async getRunArtifacts() { return []; },
      async getRunCostSummary() { return { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }; },
      getRunAuditTimeline,
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await inspectPersistedRun(runtime, "run-1", { json: true, cost: false, steps: false });

    expect(getRunAuditTimeline).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"repairLoop"'));
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining('"auditTimeline"'));
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
            detail: {
              summary: "Missing READY marker",
              errorCode: "VALIDATION_ERROR",
              logPath: "artifacts/VALIDATION-ATTEMPT-01.log",
              failedChecks: [
                { name: "marker", message: "Missing READY marker", file: "artifacts/release-note.md" },
              ],
            },
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
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"recentValidationFailures"'),
    );
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"logPath": "artifacts/VALIDATION-ATTEMPT-01.log"'),
    );
  });
});

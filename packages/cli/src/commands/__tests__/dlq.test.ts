/* eslint-disable import/order */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  FileDLQStore: vi.fn(),
  summarizeDLQ: vi.fn(),
  resolveDLQEntry: vi.fn(),
  OboraError: class OboraError extends Error {
    code: string;

    constructor(message: string, code = "TEST_ERROR") {
      super(message);
      this.code = code;
    }
  },
  OboraErrorCode: {
    POLICY_GATE_TIMEOUT: "POLICY_GATE_TIMEOUT",
    CELL_ABORTED: "CELL_ABORTED",
  },
}));

vi.mock("../runs.js", () => ({
  createRuntime: vi.fn(),
}));

import { FileDLQStore, loadConfig, resolveDLQEntry, summarizeDLQ } from "@obora/sdk";
import { createRuntime as createRunsRuntime } from "../runs.js";

import { createDlqCommand, listDlqEntriesForCli } from "../dlq.js";

describe("dlq command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    vi.mocked(loadConfig).mockResolvedValue({
      dlq: {
        enabled: true,
        filePath: "./data/.obora/dlq/dead-letters.json",
      },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("lists filtered DLQ entries as json using configured file path", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-new",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          stepName: "build_or_repair",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
            },
          },
        },
        {
          id: "entry-old",
          createdAt: "2026-03-09T10:00:00.000Z",
          executionId: "run-2",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "older failure",
          repairAttempts: 1,
          status: "reviewed",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list", "--status", "pending", "--limit", "1", "--json"], {
      from: "user",
    });

    expect(loadConfig).toHaveBeenCalled();
    expect(FileDLQStore).toHaveBeenCalledWith("./data/.obora/dlq/dead-letters.json");

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        total: 1,
        limit: 1,
        offset: 0,
        entries: [
          expect.objectContaining({
            id: "entry-new",
            repairAttempts: 2,
            status: "pending",
          }),
        ],
      })
    );
  });

  it("includes related run indicators in JSON DLQ list output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-new",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          stepName: "build_or_repair",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
              lastValidationSummary: "Missing READY marker in release note",
              lastValidationStep: "validate",
              lastRepairStep: "build_or_repair",
              lastAttempt: 2,
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T09:59:00.000Z",
        metadata: {
          repairLoop: {
            validationFailed: 2,
            validationPassed: 0,
            repairStarted: 1,
            repairCompleted: 0,
            repairNoProgress: 1,
            backEdgeTriggered: 1,
            backEdgeExhausted: 0,
            lastStopCategory: "no_progress",
          },
        },
      }),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.entries).toEqual([
      expect.objectContaining({
        id: "entry-new",
        triage: expect.objectContaining({
          repairAttempts: 2,
          lastStopCategory: "repeated_critical_issue",
          lastValidationSummary: "Missing READY marker in release note",
          lastValidationStep: "validate",
          lastRepairStep: "build_or_repair",
          lastAttempt: 2,
        }),
        relatedRun: expect.objectContaining({
          id: "run-1",
          status: "failed",
          loopState: "STALLED",
          lastStopCategory: "no_progress",
        }),
      }),
    ]);
  });

  it("prints related run indicators in text DLQ list output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-new",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          stepName: "build_or_repair",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
              lastValidationSummary:
                "Missing READY marker in release note due to unresolved section header",
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T09:59:00.000Z",
        metadata: {
          repairLoop: {
            validationFailed: 2,
            validationPassed: 0,
            repairStarted: 1,
            repairCompleted: 0,
            repairNoProgress: 1,
            backEdgeTriggered: 1,
            backEdgeExhausted: 0,
            lastStopCategory: "no_progress",
          },
        },
      }),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Run");
    expect(output).toContain("Run Loop");
    expect(output).toContain("Validation");
    expect(output).toContain("failed");
    expect(output).toContain("STALLED");
    expect(output).toContain("Missing READY marker in rel…");
  });

  it("normalizes multiline validation summaries in text DLQ list output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-wrap",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-wrap",
          workflowName: "repair-workflow",
          stepName: "build_or_repair",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
              lastValidationSummary: "Missing READY marker\nSecond line should be compacted",
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue(null),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).not.toContain("Second line should be compacted\n");
    expect(output).toContain("Missing READY marker Second…");
  });

  it("prints DLQ summary in text mode", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(summarizeDLQ).mockReturnValue({
      totalEntries: 4,
      pendingCount: 2,
      reviewedCount: 1,
      retriedCount: 1,
      dismissedCount: 0,
      oldestPendingAt: "2026-03-09T08:00:00.000Z",
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["summary"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Total Entries:   4");
    expect(output).toContain("Pending:         2");
    expect(output).toContain("Oldest Pending:  2026-03-09T08:00:00.000Z");
  });

  it("includes related persisted run metadata in JSON inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T09:59:00.000Z",
        completedAt: "2026-03-10T10:00:00.000Z",
      }),
      getRunArtifacts: vi.fn().mockResolvedValue([
        {
          stepName: "validate",
          name: "VALIDATION-ATTEMPT-01.log",
          mimeType: "text/plain",
          sizeBytes: 512,
        },
      ]),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({ id: "entry-1", executionId: "run-1" }),
        relatedRun: expect.objectContaining({
          id: "run-1",
          status: "failed",
          startedAt: "2026-03-10T09:59:00.000Z",
        }),
        relatedArtifacts: [
          expect.objectContaining({
            stepName: "validate",
            name: "VALIDATION-ATTEMPT-01.log",
            mimeType: "text/plain",
          }),
        ],
      })
    );
  });

  it("includes curated triage summary in JSON inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-triage",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-triage",
          workflowName: "repair-workflow",
          stepName: "validate",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 3,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
              lastValidationSummary: "Missing READY marker",
              lastValidationStep: "validate",
              lastRepairStep: "build_or_repair",
              lastAttempt: 3,
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue(null),
      getRunArtifacts: vi.fn().mockResolvedValue([]),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-triage", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.triage).toEqual(
      expect.objectContaining({
        stepName: "validate",
        repairAttempts: 3,
        lastStopCategory: "repeated_critical_issue",
        lastValidationSummary: "Missing READY marker",
        lastValidationStep: "validate",
        lastRepairStep: "build_or_repair",
        lastAttempt: 3,
      })
    );
  });

  it("keeps the most recent five artifacts in JSON inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T09:59:00.000Z",
      }),
      getRunArtifacts: vi.fn().mockResolvedValue([
        { stepName: "validate", name: "artifact-1.log", mimeType: "text/plain", sizeBytes: 101 },
        { stepName: "validate", name: "artifact-2.log", mimeType: "text/plain", sizeBytes: 102 },
        { stepName: "validate", name: "artifact-3.log", mimeType: "text/plain", sizeBytes: 103 },
        { stepName: "validate", name: "artifact-4.log", mimeType: "text/plain", sizeBytes: 104 },
        { stepName: "validate", name: "artifact-5.log", mimeType: "text/plain", sizeBytes: 105 },
        { stepName: "validate", name: "artifact-6.log", mimeType: "text/plain", sizeBytes: 106 },
      ]),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.relatedArtifacts.map((artifact: { name: string }) => artifact.name)).toEqual([
      "artifact-6.log",
      "artifact-5.log",
      "artifact-4.log",
      "artifact-3.log",
      "artifact-2.log",
    ]);
  });

  it("prints related persisted run hint in text inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T09:59:00.000Z",
      }),
      getRunArtifacts: vi.fn().mockResolvedValue([
        {
          stepName: "validate",
          name: "VALIDATION-ATTEMPT-01.log",
          mimeType: "text/plain",
          sizeBytes: 512,
        },
      ]),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-1"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Related Run:");
    expect(output).toContain("Status:          failed");
    expect(output).toContain("obora runs inspect run-1");
    expect(output).toContain("Related Artifacts (1):");
    expect(output).toContain("validate/VALIDATION-ATTEMPT-01.log");
    expect(output).toContain("obora artifact get run-1 validate VALIDATION-ATTEMPT-01.log");
  });

  it("prints triage summary in text inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-triage",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-triage",
          workflowName: "repair-workflow",
          stepName: "validate",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 3,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
              lastValidationSummary: "Missing READY marker",
              lastValidationStep: "validate",
              lastRepairStep: "build_or_repair",
              lastAttempt: 3,
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue(null),
      getRunArtifacts: vi.fn().mockResolvedValue([]),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-triage"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Triage Summary:");
    expect(output).toContain("Stop Category:   repeated_critical_issue");
    expect(output).toContain("Validation:      Missing READY marker");
    expect(output).toContain("Repair Step:     build_or_repair");
  });

  it("resolves a DLQ entry and persists actor and note", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    const save = vi.fn().mockResolvedValue(undefined);

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save,
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(resolveDLQEntry).mockReturnValue({
      entries: [
        {
          id: "entry-1",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-1",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "reviewed",
          resolvedBy: "cto",
          resolution: "triaged",
        },
      ],
      lastUpdated: "2026-03-10T10:10:00.000Z",
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(
      [
        "resolve",
        "entry-1",
        "--status",
        "reviewed",
        "--actor",
        "cto",
        "--note",
        "triaged",
        "--json",
      ],
      { from: "user" }
    );

    expect(resolveDLQEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ id: "entry-1" })],
      }),
      "entry-1",
      {
        status: "reviewed",
        actor: "cto",
        note: "triaged",
      }
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        entries: [expect.objectContaining({ id: "entry-1", status: "reviewed" })],
      })
    );

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.entry).toEqual(expect.objectContaining({ id: "entry-1", status: "reviewed" }));
  });

  it("inherits root --json for summary output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(summarizeDLQ).mockReturnValue({
      totalEntries: 1,
      pendingCount: 1,
      reviewedCount: 0,
      retriedCount: 0,
      dismissedCount: 0,
      oldestPendingAt: "2026-03-09T08:00:00.000Z",
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createDlqCommand());

    await root.parseAsync(["--json", "dlq", "summary"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        totalEntries: 1,
        pendingCount: 1,
        lastUpdated: "2026-03-10T10:05:00.000Z",
      })
    );
  });

  it("inherits root --json for list output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-root-list",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-root-list",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 1,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createDlqCommand());

    await root.parseAsync(["--json", "dlq", "list", "--limit", "1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        total: 1,
        limit: 1,
        entries: [expect.objectContaining({ id: "entry-root-list", status: "pending" })],
      })
    );
  });

  it("inherits root --json for inspect output", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-root-inspect",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-root-inspect",
          workflowName: "repair-workflow",
          stepName: "repair",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 2,
          status: "pending",
          metadata: {
            repairLoop: {
              lastStopCategory: "repeated_critical_issue",
            },
          },
        },
      ],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue(null),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createDlqCommand());

    await root.parseAsync(["--json", "dlq", "inspect", "entry-root-inspect"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        entry: expect.objectContaining({
          id: "entry-root-inspect",
        }),
        triage: expect.objectContaining({
          repairAttempts: 2,
          lastStopCategory: "repeated_critical_issue",
        }),
      })
    );
  });

  it("inherits root --json for resolve output", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const load = vi.fn().mockResolvedValue({
      entries: [
        {
          id: "entry-root-resolve",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-root-resolve",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 1,
          status: "pending",
        },
      ],
      lastUpdated: "2026-03-10T10:10:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save,
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(resolveDLQEntry).mockReturnValue({
      entries: [
        {
          id: "entry-root-resolve",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-root-resolve",
          workflowName: "repair-workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "repair failed",
          repairAttempts: 1,
          status: "retried",
          resolution: {
            actor: "cto",
            note: "root-json",
            resolvedAt: "2026-03-10T10:12:00.000Z",
          },
        },
      ],
      lastUpdated: "2026-03-10T10:12:00.000Z",
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createDlqCommand());

    await root.parseAsync(
      [
        "--json",
        "dlq",
        "resolve",
        "entry-root-resolve",
        "--status",
        "retried",
        "--actor",
        "cto",
        "--note",
        "root-json",
      ],
      { from: "user" }
    );

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.entry).toEqual(
      expect.objectContaining({
        id: "entry-root-resolve",
        status: "retried",
      })
    );
    expect(save).toHaveBeenCalled();
  });

  it("uses validation exit code instead of process.exit for missing entries", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "missing-entry"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(2);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for DLQ store errors", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockRejectedValue(new Error("disk offline")),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["summary"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(3);
    expect(error).toHaveBeenCalled();
  });

  it("sorts and paginates DLQ snapshots without command IO", () => {
    const payload = listDlqEntriesForCli(
      {
        entries: [
          {
            id: "entry-old",
            createdAt: "2026-03-09T10:00:00.000Z",
            executionId: "run-old",
            workflowName: "workflow",
            errorCode: "SDK_STEP_FAILED",
            errorMessage: "old",
            repairAttempts: 1,
            status: "reviewed",
          },
          {
            id: "entry-new",
            createdAt: "2026-03-10T10:00:00.000Z",
            executionId: "run-new",
            workflowName: "workflow",
            errorCode: "SDK_STEP_FAILED",
            errorMessage: "new",
            repairAttempts: 1,
            status: "pending",
          },
        ],
        lastUpdated: "2026-03-10T10:05:00.000Z",
      },
      {}
    );

    expect(payload).toEqual(
      expect.objectContaining({
        total: 2,
        limit: 50,
        offset: 0,
        pending: 1,
        entries: [
          expect.objectContaining({ id: "entry-new" }),
          expect.objectContaining({ id: "entry-old" }),
        ],
      })
    );
  });

  it("prints empty list text when no entries match", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "No DLQ entries found."
    );
  });

  it("reports validation errors for invalid list options", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list", "--status", "closed"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Invalid DLQ status"
    );

    process.exitCode = undefined;
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    await cmd.parseAsync(["list", "--limit", "-1"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Invalid limit: -1"
    );

    process.exitCode = undefined;
    await cmd.parseAsync(["list", "--offset", "NaN"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Invalid offset: NaN"
    );
  });

  it("reports config resolution errors with non-Error payloads", async () => {
    vi.mocked(loadConfig).mockRejectedValueOnce("config unavailable");

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["summary"], { from: "user" });

    expect(process.exitCode).toBe(3);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Failed to resolve DLQ config: config unavailable"
    );
  });

  it("summarizes related run loop states in JSON list output", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-exhausted",
                createdAt: "2026-03-10T10:06:00.000Z",
                executionId: "run-exhausted",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "exhausted",
                repairAttempts: 1,
                status: "pending",
              },
              {
                id: "entry-converged",
                createdAt: "2026-03-10T10:05:00.000Z",
                executionId: "run-converged",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "converged",
                repairAttempts: 1,
                status: "pending",
              },
              {
                id: "entry-repaired",
                createdAt: "2026-03-10T10:04:00.000Z",
                executionId: "run-repaired",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repaired",
                repairAttempts: 1,
                status: "pending",
              },
              {
                id: "entry-passed",
                createdAt: "2026-03-10T10:03:00.000Z",
                executionId: "run-passed",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "passed",
                repairAttempts: 1,
                status: "pending",
              },
              {
                id: "entry-missing",
                createdAt: "2026-03-10T10:02:00.000Z",
                executionId: "run-missing",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "missing",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:06:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    const runById = new Map<string, unknown>([
      [
        "run-exhausted",
        {
          id: "run-exhausted",
          metadata: { repairLoop: { backEdgeExhausted: 1 } },
        },
      ],
      [
        "run-converged",
        {
          id: "run-converged",
          status: "failed",
          metadata: { repairLoop: { validationFailed: 1, validationPassed: 1 } },
        },
      ],
      [
        "run-repaired",
        {
          id: "run-repaired",
          startedAt: "2026-03-10T10:00:00.000Z",
          metadata: { repairLoop: { repairStarted: 1 } },
        },
      ],
      [
        "run-passed",
        {
          id: "run-passed",
          completedAt: "2026-03-10T10:01:00.000Z",
          metadata: { repairLoop: { validationPassed: 1 } },
        },
      ],
    ]);
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn((runId: string) => Promise.resolve(runById.get(runId) ?? null)),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.entries.map((entry: { relatedRun?: { loopState?: string } }) => entry.relatedRun?.loopState)).toEqual([
      "EXHAUSTED",
      "CONVERGED",
      "REPAIRED",
      "PASSED",
      undefined,
    ]);
  });

  it("omits related list context when runtime lookup fails", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-runtime-fail",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-runtime-fail",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "runtime fail",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockRejectedValueOnce(new Error("runtime offline"));

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.entries).toEqual([
      expect.not.objectContaining({
        relatedRun: expect.anything(),
      }),
    ]);
  });

  it("falls back when related artifact lookup fails during inspect", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-artifact-fail",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-artifact-fail",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "artifact fail",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-artifact-fail",
        status: "failed",
      }),
      getRunArtifacts: vi.fn().mockRejectedValue(new Error("artifact store offline")),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-artifact-fail", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.relatedRun).toEqual(expect.objectContaining({ id: "run-artifact-fail" }));
    expect(payload.relatedArtifacts).toBeUndefined();
  });

  it("prints every optional DLQ inspect field in text output", async () => {
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-full-text",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-full-text",
                workflowName: "workflow",
                stepName: "validate",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "full text",
                errorStack: "Error: full text",
                repairAttempts: 2,
                status: "reviewed",
                resolvedAt: "2026-03-10T10:03:00.000Z",
                resolvedBy: "ops",
                resolution: "reviewed manually",
                metadata: {
                  repairLoop: {
                    lastStopCategory: "operator_review",
                    lastValidationStep: "validate",
                    lastRepairStep: "repair",
                    lastAttempt: 2,
                  },
                },
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(createRunsRuntime).mockResolvedValue({
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-full-text",
        status: "failed",
        completedAt: "2026-03-10T10:02:00.000Z",
      }),
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["inspect", "entry-full-text"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Resolved At:     2026-03-10T10:03:00.000Z");
    expect(output).toContain("Resolved By:     ops");
    expect(output).toContain("Resolution:      reviewed manually");
    expect(output).toContain("Error Stack:     Error: full text");
    expect(output).toContain("Metadata:");
    expect(output).toContain("Completed:       2026-03-10T10:02:00.000Z");
    expect(output).toContain("Validator:       validate");
    expect(output).toContain("Last Attempt:    2");
  });

  it("reports resolve validation, persistence, and missing-update failures", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["resolve", "entry-1", "--status", "pending"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Invalid resolution status"
    );

    process.exitCode = undefined;
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn(),
          append: vi.fn(),
        }) as never;
      }
    );
    await cmd.parseAsync(["resolve", "missing", "--status", "reviewed"], { from: "user" });
    expect(process.exitCode).toBe(2);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "DLQ entry not found: missing"
    );

    process.exitCode = undefined;
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-save-fail",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-save-fail",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "save fail",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn().mockRejectedValue(new Error("disk full")),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(resolveDLQEntry).mockReturnValue({
      entries: [
        {
          id: "entry-save-fail",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-save-fail",
          workflowName: "workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "save fail",
          repairAttempts: 1,
          status: "reviewed",
        },
      ],
      lastUpdated: "2026-03-10T10:06:00.000Z",
    } as never);
    await cmd.parseAsync(["resolve", "entry-save-fail", "--status", "reviewed"], { from: "user" });
    expect(process.exitCode).toBe(3);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Failed to save DLQ store: disk full"
    );

    process.exitCode = undefined;
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-update-missing",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-update-missing",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "update missing",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save: vi.fn().mockResolvedValue(undefined),
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(resolveDLQEntry).mockReturnValue({
      entries: [],
      lastUpdated: "2026-03-10T10:06:00.000Z",
    } as never);
    await cmd.parseAsync(["resolve", "entry-update-missing", "--status", "dismissed"], {
      from: "user",
    });
    expect(process.exitCode).toBe(3);
    expect(error.mock.calls.map((args) => args.join(" ")).join("\n")).toContain(
      "Failed to resolve DLQ entry: entry-update-missing"
    );
  });

  it("prints text resolve success with actor and note", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "entry-text-resolve",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-text-resolve",
                workflowName: "workflow",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "text resolve",
                repairAttempts: 1,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
          save,
          append: vi.fn(),
        }) as never;
      }
    );
    vi.mocked(resolveDLQEntry).mockReturnValue({
      entries: [
        {
          id: "entry-text-resolve",
          createdAt: "2026-03-10T10:00:00.000Z",
          executionId: "run-text-resolve",
          workflowName: "workflow",
          errorCode: "SDK_STEP_FAILED",
          errorMessage: "text resolve",
          repairAttempts: 1,
          status: "dismissed",
          resolvedBy: "ops",
          resolution: "not actionable",
        },
      ],
      lastUpdated: "2026-03-10T10:06:00.000Z",
    } as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(
      [
        "resolve",
        "entry-text-resolve",
        "--status",
        "dismissed",
        "--actor",
        "ops",
        "--note",
        "not actionable",
      ],
      { from: "user" }
    );

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Resolved DLQ entry entry-text-resolve as dismissed.");
    expect(output).toContain("Actor: ops");
    expect(output).toContain("Note:  not actionable");
    expect(save).toHaveBeenCalled();
  });
});

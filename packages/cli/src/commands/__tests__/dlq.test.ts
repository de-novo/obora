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

import { createDlqCommand } from "../dlq.js";

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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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

  it("prints DLQ summary in text mode", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save,
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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

  it("uses validation exit code instead of process.exit for missing entries", async () => {
    const load = vi.fn().mockResolvedValue({
      entries: [],
      lastUpdated: "2026-03-10T10:05:00.000Z",
    });
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load,
          save: vi.fn(),
          append: vi.fn(),
        }) as never
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
      () =>
        ({
          load: vi.fn().mockRejectedValue(new Error("disk offline")),
          save: vi.fn(),
          append: vi.fn(),
        }) as never
    );

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createDlqCommand();

    await cmd.parseAsync(["summary"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(3);
    expect(error).toHaveBeenCalled();
  });
});

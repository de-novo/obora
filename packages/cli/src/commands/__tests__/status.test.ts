/* eslint-disable import/order */
/**
 * status command tests
 */

import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  FileDLQStore: vi.fn(),
  summarizeDLQ: vi.fn(),
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
  getCliRepairLoopState: vi.fn(
    (summary?: { backEdgeExhausted?: number; repairNoProgress?: number }) => {
      if (!summary) return "-";
      if ((summary.backEdgeExhausted ?? 0) > 0) return "EXHAUSTED";
      if ((summary.repairNoProgress ?? 0) > 0) return "STALLED";
      return "REPAIRED";
    }
  ),
}));

import { FileDLQStore, loadConfig, summarizeDLQ } from "@obora/sdk";

import { ExitCode } from "../../utils/exit-codes.js";
import { createRuntime } from "../runs.js";
import { createStatusCommand, runStatus } from "../status.js";

describe("status command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);

    vi.mocked(loadConfig).mockResolvedValue({
      dlq: {
        filePath: "./data/.obora/dlq/dead-letters.json",
      },
    } as never);
    vi.mocked(summarizeDLQ).mockReturnValue({
      totalEntries: 2,
      pendingCount: 1,
      reviewedCount: 1,
      retriedCount: 0,
      dismissedCount: 0,
      oldestPendingAt: "2026-03-10T09:00:00.000Z",
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  function mockRuntimeAndDlq() {
    const listRunRecords = vi.fn().mockResolvedValue([
      {
        id: "run-1",
        workflowName: "repair-workflow",
        status: "failed",
        startedAt: "2026-03-10T10:00:00.000Z",
        completedAt: "2026-03-10T10:05:00.000Z",
        metadata: {
          repairLoop: {
            validationFailed: 2,
            validationPassed: 1,
            repairStarted: 1,
            repairCompleted: 1,
            repairNoProgress: 0,
            backEdgeTriggered: 0,
            backEdgeExhausted: 1,
            lastStopCategory: "repeated_critical_issue",
          },
        },
      },
    ]);

    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords,
    } as never);

    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "dlq-1",
                createdAt: "2026-03-10T10:06:00.000Z",
                executionId: "run-1",
                workflowName: "repair-workflow",
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
            lastUpdated: "2026-03-10T10:07:00.000Z",
          }),
        }) as never;
      }
    );

    return { listRunRecords };
  }

  it("creates status command with modern options", () => {
    const cmd = createStatusCommand();

    expect(cmd.name()).toBe("status");
    expect(cmd.description()).toBe("Show persisted run and DLQ status overview");
    expect(cmd.options.find((opt) => opt.long === "--json")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--workflow")).toBeDefined();
    expect(cmd.options.find((opt) => opt.long === "--limit")?.defaultValue).toBe("5");
  });

  it("supports local --json for status", async () => {
    mockRuntimeAndDlq();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--json"], { from: "user" });

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload).toEqual(
      expect.objectContaining({
        runs: expect.objectContaining({
          totalListed: 1,
          byStatus: expect.objectContaining({ failed: 1 }),
          latest: expect.objectContaining({
            id: "run-1",
            loopState: "EXHAUSTED",
            triageCause: "repeated_critical_issue",
          }),
        }),
        dlq: expect.objectContaining({
          totalEntries: 2,
          pendingCount: 1,
          lastUpdated: "2026-03-10T10:07:00.000Z",
        }),
      })
    );
  });

  it("inherits root --json for status", async () => {
    mockRuntimeAndDlq();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const root = new Command("obora").option("--json");
    root.addCommand(createStatusCommand());

    await root.parseAsync(["--json", "status"], { from: "user" });

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload.runs.latest).toEqual(
      expect.objectContaining({
        id: "run-1",
      })
    );
  });

  it("propagates workflow filter and limit into status json payload and runtime query", async () => {
    const { listRunRecords } = mockRuntimeAndDlq();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--json", "--workflow", "repair-workflow", "--limit", "10"], {
      from: "user",
    });

    expect(listRunRecords).toHaveBeenCalledWith({
      workflow: "repair-workflow",
      limit: 10,
    });

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload).toEqual(
      expect.objectContaining({
        workflow: "repair-workflow",
        runs: expect.objectContaining({
          totalListed: 1,
        }),
      })
    );
  });

  it("uses validation exit code for invalid status limit without generic hints", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--limit", "abc"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("rejects non-positive status limits with validation exit code", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--limit", "0"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
  });

  it("uses execution-failed exit code for status runtime errors", async () => {
    vi.mocked(createRuntime).mockRejectedValue(new Error("sqlite offline"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync([], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });

  it("prints text overview when not using json", async () => {
    mockRuntimeAndDlq();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync([], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Status Overview");
    expect(output).toContain("Latest Run");
    expect(output).toContain("DLQ Summary");
    expect(output).toContain("Recent Runs");
  });

  it("prints empty run status text without latest-run section", async () => {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([]),
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:07:00.000Z",
          }),
        }) as never;
      }
    );
    vi.mocked(summarizeDLQ).mockReturnValue({
      totalEntries: 0,
      pendingCount: 0,
      reviewedCount: 0,
      retriedCount: 0,
      dismissedCount: 0,
    } as never);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync([], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Run Status Counts: none");
    expect(output).toContain("No persisted runs found.");
    expect(output).not.toContain("Latest Run");
  });

  it("uses DLQ linked stop category when repair metadata has no category", async () => {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          workflowName: "repair-workflow",
          status: undefined,
          startedAt: "2026-03-10T10:00:00.000Z",
          metadata: {
            repairLoop: {
              validationFailed: 1,
              repairStarted: 1,
              repairNoProgress: 1,
            },
          },
        },
      ]),
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "old-dlq",
                createdAt: "2026-03-10T10:05:00.000Z",
                executionId: "run-1",
                errorCode: "OLD",
                errorMessage: "old",
                repairAttempts: 1,
                status: "reviewed",
              },
              {
                id: "new-dlq",
                createdAt: "2026-03-10T10:06:00.000Z",
                executionId: "run-1",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repair failed",
                repairAttempts: 2,
                status: "pending",
                stepName: "validate",
                metadata: {
                  repairLoop: {
                    lastStopCategory: "no_progress",
                  },
                },
              },
            ],
            lastUpdated: "2026-03-10T10:07:00.000Z",
          }),
        }) as never;
      }
    );
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--json"], { from: "user" });

    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload.runs.byStatus).toEqual({ unknown: 1 });
    expect(payload.runs.latest).toEqual(
      expect.objectContaining({
        loopState: "STALLED",
        triageCause: "no_progress",
        linkedDlqEntry: expect.objectContaining({
          id: "new-dlq",
          stepName: "validate",
          lastStopCategory: "no_progress",
        }),
      })
    );
  });

  it("uses execution-failed exit code for status run and DLQ read failures", async () => {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockRejectedValue(new Error("runs table unavailable")),
    } as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync([], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("runs table unavailable"));

    process.exitCode = undefined;
    error.mockClear();
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([{ id: "run-1" }]),
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockRejectedValue(new Error("dlq unreadable")),
        }) as never;
      }
    );

    await cmd.parseAsync([], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("dlq unreadable"));
  });

  it("uses default status limit and root JSON when run directly", async () => {
    const listRunRecords = vi.fn().mockResolvedValue([
      {
        id: "run-direct",
        status: "completed",
        metadata: {
          repairLoop: [],
        },
      },
    ]);
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords,
    } as never);
    vi.mocked(loadConfig).mockResolvedValue({} as never);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:07:00.000Z",
          }),
        }) as never;
      }
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runStatus({}, { json: true });

    expect(listRunRecords).toHaveBeenCalledWith({ limit: 5 });
    expect(FileDLQStore).toHaveBeenCalledWith(".obora/dlq/dead-letters.json");
    const payload = JSON.parse(String(log.mock.calls.at(-1)?.[0] ?? "{}"));
    expect(payload.runs.latest).toEqual(
      expect.objectContaining({
        id: "run-direct",
        status: "completed",
      })
    );
  });

  it("prints fallback text for sparse run and DLQ records", async () => {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([
        {
          id: "run-sparse",
        },
      ]),
    } as never);
    vi.mocked(loadConfig).mockResolvedValue({} as never);
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "unrelated-dlq",
                createdAt: "2026-03-10T10:08:00.000Z",
                executionId: "other-run",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "unrelated",
                repairAttempts: 1,
                status: "pending",
              },
              {
                id: "linked-without-category",
                createdAt: "2026-03-10T10:07:00.000Z",
                executionId: "run-sparse",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "linked",
                repairAttempts: 3,
                status: "reviewed",
                metadata: {
                  repairLoop: [],
                },
              },
            ],
          }),
        }) as never;
      }
    );
    vi.mocked(summarizeDLQ).mockReturnValue({} as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync([], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Workflow: -");
    expect(output).toContain("Status: -");
    expect(output).toContain("Started At: -");
    expect(output).toContain("Total Entries: 0");
    expect(output).toContain("Pending: 0");
    expect(output).toContain("reviewed/3");
    expect(output).not.toContain("Last Updated:");
  });

  it("reports non-Error DLQ summary failures", async () => {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([{ id: "run-1" }]),
    } as never);
    vi.mocked(loadConfig).mockResolvedValueOnce({
      dlq: {
        filePath: "./data/.obora/dlq/dead-letters.json",
      },
    } as never);
    vi.mocked(loadConfig).mockRejectedValueOnce("summary config unavailable");
    vi.mocked(FileDLQStore).mockImplementation(
      function () {
        return ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:07:00.000Z",
          }),
        }) as never;
      }
    );
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createStatusCommand();

    await cmd.parseAsync(["--json"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load status DLQ summary: summary config unavailable")
    );
  });
});

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
import { createStatusCommand } from "../status.js";

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

  function mockRuntimeAndDlq(): void {
    vi.mocked(createRuntime).mockResolvedValue({
      listRunRecords: vi.fn().mockResolvedValue([
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
      ]),
    } as never);

    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
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
        }) as never
    );
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
});

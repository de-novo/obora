import { FileDLQStore, OboraRuntime, loadConfig } from "@obora/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oboraRuntimeState: {
  instance?: {
    listRunRecords?: () => Promise<unknown[]>;
    getRunRecord?: () => Promise<unknown>;
    getRunSteps?: () => Promise<unknown[]>;
    getRunArtifacts?: () => Promise<unknown[]>;
    getRunCostSummary?: () => Promise<unknown>;
    getRunAuditTimeline?: () => Promise<unknown[]>;
  };
} = {};

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
  FileDLQStore: vi.fn(),
  OboraRuntime: vi.fn().mockImplementation(() => oboraRuntimeState.instance),
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

import { createCLI } from "../../cli.js";
import { ExitCode } from "../../utils/exit-codes.js";
import {
  createRunsCommand,
  getCliRepairLoopState,
  inspectPersistedRun,
  listRunsForCli,
  sortRunsForCli,
  summarizeRepairLoopTimeline,
} from "../runs.js";
import type { RepairLoopInspectSummary } from "../runs.js";

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit:${code ?? "undefined"}`);
  }) as never);
  process.exitCode = undefined;
  vi.mocked(loadConfig).mockResolvedValue({
    dlq: { filePath: "./data/.obora/dlq/dead-letters.json" },
    persistence: { enabled: true, adapter: "sqlite", sqlite: { path: "./data/obora.db" } },
  } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

function makeRepairLoopSummary(
  overrides: Partial<RepairLoopInspectSummary> = {}
): RepairLoopInspectSummary {
  return {
    validationFailed: 0,
    validationPassed: 0,
    repairStarted: 0,
    repairCompleted: 0,
    repairNoProgress: 0,
    backEdgeTriggered: 0,
    backEdgeExhausted: 0,
    recentValidationFailures: [],
    ...overrides,
  };
}

describe("runs list triage sorting", () => {
  it("sorts runs by validationFailed descending using persisted repairLoop metadata", () => {
    const runs = [
      {
        id: "run-a",
        startedAt: "2026-03-08T10:00:00.000Z",
        metadata: { repairLoop: { validationFailed: 1, repairStarted: 1 } },
      },
      {
        id: "run-b",
        startedAt: "2026-03-08T11:00:00.000Z",
        metadata: { repairLoop: { validationFailed: 3, repairStarted: 2 } },
      },
      { id: "run-c", startedAt: "2026-03-08T12:00:00.000Z" },
    ];

    const sorted = sortRunsForCli(runs, "validationFailed", "desc");
    expect(sorted.map((run) => run.id)).toEqual(["run-b", "run-a", "run-c"]);
  });

  it("sorts runs by repairStarted ascending", () => {
    const runs = [
      {
        id: "run-a",
        startedAt: "2026-03-08T10:00:00.000Z",
        metadata: { repairLoop: { validationFailed: 1, repairStarted: 4 } },
      },
      {
        id: "run-b",
        startedAt: "2026-03-08T11:00:00.000Z",
        metadata: { repairLoop: { validationFailed: 3, repairStarted: 2 } },
      },
      { id: "run-c", startedAt: "2026-03-08T12:00:00.000Z" },
    ];

    const sorted = sortRunsForCli(runs, "repairStarted", "asc");
    expect(sorted.map((run) => run.id)).toEqual(["run-c", "run-b", "run-a"]);
  });

  it("derives compact CLI repair-loop states", () => {
    expect(getCliRepairLoopState(undefined)).toBe("-");
    expect(
      getCliRepairLoopState(
        makeRepairLoopSummary({
          validationFailed: 1,
          repairStarted: 1,
          backEdgeTriggered: 1,
          backEdgeExhausted: 1,
        })
      )
    ).toBe("EXHAUSTED");
    expect(
      getCliRepairLoopState(
        makeRepairLoopSummary({
          validationFailed: 2,
          repairStarted: 2,
          repairCompleted: 1,
          repairNoProgress: 1,
          backEdgeTriggered: 2,
        })
      )
    ).toBe("STALLED");
    expect(
      getCliRepairLoopState(
        makeRepairLoopSummary({
          validationFailed: 1,
          validationPassed: 1,
          repairStarted: 1,
          repairCompleted: 1,
          backEdgeTriggered: 1,
        })
      )
    ).toBe("CONVERGED");
  });

  it("filters and sorts post-processed runs for CLI list", async () => {
    const runtime = {
      async listRunRecords() {
        return [
          {
            id: "run-a",
            startedAt: "2026-03-08T10:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 1,
                repairStarted: 1,
                repairNoProgress: 0,
                backEdgeExhausted: 0,
              },
            },
          },
          {
            id: "run-b",
            startedAt: "2026-03-08T11:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 3,
                repairStarted: 2,
                repairNoProgress: 1,
                backEdgeExhausted: 0,
              },
            },
          },
          {
            id: "run-c",
            startedAt: "2026-03-08T12:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 2,
                repairStarted: 2,
                repairNoProgress: 0,
                backEdgeExhausted: 1,
              },
            },
          },
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

  it("filters runs by repair-loop stop category", async () => {
    const runtime = {
      async listRunRecords() {
        return [
          {
            id: "run-critical",
            startedAt: "2026-03-08T10:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 2,
                repairStarted: 1,
                repairNoProgress: 1,
                lastStopCategory: "repeated_critical_issue",
              },
            },
          },
          {
            id: "run-no-progress",
            startedAt: "2026-03-08T11:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 2,
                repairStarted: 1,
                repairNoProgress: 1,
                lastStopCategory: "no_progress",
              },
            },
          },
          {
            id: "run-exhausted",
            startedAt: "2026-03-08T12:00:00.000Z",
            metadata: {
              repairLoop: {
                validationFailed: 4,
                repairStarted: 3,
                backEdgeExhausted: 1,
                lastStopCategory: "exhausted",
              },
            },
          },
        ];
      },
    };

    const criticalRuns = await listRunsForCli(runtime, {
      repairLoop: "critical",
      sortBy: "startedAt",
      order: "desc",
      limit: 10,
    });
    expect(criticalRuns.map((run) => run.id)).toEqual(["run-critical"]);

    const noProgressRuns = await listRunsForCli(runtime, {
      repairLoop: "no-progress",
      sortBy: "startedAt",
      order: "desc",
      limit: 10,
    });
    expect(noProgressRuns.map((run) => run.id)).toEqual(["run-no-progress"]);
  });

  it("includes linked DLQ indicators in JSON runs list output", async () => {
    oboraRuntimeState.instance = {
      listRunRecords: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "failed",
          startedAt: "2026-03-08T10:00:00.000Z",
        },
        {
          id: "run-2",
          workflowName: "validation-repair-loop-example",
          status: "completed",
          startedAt: "2026-03-08T09:00:00.000Z",
        },
      ]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    vi.mocked(loadConfig).mockResolvedValue({
      dlq: { filePath: "./data/.obora/dlq/dead-letters.json" },
      persistence: { enabled: true, adapter: "sqlite", sqlite: { path: "./data/obora.db" } },
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "dlq-1",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-1",
                workflowName: "validation-repair-loop-example",
                stepName: "validate",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repair failed",
                repairAttempts: 3,
                status: "pending",
                metadata: {
                  repairLoop: {
                    lastStopCategory: "repeated_critical_issue",
                  },
                },
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createRunsCommand();

    await cmd.parseAsync(["list", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "[]");
    expect(payload).toEqual([
      expect.objectContaining({
        id: "run-1",
        triageCause: "repeated_critical_issue",
        linkedDlqEntry: expect.objectContaining({
          id: "dlq-1",
          status: "pending",
          repairAttempts: 3,
          lastStopCategory: "repeated_critical_issue",
        }),
      }),
      expect.objectContaining({
        id: "run-2",
      }),
    ]);
    expect(payload[1].linkedDlqEntry).toBeUndefined();
  });

  it("prints linked DLQ indicators in text runs list output", async () => {
    oboraRuntimeState.instance = {
      listRunRecords: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "failed",
          startedAt: "2026-03-08T10:00:00.000Z",
          metadata: {
            repairLoop: {
              validationFailed: 2,
              repairStarted: 1,
              repairNoProgress: 1,
            },
          },
        },
      ]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    vi.mocked(loadConfig).mockResolvedValue({
      dlq: { filePath: "./data/.obora/dlq/dead-letters.json" },
      persistence: { enabled: true, adapter: "sqlite", sqlite: { path: "./data/obora.db" } },
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "dlq-1",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-1",
                workflowName: "validation-repair-loop-example",
                stepName: "validate",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repair failed",
                repairAttempts: 3,
                status: "pending",
                metadata: {
                  repairLoop: {
                    lastStopCategory: "repeated_critical_issue",
                  },
                },
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createRunsCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("DLQ");
    expect(output).toContain("Cause");
    expect(output).toContain("pending/3");
    expect(output).toContain("repeated_critical_issue");
  });

  it("inherits root --json for runs list output", async () => {
    oboraRuntimeState.instance = {
      listRunRecords: vi.fn().mockResolvedValue([
        {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "failed",
          startedAt: "2026-03-08T10:00:00.000Z",
        },
      ]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "runs", "list"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "[]");
    expect(payload).toEqual([expect.objectContaining({ id: "run-1" })]);
  });

  it("inherits root --json for runs inspect output", async () => {
    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "validation-repair-loop-example",
        status: "failed",
        startedAt: "2026-03-08T10:00:00.000Z",
      }),
      getRunSteps: vi.fn().mockResolvedValue([]),
      getRunArtifacts: vi.fn().mockResolvedValue([]),
      getRunCostSummary: vi.fn().mockResolvedValue({
        totalTokens: 0,
        totalCostUsd: 0,
        byStep: [],
        byModel: [],
      }),
      getRunAuditTimeline: vi.fn().mockResolvedValue([]),
      listRunRecords: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "runs", "inspect", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.run).toEqual(expect.objectContaining({ id: "run-1" }));
  });

  it("uses validation exit code instead of process.exit for missing runs", async () => {
    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue(null),
      getRunSteps: vi.fn(),
      getRunArtifacts: vi.fn(),
      getRunCostSummary: vi.fn(),
      getRunAuditTimeline: vi.fn(),
      listRunRecords: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createRunsCommand();

    await cmd.parseAsync(["inspect", "missing-run"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for run storage errors", async () => {
    oboraRuntimeState.instance = {
      listRunRecords: vi.fn().mockRejectedValue(new Error("sqlite offline")),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createRunsCommand();

    await cmd.parseAsync(["list"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });

  it("uses validation exit code for invalid runs list options", async () => {
    oboraRuntimeState.instance = {
      listRunRecords: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createRunsCommand();

    await cmd.parseAsync(["list", "--limit", "abc"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
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
      })
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
                {
                  name: "marker",
                  message: "Missing READY marker",
                  file: "artifacts/release-note.md",
                },
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
                    {
                      name: "marker",
                      message: "Missing READY marker",
                      file: "artifacts/release-note.md",
                    },
                  ],
                },
              ],
            },
          },
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
                {
                  name: "marker",
                  message: "Missing READY marker",
                  file: "artifacts/release-note.md",
                },
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

    expect(log).toHaveBeenCalledWith(expect.stringContaining('"repairLoop"'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"validationFailed": 1'));
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"recentValidationFailures"'));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('"logPath": "artifacts/VALIDATION-ATTEMPT-01.log"')
    );
  });

  it("includes linked DLQ entry in JSON inspect output", async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      dlq: { filePath: "./data/.obora/dlq/dead-letters.json" },
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "dlq-1",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-1",
                workflowName: "validation-repair-loop-example",
                stepName: "validate",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repair failed",
                repairAttempts: 3,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const runtime = {
      async getRunRecord() {
        return {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "failed",
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
        return [];
      },
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await inspectPersistedRun(runtime, "run-1", { json: true, cost: false, steps: false });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.linkedDlqEntry).toEqual(
      expect.objectContaining({
        id: "dlq-1",
        status: "pending",
        repairAttempts: 3,
        stepName: "validate",
      })
    );
  });

  it("prints linked DLQ entry in text inspect output", async () => {
    vi.mocked(loadConfig).mockResolvedValue({
      dlq: { filePath: "./data/.obora/dlq/dead-letters.json" },
    } as never);
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [
              {
                id: "dlq-1",
                createdAt: "2026-03-10T10:00:00.000Z",
                executionId: "run-1",
                workflowName: "validation-repair-loop-example",
                stepName: "validate",
                errorCode: "SDK_STEP_FAILED",
                errorMessage: "repair failed",
                repairAttempts: 3,
                status: "pending",
              },
            ],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );

    const runtime = {
      async getRunRecord() {
        return {
          id: "run-1",
          workflowName: "validation-repair-loop-example",
          status: "failed",
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
        return [];
      },
    };

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await inspectPersistedRun(runtime, "run-1", { json: false, cost: false, steps: false });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Linked DLQ Entry:");
    expect(output).toContain("ID:               dlq-1");
    expect(output).toContain("Repair Attempts:  3");
    expect(output).toContain("obora dlq inspect dlq-1");
  });
});

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

describe("inspect alias command", () => {
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
    vi.mocked(FileDLQStore).mockImplementation(
      () =>
        ({
          load: vi.fn().mockResolvedValue({
            entries: [],
            lastUpdated: "2026-03-10T10:05:00.000Z",
          }),
        }) as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json on inspect alias", async () => {
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

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["inspect", "run-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.run).toEqual(expect.objectContaining({ id: "run-1" }));
  });

  it("inherits root --json on inspect alias", async () => {
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

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "inspect", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload.run).toEqual(expect.objectContaining({ id: "run-1" }));
  });

  it("passes --no-steps through inspect alias", async () => {
    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue({
        id: "run-1",
        workflowName: "validation-repair-loop-example",
        status: "failed",
        startedAt: "2026-03-08T10:00:00.000Z",
      }),
      getRunSteps: vi.fn().mockResolvedValue([
        {
          stepName: "validate",
          status: "failed",
        },
      ]),
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

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["inspect", "run-1", "--no-steps"], { from: "user" });

    const output = log.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).not.toContain("Steps (");
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

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["inspect", "missing-run"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });
});

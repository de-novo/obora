import { loadConfig, OboraRuntime } from "@obora/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oboraRuntimeState: {
  instance?: {
    getRunAuditTimeline?: (runId: string, stepName?: string) => Promise<unknown[]>;
  };
} = {};

vi.mock("@obora/sdk", () => ({
  loadConfig: vi.fn(),
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
import { createAuditCommand } from "../audit.js";

describe("audit command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({
      persistence: { enabled: true, adapter: "sqlite", sqlite: { path: "./data/obora.db" } },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("supports local --json for audit query", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAuditCommand();

    await cmd.parseAsync(["query", "--execution", "run-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "audit query",
        connected: false,
      })
    );
  });

  it("supports local --json for audit replay", async () => {
    oboraRuntimeState.instance = {
      getRunAuditTimeline: vi.fn().mockResolvedValue([
        {
          timestamp: "2026-03-10T10:00:00.000Z",
          category: "policy",
          stepName: "validate",
          actor: "validator",
          action: "workflow.validation_failed",
        },
      ]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAuditCommand();

    await cmd.parseAsync(["replay", "run-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        runId: "run-1",
        count: 1,
      })
    );
  });

  it("supports local --json for audit tail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createAuditCommand();

    await cmd.parseAsync(["tail", "--execution", "run-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "audit tail",
        connected: false,
        options: expect.objectContaining({ execution: "run-1", json: true }),
      })
    );
  });

  it("inherits root --json for audit query", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "audit", "query", "--execution", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "audit query",
        connected: false,
        options: expect.objectContaining({ execution: "run-1", limit: 20 }),
      })
    );
  });

  it("inherits root --json for audit tail", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "audit", "tail", "--execution", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        command: "audit tail",
        connected: false,
        options: expect.objectContaining({ execution: "run-1" }),
      })
    );
  });

  it("inherits root --json for audit replay", async () => {
    oboraRuntimeState.instance = {
      getRunAuditTimeline: vi.fn().mockResolvedValue([]),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "audit", "replay", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(expect.objectContaining({ runId: "run-1", count: 0 }));
  });

  it("uses validation exit code for invalid audit query limits", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuditCommand();

    await cmd.parseAsync(["query", "--limit", "abc"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for audit replay runtime errors", async () => {
    oboraRuntimeState.instance = {
      getRunAuditTimeline: vi.fn().mockRejectedValue(new Error("sqlite offline")),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createAuditCommand();

    await cmd.parseAsync(["replay", "run-1"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });
});

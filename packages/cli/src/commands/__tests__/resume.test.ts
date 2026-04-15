import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalCwd = process.cwd();
const oboraRuntimeState: {
  instance?: {
    getRunRecord?: (runId: string) => Promise<unknown>;
    loadWorkflow?: (path: string) => Promise<unknown>;
    resume?: (runId: string, opts: unknown) => Promise<unknown>;
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

import { loadConfig, OboraRuntime } from "@obora/sdk";

import { createCLI } from "../../cli.js";
import { ExitCode } from "../../utils/exit-codes.js";
import { createResumeCommand } from "../resume.js";

function makeResumeResult(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    execution: {
      id: "run-1",
      status: "running",
    },
    restoredSteps: ["validate"],
    rerunSteps: ["repair"],
    driftDetected: false,
    ...overrides,
  };
}

describe("resume command", () => {
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
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("prints JSON output for local --json and loads discovered workflow file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-resume-"));
    await writeFile(
      join(dir, "my-workflow.yaml"),
      "name: my-workflow\nversion: '1.0'\nsteps: []\n"
    );
    process.chdir(dir);

    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue({ id: "run-1", workflowName: "my-workflow" }),
      loadWorkflow: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(makeResumeResult()),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createResumeCommand();

    await cmd.parseAsync(["run-1", "--json"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({ execution: expect.objectContaining({ id: "run-1" }) })
    );
    expect(oboraRuntimeState.instance.loadWorkflow).toHaveBeenCalledWith(
      expect.stringContaining("my-workflow.yaml")
    );
  });

  it("inherits root --json for resume output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-resume-root-json-"));
    await writeFile(
      join(dir, "my-workflow.yaml"),
      "name: my-workflow\nversion: '1.0'\nsteps: []\n"
    );
    process.chdir(dir);

    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue({ id: "run-1", workflowName: "my-workflow" }),
      loadWorkflow: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(makeResumeResult({ driftDetected: true })),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(["--json", "resume", "run-1"], { from: "user" });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(expect.objectContaining({ driftDetected: true }));
  });

  it("uses validation exit code instead of process.exit for missing runs", async () => {
    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue(null),
      loadWorkflow: vi.fn(),
      resume: vi.fn(),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createResumeCommand();

    await cmd.parseAsync(["missing-run"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for resume failures", async () => {
    oboraRuntimeState.instance = {
      getRunRecord: vi.fn().mockResolvedValue({ id: "run-1", workflowName: "missing-workflow" }),
      loadWorkflow: vi.fn(),
      resume: vi.fn().mockRejectedValue(new Error("checkpoint corrupted")),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createResumeCommand();

    await cmd.parseAsync(["run-1"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});

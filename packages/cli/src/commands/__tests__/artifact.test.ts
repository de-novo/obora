import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const oboraRuntimeState: {
  instance?: {
    getArtifact?: (runId: string, stepName: string, name: string) => Promise<unknown>;
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
import { createArtifactCommand } from "../artifact.js";

function makeArtifact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    runId: "run-1",
    stepName: "validate",
    name: "VALIDATION-ATTEMPT-01.log",
    mimeType: "text/plain",
    sizeBytes: 17,
    createdAt: "2026-03-10T10:00:00.000Z",
    download: vi.fn().mockResolvedValue({ data: Buffer.from("artifact-payload\n") }),
    ...overrides,
  };
}

describe("artifact command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, "exit").mockImplementation(((code?: number) => {
      throw new Error(`process.exit:${code ?? "undefined"}`);
    }) as never);
    process.exitCode = undefined;
    vi.mocked(loadConfig).mockResolvedValue({
      persistence: { enabled: true, adapter: "sqlite", sqlite: { path: "./data/obora.db" } },
      artifacts: { enabled: true, store: "local", local: { basePath: "./data/artifacts" } },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("writes the artifact to an output path in text mode", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-artifact-"));
    const outputPath = join(dir, "artifact.log");
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(
      ["get", "run-1", "validate", "VALIDATION-ATTEMPT-01.log", "-o", outputPath],
      {
        from: "user",
      }
    );

    expect(await readFile(outputPath, "utf-8")).toBe("artifact-payload\n");
    expect(log).toHaveBeenCalledWith(outputPath);
  });

  it("streams artifact bytes to stdout when no output path is provided", async () => {
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-1", "validate", "VALIDATION-ATTEMPT-01.log"], {
      from: "user",
    });

    expect(stdoutWrite).toHaveBeenCalledWith(Buffer.from("artifact-payload\n"));
  });

  it("returns JSON metadata when local --json and output path are used", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-artifact-json-"));
    const outputPath = join(dir, "artifact.log");
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(
      ["get", "run-1", "validate", "VALIDATION-ATTEMPT-01.log", "-o", outputPath, "--json"],
      {
        from: "user",
      }
    );

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({
        runId: "run-1",
        stepName: "validate",
        name: "VALIDATION-ATTEMPT-01.log",
        mimeType: "text/plain",
        sizeBytes: 17,
        outputPath,
      })
    );
  });

  it("inherits root --json for artifact get output", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-artifact-root-json-"));
    const outputPath = join(dir, "artifact.log");
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(
      [
        "--json",
        "artifact",
        "get",
        "run-1",
        "validate",
        "VALIDATION-ATTEMPT-01.log",
        "-o",
        outputPath,
      ],
      {
        from: "user",
      }
    );

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual(
      expect.objectContaining({ outputPath, name: "VALIDATION-ATTEMPT-01.log" })
    );
  });

  it("uses validation exit code when JSON output is requested without an output path", async () => {
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cli = createCLI();

    await cli.parseAsync(
      ["--json", "artifact", "get", "run-1", "validate", "VALIDATION-ATTEMPT-01.log"],
      {
        from: "user",
      }
    );

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses validation exit code for missing artifacts", async () => {
    oboraRuntimeState.instance = {
      getArtifact: vi
        .fn()
        .mockRejectedValue(new Error("Artifact not found: run-1/validate/missing.log")),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-1", "validate", "missing.log"], { from: "user" });

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(error).toHaveBeenCalled();
    expect(log.mock.calls.map((args) => args.join(" ")).join("\n")).not.toContain(
      "obora run <workflow.yaml> --dry-run"
    );
  });

  it("uses execution-failed exit code for artifact download errors", async () => {
    const artifact = makeArtifact({
      download: vi.fn().mockRejectedValue(new Error("disk offline")),
    });
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(
      ["get", "run-1", "validate", "VALIDATION-ATTEMPT-01.log", "-o", "artifact.log"],
      {
        from: "user",
      }
    );

    expect(process.exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalled();
  });
});

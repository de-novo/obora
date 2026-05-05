import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, OboraRuntime } from "@obora/sdk";
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

  it("falls back to request identifiers when artifact metadata is partial", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-artifact-partial-json-"));
    const outputPath = join(dir, "artifact.log");
    const artifact = makeArtifact({
      runId: undefined,
      stepName: undefined,
      name: undefined,
      mimeType: undefined,
      sizeBytes: undefined,
      createdAt: undefined,
    });
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-9", "build", "stdout.txt", "-o", outputPath, "--json"], {
      from: "user",
    });

    const payload = JSON.parse(log.mock.calls.at(-1)?.[0] ?? "{}");
    expect(payload).toEqual({
      runId: "run-9",
      stepName: "build",
      name: "stdout.txt",
      outputPath,
    });
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

  it("passes persistence and artifact config into the SDK runtime", async () => {
    const customPersistence = { write: vi.fn() };
    const customArtifactStore = { get: vi.fn() };
    vi.mocked(loadConfig).mockResolvedValue({
      persistence: {
        enabled: false,
        adapter: "custom",
        custom: customPersistence,
      },
      artifacts: {
        enabled: false,
        store: "custom",
        custom: { instance: customArtifactStore },
      },
    } as never);
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    const stdoutWrite = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-1", "validate", "artifact.log"], { from: "user" });

    expect(stdoutWrite).toHaveBeenCalled();
    expect(OboraRuntime).toHaveBeenCalledWith({
      persistence: {
        enabled: false,
        adapter: "custom",
        sqlite: { path: "./data/obora.db" },
        custom: customPersistence,
      },
      artifacts: {
        enabled: false,
        store: "custom",
        local: { basePath: "./data/artifacts" },
        custom: { instance: customArtifactStore },
      },
    });
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

  it("uses execution-failed exit code for runtime initialization and artifact lookup errors", async () => {
    vi.mocked(loadConfig).mockRejectedValueOnce(new Error("config broken"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-1", "validate", "artifact.log"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("config broken"));

    process.exitCode = undefined;
    error.mockClear();
    vi.mocked(loadConfig).mockResolvedValue({
      persistence: { enabled: true, adapter: "sqlite" },
      artifacts: { enabled: true, store: "local" },
    } as never);
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockRejectedValue(new Error("sqlite locked")),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);

    await cmd.parseAsync(["get", "run-1", "validate", "artifact.log"], { from: "user" });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("sqlite locked"));
  });

  it("uses execution-failed exit code when writing artifact output fails", async () => {
    const artifact = makeArtifact();
    oboraRuntimeState.instance = {
      getArtifact: vi.fn().mockResolvedValue(artifact),
    };
    vi.mocked(OboraRuntime).mockImplementation(() => oboraRuntimeState.instance as never);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const dir = await mkdtemp(join(tmpdir(), "obora-artifact-write-dir-"));
    const cmd = createArtifactCommand();

    await cmd.parseAsync(["get", "run-1", "validate", "artifact.log", "-o", dir], {
      from: "user",
    });

    expect(process.exitCode).toBe(ExitCode.EXECUTION_FAILED);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("Failed to write artifact output"));
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

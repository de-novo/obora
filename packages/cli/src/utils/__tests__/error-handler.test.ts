import { OboraError, OboraErrorCode } from "@obora/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIError } from "../cli-error.js";
import { handleCommandAction, inferNextCommand, parseCommandContext } from "../error-handler.js";
import { ExitCode } from "../exit-codes.js";
import { formatter } from "../formatter.js";

describe("error handler and formatter", () => {
  const originalArgv = [...process.argv];

  afterEach(() => {
    process.exitCode = undefined;
    process.argv = [...originalArgv];
    vi.restoreAllMocks();
  });

  it("sets exitCode 0 for successful action", async () => {
    await handleCommandAction(async () => Promise.resolve());

    expect(process.exitCode).toBe(ExitCode.SUCCESS);
  });

  it("uses CLIError exit code", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError("bad input", ExitCode.VALIDATION_ERROR);
    });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
    expect(errorSpy).toHaveBeenCalledWith("❌ bad input");
  });

  it("prints dry-run hint for validation errors", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "Invalid JSON input. Please provide a valid JSON string to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith("ℹ Run: obora run <workflow.yaml> --dry-run");
  });

  it("prints dry-run hint for invalid JSON input files", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "Invalid JSON input file: artifacts/input.json",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith("ℹ Run: obora run <workflow.yaml> --dry-run");
  });

  it("prints stdin pipe hint for empty stdin validation errors on run command", async () => {
    process.argv = ["node", "obora", "run", "workflow.yaml", "--input", "@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      `ℹ Run: printf '{"key":"value"}' | obora run workflow.yaml --input @- --dry-run`
    );
  });

  it("prints stdin pipe hint for empty stdin validation errors on run command with -i", async () => {
    process.argv = ["node", "obora", "run", "workflow.yaml", "-i", "@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      `ℹ Run: printf '{"key":"value"}' | obora run workflow.yaml --input @- --dry-run`
    );
  });

  it("prints judge stdin pipe hint for empty stdin validation errors when judge command is active", async () => {
    process.argv = ["node", "obora", "judge", "--input", "@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      "ℹ Run: cat artifacts/submission.json | obora judge --input @- --dry-run"
    );
  });

  it("preserves explicit judge workflow path in stdin pipe hint", async () => {
    process.argv = ["node", "obora", "judge", "workflows/judge.yaml", "--input", "@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      "ℹ Run: cat artifacts/submission.json | obora judge workflows/judge.yaml --input @- --dry-run"
    );
  });

  it("preserves explicit judge workflow path in stdin pipe hint with -i", async () => {
    process.argv = ["node", "obora", "judge", "workflows/judge.yaml", "-i", "@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      "ℹ Run: cat artifacts/submission.json | obora judge workflows/judge.yaml --input @- --dry-run"
    );
  });

  it("prints judge stdin pipe hint when --input=@- is used", async () => {
    process.argv = ["node", "obora", "judge", "workflows/judge.yaml", "--input=@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      "ℹ Run: cat artifacts/submission.json | obora judge workflows/judge.yaml --input @- --dry-run"
    );
  });

  it("prints judge stdin pipe hint when -i=@- is used", async () => {
    process.argv = ["node", "obora", "judge", "workflows/judge.yaml", "-i=@-"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      "ℹ Run: cat artifacts/submission.json | obora judge workflows/judge.yaml --input @- --dry-run"
    );
  });

  it("prints run stdin pipe hint when value options use equals syntax", async () => {
    process.argv = [
      "node",
      "obora",
      "run",
      "--config=.obora/config.yaml",
      "packages/cli/templates/quickstart/judge.yaml",
      "--input=@-",
    ];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError(
        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
        ExitCode.VALIDATION_ERROR
      );
    });

    expect(logSpy).toHaveBeenCalledWith(
      `ℹ Run: printf '{"key":"value"}' | obora run packages/cli/templates/quickstart/judge.yaml --input @- --dry-run`
    );
  });

  it("prints judge dry-run hint for validation errors when judge command is active", async () => {
    process.argv = ["node", "obora", "judge", "--input", "@bad.json"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError("Invalid JSON input file: bad.json", ExitCode.VALIDATION_ERROR);
    });

    expect(logSpy).toHaveBeenCalledWith("ℹ Run: obora judge --dry-run");
  });

  it("keeps run dry-run hint when workflow name happens to be judge", async () => {
    process.argv = ["node", "obora", "run", "judge", "--input", "@bad.json"];
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new CLIError("Invalid JSON input file: bad.json", ExitCode.VALIDATION_ERROR);
    });

    expect(logSpy).toHaveBeenCalledWith("ℹ Run: obora run <workflow.yaml> --dry-run");
  });

  it("maps OboraError to exit code", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new OboraError("gate timed out", OboraErrorCode.POLICY_GATE_TIMEOUT);
    });

    expect(process.exitCode).toBe(ExitCode.GATE_TIMEOUT);
    expect(errorSpy).toHaveBeenCalledWith(
      `❌ [${OboraErrorCode.POLICY_GATE_TIMEOUT}] gate timed out`
    );
  });

  it("prints doctor hint for adapter/auth errors", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new OboraError("provider auth failed", OboraErrorCode.ADAPTER_AUTH_FAILED);
    });

    expect(logSpy).toHaveBeenCalledWith("ℹ Run: obora doctor");
  });

  it("sets CLI_ERROR for unknown error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw "boom";
    });

    expect(process.exitCode).toBe(ExitCode.CLI_ERROR);
    expect(errorSpy).toHaveBeenCalledWith("❌ Unexpected error: boom");
  });

  it("parses run argv context when value options appear before the workflow path", () => {
    expect(
      parseCommandContext([
        "run",
        "--config",
        ".obora/config.yaml",
        "packages/cli/templates/quickstart/judge.yaml",
        "-i",
        "@-",
      ])
    ).toEqual({
      activeCommand: "run",
      inputValue: "@-",
      commandArgument: "packages/cli/templates/quickstart/judge.yaml",
    });
  });

  it("parses judge argv context with explicit workflow path and short input option", () => {
    expect(parseCommandContext(["judge", "workflows/judge.yaml", "-i", "@-"])).toEqual({
      activeCommand: "judge",
      inputValue: "@-",
      commandArgument: "workflows/judge.yaml",
    });
  });

  it("parses equals-style option values in command context", () => {
    expect(
      parseCommandContext([
        "run",
        "--config=.obora/config.yaml",
        "packages/cli/templates/quickstart/judge.yaml",
        "--input=@-",
      ])
    ).toEqual({
      activeCommand: "run",
      inputValue: "@-",
      commandArgument: "packages/cli/templates/quickstart/judge.yaml",
    });
  });

  it("parses short equals-style input values in command context", () => {
    expect(parseCommandContext(["judge", "workflows/judge.yaml", "-i=@-"])).toEqual({
      activeCommand: "judge",
      inputValue: "@-",
      commandArgument: "workflows/judge.yaml",
    });
  });

  it("infers quickstart hint for missing workflow paths", () => {
    expect(inferNextCommand(new Error("ENOENT: no such file or directory"))).toBe(
      "obora init --quickstart"
    );
  });

  it("suppresses generic run hints for runs triage errors", () => {
    process.argv = ["node", "obora", "runs", "inspect", "missing-run"];

    expect(
      inferNextCommand(new CLIError("Run not found: missing-run", ExitCode.VALIDATION_ERROR))
    ).toBe(null);
    expect(
      inferNextCommand(
        new CLIError("Failed to load persisted runs: sqlite offline", ExitCode.EXECUTION_FAILED)
      )
    ).toBe(null);
  });

  it("suppresses generic run hints for artifact retrieval errors", () => {
    process.argv = ["node", "obora", "artifact", "get", "run-1", "validate", "missing.log"];

    expect(
      inferNextCommand(
        new CLIError("Artifact not found: run-1/validate/missing.log", ExitCode.VALIDATION_ERROR)
      )
    ).toBe(null);
    expect(
      inferNextCommand(
        new CLIError("Artifact download failed: disk offline", ExitCode.EXECUTION_FAILED)
      )
    ).toBe(null);
  });

  it("suppresses generic hints for knowledge command errors", () => {
    process.argv = ["node", "obora", "knowledge", "schema", "show"];

    expect(
      inferNextCommand(new CLIError("Invalid knowledge limit: abc", ExitCode.VALIDATION_ERROR))
    ).toBe(null);
    expect(
      inferNextCommand(
        new CLIError(
          "Failed to read knowledge schema: ENOENT: no such file or directory, open '.obora/knowledge-schema.yaml'",
          ExitCode.EXECUTION_FAILED
        )
      )
    ).toBe(null);
  });

  it("suppresses generic hints for audit command errors", () => {
    process.argv = ["node", "obora", "audit", "query", "--limit", "abc"];

    expect(
      inferNextCommand(new CLIError("Invalid audit limit: abc", ExitCode.VALIDATION_ERROR))
    ).toBe(null);
    expect(
      inferNextCommand(
        new CLIError("Failed to replay audit timeline: sqlite offline", ExitCode.EXECUTION_FAILED)
      )
    ).toBe(null);
  });

  it("suppresses generic hints for models command errors", () => {
    process.argv = ["node", "obora", "models", "unknown-provider", "mini"];

    expect(
      inferNextCommand(
        new CLIError(
          "Unsupported models provider 'unknown-provider'. Supported providers: openai, anthropic",
          ExitCode.VALIDATION_ERROR
        )
      )
    ).toBe(null);
  });

  it("suppresses generic hints for policy command errors", () => {
    process.argv = ["node", "obora", "policy", "validate", "policy.txt"];

    expect(
      inferNextCommand(
        new CLIError("Unsupported policy file format: policy.txt", ExitCode.VALIDATION_ERROR)
      )
    ).toBe(null);
    expect(
      inferNextCommand(
        new CLIError(
          "Invalid policy/workflow YAML: policies/default.yaml",
          ExitCode.VALIDATION_ERROR
        )
      )
    ).toBe(null);
  });

  it("formatter.error writes to stderr", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    formatter.error("something failed");

    expect(errorSpy).toHaveBeenCalledWith("❌ something failed");
  });

  it("formatter.success writes to stdout", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    formatter.success("done");

    expect(logSpy).toHaveBeenCalledWith("✅ done");
  });
});

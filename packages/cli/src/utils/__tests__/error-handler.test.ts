import { OboraError, OboraErrorCode } from "@obora/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLIError } from "../cli-error.js";
import { handleCommandAction, inferNextCommand } from "../error-handler.js";
import { ExitCode } from "../exit-codes.js";
import { formatter } from "../formatter.js";

describe("error handler and formatter", () => {
  afterEach(() => {
    process.exitCode = undefined;
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
      throw new CLIError("Invalid JSON input. Please provide a valid JSON string to --input.", ExitCode.VALIDATION_ERROR);
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

  it("infers quickstart hint for missing workflow paths", () => {
    expect(inferNextCommand(new Error("ENOENT: no such file or directory"))).toBe(
      "obora init --quickstart"
    );
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

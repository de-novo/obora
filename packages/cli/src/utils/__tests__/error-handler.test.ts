import { afterEach, describe, expect, it, vi } from "vitest";

import { OboraError, OboraErrorCode } from "@obora/sdk";

import { CLIError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { handleCommandAction } from "../error-handler.js";
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

  it("maps OboraError to exit code", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw new OboraError("gate timed out", OboraErrorCode.POLICY_GATE_TIMEOUT);
    });

    expect(process.exitCode).toBe(ExitCode.GATE_TIMEOUT);
    expect(errorSpy).toHaveBeenCalledWith(`❌ [${OboraErrorCode.POLICY_GATE_TIMEOUT}] gate timed out`);
  });

  it("sets CLI_ERROR for unknown error", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await handleCommandAction(async () => {
      throw "boom";
    });

    expect(process.exitCode).toBe(ExitCode.CLI_ERROR);
    expect(errorSpy).toHaveBeenCalledWith("❌ Unexpected error: boom");
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

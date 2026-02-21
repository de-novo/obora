import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { createCLI } from "../../cli.js";
import { CLIError } from "../../utils/cli-error.js";
import { handleCommandAction } from "../../utils/error-handler.js";
import { ExitCode } from "../../utils/exit-codes.js";
import { formatter } from "../../utils/formatter.js";

describe("M3-08 UX standardization", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.exitCode = undefined;
    delete process.env.NO_COLOR;
    formatter.setColorEnabled(true);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("propagates --verbose global option to commands", async () => {
    const cli = createCLI();
    await cli.parseAsync(["--verbose", "run", "example", "--dry-run"], { from: "user" });

    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain("Validation completed in");
  });

  it("maps CLIError exit code consistently", async () => {
    await handleCommandAction(async () => {
      throw new CLIError("invalid input", ExitCode.VALIDATION_ERROR);
    });

    expect(process.exitCode).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("disables ANSI colors with --no-color", async () => {
    const cli = createCLI();
    await cli.parseAsync(["--no-color", "run", "example", "--dry-run"], { from: "user" });

    const output = logSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(output).toContain('✅ Workflow "example" validated successfully.');
    expect(output).not.toContain("\u001b[");
  });
});

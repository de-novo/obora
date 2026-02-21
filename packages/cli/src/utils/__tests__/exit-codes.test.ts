import { OboraErrorCode } from "@obora/sdk";
import { describe, expect, it } from "vitest";

import { CLIError } from "../cli-error.js";
import { ExitCode, mapErrorToExitCode } from "../exit-codes.js";

describe("exit code mapping", () => {
  it("maps validation policy code to 2", () => {
    expect(mapErrorToExitCode("POLICY_2001")).toBe(ExitCode.VALIDATION_ERROR);
  });

  it("maps execution cell code to 3", () => {
    expect(mapErrorToExitCode("CELL_1001")).toBe(ExitCode.EXECUTION_FAILED);
  });

  it("maps policy gate timeout to 4", () => {
    expect(mapErrorToExitCode(OboraErrorCode.POLICY_GATE_TIMEOUT)).toBe(ExitCode.GATE_TIMEOUT);
  });

  it("maps unknown code to 10", () => {
    expect(mapErrorToExitCode("unknown")).toBe(ExitCode.CLI_ERROR);
  });

  it("creates CLIError from Obora error with mapped exit code", () => {
    const err = CLIError.fromOboraError({ code: "ORCH_5001", message: "failure" });
    expect(err.exitCode).toBe(ExitCode.EXECUTION_FAILED);
  });
});

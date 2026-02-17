import { ExitCode, mapErrorToExitCode } from "./exit-codes.js";

export class CLIError extends Error {
  public readonly exitCode: number;

  constructor(message: string, exitCode: number = ExitCode.CLI_ERROR) {
    super(message);
    this.name = "CLIError";
    this.exitCode = exitCode;
  }

  static fromOboraError(err: { code: string; message: string }): CLIError {
    return new CLIError(err.message, mapErrorToExitCode(err.code));
  }
}

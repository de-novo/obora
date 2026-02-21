import { OboraError } from "@obora/sdk";

import { CLIError } from "./cli-error.js";
import { ExitCode } from "./exit-codes.js";
import { formatter } from "./formatter.js";

function isVerboseEnabled(verbose?: boolean): boolean {
  if (typeof verbose === "boolean") {
    return verbose;
  }

  return process.argv.includes("--verbose");
}

export async function handleCommandAction(
  action: () => Promise<void>,
  options?: { verbose?: boolean }
): Promise<void> {
  try {
    await action();
    process.exitCode = ExitCode.SUCCESS;
  } catch (err: unknown) {
    const verbose = isVerboseEnabled(options?.verbose);

    if (err instanceof CLIError) {
      formatter.error(err.message);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      process.exitCode = err.exitCode;
    } else if (err instanceof OboraError) {
      const cliErr = CLIError.fromOboraError(err);
      formatter.error(`[${err.code}] ${err.message}`);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      process.exitCode = cliErr.exitCode;
    } else if (err instanceof Error) {
      formatter.error(err.message);
      if (verbose && err.stack) {
        formatter.error(err.stack);
      }
      process.exitCode = ExitCode.CLI_ERROR;
    } else {
      formatter.error(`Unexpected error: ${String(err)}`);
      process.exitCode = ExitCode.CLI_ERROR;
    }
  }
}

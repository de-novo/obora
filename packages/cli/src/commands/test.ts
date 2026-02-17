import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export function createTestCommand(): Command {
  return new Command("test")
    .description("Run workflow tests")
    .argument("[target]", "Workflow or test suite path")
    .option("--fixture <path>", "YAML fixture file")
    .option("--filter <pattern>", "Filter test cases by name")
    .action(async (target, options) => {
      try {
        console.log(`[stub] obora test ${target ?? "all"}`, options);
        process.exitCode = ExitCode.SUCCESS;
      } catch (err: unknown) {
        if (err instanceof CLIError) {
          console.error(err.message);
          process.exitCode = err.exitCode;
        } else {
          console.error("Unexpected error:", err);
          process.exitCode = ExitCode.CLI_ERROR;
        }
      }
    });
}

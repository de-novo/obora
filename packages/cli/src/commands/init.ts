import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export async function runInit(options: Record<string, unknown>): Promise<void> {
  console.log("[stub] obora init", options);
}

export function createInitCommand(): Command {
  return new Command("init")
    .description("Initialize a new Obora project")
    .option("--template <name>", "Project template", "default")
    .option("-y, --yes", "Skip prompts, use defaults")
    .action(async (options) => {
      try {
        await runInit(options);
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

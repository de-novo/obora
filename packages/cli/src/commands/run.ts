import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export async function runRun(workflow: string, options: Record<string, unknown>): Promise<void> {
  console.log(`[stub] obora run ${workflow}`, options);
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Execute a workflow")
    .argument("<workflow>", "Workflow name or YAML path")
    .option("-i, --input <json>", "Input data as JSON string")
    .option("-v, --var <key=value...>", "Variables (repeatable)")
    .option("--policy <path>", "Policy file path")
    .option("--dry-run", "Validate without executing")
    .option("--timeout <ms>", "Execution timeout in milliseconds", parseInt)
    .action(async (workflow, options) => {
      try {
        // TODO: Wire to SDK OboraRuntime.run()
        await runRun(workflow, options);
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

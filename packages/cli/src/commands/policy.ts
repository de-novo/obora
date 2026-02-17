import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export function createPolicyCommand(): Command {
  const cmd = new Command("policy").description("Policy management");

  cmd
    .command("validate <path>")
    .description("Validate policy/workflow YAML")
    .action(async (path) => {
      try {
        console.log(`[stub] obora policy validate ${path}`);
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

  return cmd;
}

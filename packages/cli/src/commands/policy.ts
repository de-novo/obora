import { Command } from "commander";

import { OboraError, Policy, Workflow } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export function createPolicyCommand(): Command {
  const cmd = new Command("policy").description("Policy management");

  cmd
    .command("validate <path>")
    .description("Validate policy/workflow YAML")
    .action(async (path) => {
      try {
        if (!path.endsWith(".yaml") && !path.endsWith(".yml")) {
          throw new CLIError(`Unsupported file format: ${path}`, ExitCode.VALIDATION_ERROR);
        }

        try {
          await Policy.fromYaml(path);
          console.log(`✅ Policy "${path}" is valid.`);
        } catch {
          await Workflow.fromYaml(path);
          console.log(`✅ Workflow "${path}" is valid.`);
        }

        process.exitCode = ExitCode.SUCCESS;
      } catch (err: unknown) {
        if (err instanceof OboraError) {
          const cliError = CLIError.fromOboraError(err);
          console.error(cliError.message);
          process.exitCode = cliError.exitCode;
          return;
        }

        if (err instanceof CLIError) {
          console.error(err.message);
          process.exitCode = err.exitCode;
          return;
        }

        console.error("Unexpected error:", err);
        process.exitCode = ExitCode.CLI_ERROR;
      }
    });

  return cmd;
}

import { Command } from "commander";

import { Policy, Workflow } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";

export function createPolicyCommand(): Command {
  const cmd = new Command("policy").description("Policy management");

  cmd
    .command("validate <path>")
    .description("Validate policy/workflow YAML")
    .action(async (path, options) => {
      await handleCommandAction(async () => {
        if (!path.endsWith(".yaml") && !path.endsWith(".yml")) {
          throw new CLIError(`Unsupported file format: ${path}`, ExitCode.VALIDATION_ERROR);
        }

        let kind: "policy" | "workflow" = "policy";
        try {
          await Policy.fromYaml(path);
        } catch {
          await Workflow.fromYaml(path);
          kind = "workflow";
        }

        if (options.json) {
          formatter.json({ path, valid: true, kind });
        } else if (!options.quiet) {
          if (kind === "policy") {
            formatter.success(`Policy "${path}" is valid.`);
          } else {
            formatter.success(`Workflow "${path}" is valid.`);
          }
        }
      });
    });

  return cmd;
}

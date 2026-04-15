import { Policy, Workflow } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface PolicyValidateOptions {
  json?: boolean;
}

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

export function createPolicyCommand(): Command {
  const cmd = new Command("policy").description("Policy management");

  cmd
    .command("validate <path>")
    .description("Validate policy/workflow YAML")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, path: string, options: PolicyValidateOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          if (!path.endsWith(".yaml") && !path.endsWith(".yml")) {
            throw new CLIError(
              `Unsupported policy file format: ${path}`,
              ExitCode.VALIDATION_ERROR
            );
          }

          let kind: "policy" | "workflow" = "policy";
          try {
            await Policy.fromYaml(path);
          } catch {
            try {
              await Workflow.fromYaml(path);
              kind = "workflow";
            } catch {
              throw new CLIError(
                `Invalid policy/workflow YAML: ${path}`,
                ExitCode.VALIDATION_ERROR
              );
            }
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({ path, valid: true, kind });
          } else if (!globalOpts.quiet) {
            if (kind === "policy") {
              formatter.success(`Policy "${path}" is valid.`);
            } else {
              formatter.success(`Workflow "${path}" is valid.`);
            }
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return cmd;
}

import { Command } from "commander";

import { OboraError, OboraRuntime, Workflow } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";

export async function runRun(workflow: string, options: Record<string, unknown>): Promise<void> {
  try {
    const runtime = new OboraRuntime({
      policyPath: options.policy as string | undefined,
    });

    let workflowName = workflow;
    if (workflow.endsWith(".yaml") || workflow.endsWith(".yml")) {
      const loaded = await Workflow.fromYaml(workflow);
      runtime.define(loaded.name, loaded);
      workflowName = loaded.name;
    }

    const variables: Record<string, unknown> = {};
    if (Array.isArray(options.var)) {
      for (const v of options.var) {
        const [key, ...rest] = String(v).split("=");
        if (!key) {
          continue;
        }
        variables[key] = rest.join("=");
      }
    }

    let input: unknown;
    if (options.input) {
      try {
        input = JSON.parse(options.input as string);
      } catch {
        throw new CLIError("Invalid JSON input", ExitCode.VALIDATION_ERROR);
      }
    }

    if (options.dryRun) {
      console.log(`Workflow "${workflowName}" validated successfully.`);
      return;
    }

    const controller = new AbortController();
    if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
      setTimeout(() => controller.abort(), options.timeout);
    }

    runtime.on("step_start", (event) => {
      const data = event.data as { stepName?: string } | undefined;
      if (data?.stepName) {
        console.log(`  → Step: ${data.stepName}`);
      }
    });

    const handle = await runtime.run(workflowName, {
      input,
      variables,
      signal: controller.signal,
    });

    const result = await handle.wait();
    console.log(`✅ Workflow "${result.workflowName}" completed.`);
  } catch (err: unknown) {
    if (err instanceof OboraError) {
      throw CLIError.fromOboraError(err);
    }
    throw err;
  }
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

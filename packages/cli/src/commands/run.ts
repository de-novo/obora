import { Command } from "commander";

import { OboraRuntime, Workflow } from "@obora/sdk";

import { CLIError } from "../utils/cli-error.js";
import { ExitCode } from "../utils/exit-codes.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

function isJsonOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.json);
}

function isQuietOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.quiet);
}

export async function runRun(workflow: string, options: Record<string, unknown>): Promise<void> {
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
    if (isJsonOutput(options)) {
      formatter.json({ workflow: workflowName, validated: true });
    } else if (!isQuietOutput(options)) {
      formatter.success(`Workflow "${workflowName}" validated successfully.`);
    }
    return;
  }

  const controller = new AbortController();
  if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
    setTimeout(() => controller.abort(), options.timeout);
  }

  runtime.on("step_start", (event) => {
    const data = event.data as { stepName?: string } | undefined;
    if (data?.stepName && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(data.stepName);
    }
  });

  const handle = await runtime.run(workflowName, {
    input,
    variables,
    signal: controller.signal,
  });

  const result = await handle.wait();
  if (isJsonOutput(options)) {
    formatter.json({
      workflowName: result.workflowName,
      status: "completed",
    });
  } else if (!isQuietOutput(options)) {
    formatter.success(`Workflow "${result.workflowName}" completed.`);
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
    .action(async function (this: Command, workflow, options) {
      await handleCommandAction(async () => {
        const mergedOptions = { ...getGlobalOpts(this), ...options };
        await runRun(workflow, mergedOptions);
      });
    });
}

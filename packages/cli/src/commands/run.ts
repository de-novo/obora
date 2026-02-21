import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import {
  detectLLMConfigFromEnv,
  loadConfig,
  OboraRuntime,
  resolveLLMConfig,
  Workflow,
} from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

function isJsonOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.json);
}

function isQuietOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.quiet);
}

function isVerboseOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.verbose);
}

export async function runRun(workflow: string, options: Record<string, unknown>): Promise<void> {
  const startedAt = Date.now();
  const loadedConfig = await loadConfig(options.config as string | undefined);
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);

  const runtime = new OboraRuntime({
    policyPath: options.policy as string | undefined,
    agentsPath: options.agents as string | undefined,
    configPath: options.config as string | undefined,
    config: loadedConfig,
    llm: resolvedLLM
      ? {
          ...resolvedLLM,
          provider: (options.provider as string | undefined) ?? resolvedLLM.provider,
          model: (options.model as string | undefined) ?? resolvedLLM.model,
        }
      : undefined,
    verbose: Boolean(options.verbose),
  });

  if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
    formatter.info(`Starting workflow execution: ${workflow}`);
  }

  let workflowName = workflow;
  if (workflow.endsWith(".yaml") || workflow.endsWith(".yml")) {
    const loaded = await Workflow.fromYaml(workflow);
    runtime.define(loaded.name, loaded);
    workflowName = loaded.name;

    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(`Loaded workflow YAML: ${workflow} -> ${workflowName}`);
    }
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
      throw new CLIError(
        "Invalid JSON input. Please provide a valid JSON string to --input.",
        ExitCode.VALIDATION_ERROR
      );
    }
  }

  if (options.dryRun) {
    if (isJsonOutput(options)) {
      formatter.json({
        workflow: workflowName,
        validated: true,
        elapsedMs: Date.now() - startedAt,
      });
    } else if (!isQuietOutput(options)) {
      formatter.success(`Workflow "${workflowName}" validated successfully.`);
      if (isVerboseOutput(options)) {
        formatter.info(`Validation completed in ${Date.now() - startedAt}ms`);
      }
    }
    return;
  }

  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
    timeoutHandle = setTimeout(() => {
      controller.abort();
    }, options.timeout);
    timeoutHandle.unref?.();
    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(`Timeout configured: ${options.timeout}ms`);
    }
  }

  runtime.on("step_start", (event) => {
    const data = event.data as { stepName?: string } | undefined;
    if (data?.stepName && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(data.stepName);
    }
  });

  if (isVerboseOutput(options) && !isJsonOutput(options)) {
    runtime.on("step_end", (event) => {
      const data = event.data as
        | { stepName?: string; status?: string; durationMs?: number }
        | undefined;
      if (data?.stepName && !isQuietOutput(options)) {
        formatter.step(
          `step_end: ${data.stepName}${data.status ? ` (${data.status})` : ""}${
            typeof data.durationMs === "number" ? ` - ${data.durationMs}ms` : ""
          }`
        );
      }
    });
  }

  const handle = await runtime.run(workflowName, {
    input,
    variables,
    signal: controller.signal,
  });

  const result = await (async () => {
    try {
      return await handle.wait();
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = undefined;
      }
    }
  })();
  const elapsedMs = Date.now() - startedAt;

  if (options.outputDir && typeof options.outputDir === "string") {
    await mkdir(options.outputDir, { recursive: true });
    const filePath = join(
      options.outputDir,
      `${basename(workflowName)}-${handle.executionId}.json`
    );
    await writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");
    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(`Saved outputs to ${filePath}`);
    }
  }

  if (isJsonOutput(options)) {
    formatter.json({
      workflowName: result.workflowName,
      status: "completed",
      elapsedMs,
    });
  } else if (!isQuietOutput(options)) {
    formatter.success(`Workflow "${result.workflowName}" completed.`);
    if (isVerboseOutput(options)) {
      formatter.info(`Total execution time: ${elapsedMs}ms`);
    }
  }
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Execute a workflow")
    .argument("<workflow>", "Workflow name or YAML path")
    .option("-i, --input <json>", "Input data as JSON string")
    .option("-v, --var <key=value...>", "Variables (repeatable)")
    .option("--policy <path>", "Policy file path")
    .option("--agents <path>", "agents.yaml path")
    .option("--config <path>", "obora config.yaml path")
    .option("--model <name>", "Default LLM model")
    .option("--provider <name>", "LLM provider override")
    .option("--output-dir <path>", "Write execution result JSON into directory")
    .option("--dry-run", "Validate without executing")
    .option("--timeout <ms>", "Execution timeout in milliseconds", parseInt)
    .action(async function (this: Command, workflow, options) {
      const mergedOptions = { ...getGlobalOpts(this), ...options };
      await handleCommandAction(
        async () => {
          await runRun(workflow, mergedOptions);
        },
        { verbose: Boolean(mergedOptions.verbose) }
      );
    });
}

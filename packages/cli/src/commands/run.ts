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
  const repairLoopSummary = {
    validationFailed: 0,
    validationPassed: 0,
    repairStarted: 0,
    repairCompleted: 0,
    repairNoProgress: 0,
    lastValidationSummary: undefined as string | undefined,
    lastValidationStep: undefined as string | undefined,
    lastRepairStep: undefined as string | undefined,
    lastAttempt: undefined as number | undefined,
  };
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
  let expandedWorkflow: unknown;
  let stopSemantics: unknown;
  let derivedOutputRoot: string | undefined;
  let derivedArchiveEnabled = false;
  if (workflow.endsWith(".yaml") || workflow.endsWith(".yml")) {
    const loadedConfigRaw = await import("node:fs/promises").then((m) => m.readFile(workflow, "utf-8"));
    const parsedRaw = await import("yaml").then((m) => m.parse(loadedConfigRaw));
    const loaded = await Workflow.fromYaml(workflow);
    runtime.define(loaded.name, loaded);
    workflowName = loaded.name;
    expandedWorkflow = loaded;
    stopSemantics = Workflow.getStopSemantics(parsedRaw);
    const workflowVariables = (loaded.variables && typeof loaded.variables === "object")
      ? (loaded.variables as Record<string, unknown>)
      : {};
    derivedOutputRoot = typeof workflowVariables.output_root === "string" ? workflowVariables.output_root : undefined;
    derivedArchiveEnabled = workflowVariables.archive_enabled === true;

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
        ...(options.dumpExpandedWorkflow ? { expandedWorkflow } : {}),
        ...(options.showStopSemantics ? { stopSemantics } : {}),
        elapsedMs: Date.now() - startedAt,
      });
    } else if (!isQuietOutput(options)) {
      formatter.success(`Workflow "${workflowName}" validated successfully.`);
      if (options.dumpExpandedWorkflow && expandedWorkflow) {
        formatter.info("Expanded workflow:");
        formatter.json(expandedWorkflow);
      }
      if (options.showStopSemantics && stopSemantics) {
        formatter.info("Stop semantics:");
        formatter.json(stopSemantics);
      }
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

  runtime.on("workflow.validation_failed", (event) => {
    const data = event.data as
      | { stepName?: string; summary?: string; failedChecks?: Array<unknown> }
      | undefined;
    repairLoopSummary.validationFailed += 1;
    repairLoopSummary.lastValidationStep = data?.stepName;
    repairLoopSummary.lastValidationSummary = data?.summary;

    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      const failedChecksCount = Array.isArray(data?.failedChecks) ? data!.failedChecks.length : undefined;
      formatter.warn(
        `validation failed${data?.stepName ? ` [${data.stepName}]` : ""}: ${data?.summary ?? "unknown reason"}${
          typeof failedChecksCount === "number" ? ` (${failedChecksCount} check${failedChecksCount === 1 ? "" : "s"})` : ""
        }`
      );
    }
  });

  runtime.on("workflow.validation_passed", (event) => {
    const data = event.data as { stepName?: string; summary?: string } | undefined;
    repairLoopSummary.validationPassed += 1;
    repairLoopSummary.lastValidationStep = data?.stepName;
    repairLoopSummary.lastValidationSummary = data?.summary;

    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.success(
        `validation passed${data?.stepName ? ` [${data.stepName}]` : ""}${data?.summary ? `: ${data.summary}` : ""}`
      );
    }
  });

  runtime.on("workflow.repair_started", (event) => {
    const data = event.data as { stepName?: string; attempt?: number } | undefined;
    repairLoopSummary.repairStarted += 1;
    repairLoopSummary.lastRepairStep = data?.stepName;
    repairLoopSummary.lastAttempt = data?.attempt;

    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(
        `repair attempt ${data?.attempt ?? repairLoopSummary.repairStarted}${data?.stepName ? ` → ${data.stepName}` : ""}`
      );
    }
  });

  runtime.on("workflow.repair_completed", (event) => {
    const data = event.data as { stepName?: string; attempt?: number } | undefined;
    repairLoopSummary.repairCompleted += 1;
    repairLoopSummary.lastRepairStep = data?.stepName;
    repairLoopSummary.lastAttempt = data?.attempt;

    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(
        `repair completed${data?.stepName ? ` [${data.stepName}]` : ""}${data?.attempt ? ` (attempt ${data.attempt})` : ""}`
      );
    }
  });

  runtime.on("workflow.repair_no_progress", (event) => {
    const data = event.data as { sourceStep?: string; reason?: string; category?: string } | undefined;
    repairLoopSummary.repairNoProgress += 1;

    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      const categorySuffix = data?.category ? ` (${data.category})` : "";
      formatter.warn(
        `repair loop made no progress${data?.sourceStep ? ` [${data.sourceStep}]` : ""}${categorySuffix}: ${data?.reason ?? "unknown reason"}`
      );
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

  const effectiveOutputDir =
    typeof options.outputDir === "string" && options.outputDir.length > 0
      ? options.outputDir
      : derivedOutputRoot;

  const derivedMode =
    stopSemantics && typeof stopSemantics === "object" && typeof (stopSemantics as Record<string, unknown>).mode === "string"
      ? ((stopSemantics as Record<string, unknown>).mode as string)
      : undefined;

  if (effectiveOutputDir) {
    await mkdir(effectiveOutputDir, { recursive: true });
    const filePath = join(
      effectiveOutputDir,
      `${basename(workflowName)}-${handle.executionId}.json`
    );
    await writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");

    if (derivedArchiveEnabled) {
      const archiveIntentPath = join(
        effectiveOutputDir,
        `${basename(workflowName)}-${handle.executionId}.archive-intent.json`
      );
      await writeFile(
        archiveIntentPath,
        JSON.stringify(
          {
            workflowName: result.workflowName,
            executionId: handle.executionId,
            archiveEnabled: true,
            outputRoot: derivedOutputRoot,
            sourceResultPath: filePath,
          },
          null,
          2,
        ),
        "utf-8",
      );

      const archiveDir = join(effectiveOutputDir, `${basename(workflowName)}-${handle.executionId}.archive`);
      await mkdir(archiveDir, { recursive: true });
      const readmeBody =
        derivedMode === "validation-repair"
          ? `# Archive Scaffold\n\n- mode: validation-repair\n- workflow: ${result.workflowName}\n- executionId: ${handle.executionId}\n- source result: ${basename(filePath)}\n\n## Focus\n- validation summary\n- repair loop outcome\n- stop category\n`
          : derivedMode === "research-loop"
            ? `# Archive Scaffold\n\n- mode: research-loop\n- workflow: ${result.workflowName}\n- executionId: ${handle.executionId}\n- source result: ${basename(filePath)}\n\n## Focus\n- problem framing\n- research findings\n- bounded conclusion\n`
            : derivedMode === "proof-loop"
              ? `# Archive Scaffold\n\n- mode: proof-loop\n- workflow: ${result.workflowName}\n- executionId: ${handle.executionId}\n- source result: ${basename(filePath)}\n\n## Focus\n- statement and domain\n- proof attempt\n- proof gaps / refutation risk\n`
              : `# Archive Scaffold\n\n- workflow: ${result.workflowName}\n- executionId: ${handle.executionId}\n- source result: ${basename(filePath)}\n`;
      const summaryBody =
        derivedMode === "validation-repair"
          ? "# Summary\n\nSummarize validation failures, repair attempts, and final repair outcome.\n"
          : derivedMode === "research-loop"
            ? "# Summary\n\nSummarize the research question, main findings, and bounded conclusion.\n"
            : derivedMode === "proof-loop"
              ? "# Summary\n\nSummarize the proof status, key lemmas, and unresolved proof gaps.\n"
              : `# Summary\n\nFill in the final summary for workflow \`${result.workflowName}\`.\n`;
      const nextStepsBody =
        derivedMode === "validation-repair"
          ? "# Next Steps\n\n- Review remaining validation gaps\n- Decide whether another repair loop is needed\n- Curate final artifact\n"
          : derivedMode === "research-loop"
            ? "# Next Steps\n\n- Capture final conclusions\n- Curate research artifacts\n- Decide whether to continue or archive\n"
            : derivedMode === "proof-loop"
              ? "# Next Steps\n\n- Record unresolved proof gaps\n- Check counterexample risk\n- Decide whether to continue proof search or bounded-stop\n"
              : "# Next Steps\n\n- Capture final conclusions\n- Curate artifacts\n- Decide whether to publish or continue\n";
      await writeFile(join(archiveDir, "README.md"), readmeBody, "utf-8");
      await writeFile(join(archiveDir, "SUMMARY.md"), summaryBody, "utf-8");
      await writeFile(join(archiveDir, "NEXT_STEPS.md"), nextStepsBody, "utf-8");

      if (derivedMode === "validation-repair") {
        await writeFile(
          join(archiveDir, "REPAIR_LOG.md"),
          "# Repair Log\n\n- validation failures\n- repair attempts\n- stop category\n",
          "utf-8",
        );
      }

      if (derivedMode === "research-loop") {
        await writeFile(
          join(archiveDir, "FINDINGS.md"),
          "# Findings\n\n- problem framing\n- main findings\n- bounded conclusion\n",
          "utf-8",
        );
      }

      if (derivedMode === "proof-loop") {
        await writeFile(
          join(archiveDir, "PROOF_GAPS.md"),
          "# Proof Gaps\n\n- unresolved lemmas\n- hidden assumptions\n- refutation risk\n",
          "utf-8",
        );
      }

      if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
        formatter.info(`Saved archive intent metadata to ${archiveIntentPath}`);
        formatter.info(`Created archive scaffold at ${archiveDir}`);
      }
    }

    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(`Saved outputs to ${filePath}`);
    }
  }

  const hasRepairLoopActivity =
    repairLoopSummary.validationFailed > 0 ||
    repairLoopSummary.validationPassed > 0 ||
    repairLoopSummary.repairStarted > 0 ||
    repairLoopSummary.repairCompleted > 0 ||
    repairLoopSummary.repairNoProgress > 0;

  if (isJsonOutput(options)) {
    formatter.json({
      workflowName: result.workflowName,
      status: "completed",
      elapsedMs,
      ...(derivedOutputRoot ? { outputRoot: derivedOutputRoot } : {}),
      ...(derivedArchiveEnabled ? { archiveEnabled: true } : {}),
      ...(hasRepairLoopActivity
        ? {
            repairLoop: {
              ...repairLoopSummary,
            },
          }
        : {}),
    });
  } else if (!isQuietOutput(options)) {
    formatter.success(`Workflow "${result.workflowName}" completed.`);
    if (hasRepairLoopActivity) {
      formatter.info(
        `repair loop summary: validation failed=${repairLoopSummary.validationFailed}, validation passed=${repairLoopSummary.validationPassed}, repairs started=${repairLoopSummary.repairStarted}, repairs completed=${repairLoopSummary.repairCompleted}${repairLoopSummary.lastValidationSummary ? `, last validation="${repairLoopSummary.lastValidationSummary}"` : ""}`
      );
    }
    if (derivedArchiveEnabled && isVerboseOutput(options)) {
      formatter.info("Archive intent enabled for this workflow.");
    }
    if (isVerboseOutput(options)) {
      formatter.info(`Total execution time: ${elapsedMs}ms`);
    }
  }
}

export function createRunCommand(): Command {
  return new Command("run")
    .description("Execute a workflow (named workflow or one-file YAML mode)")
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
    .option("--dump-expanded-workflow", "Print the expanded internal workflow when loading YAML")
    .option("--show-stop-semantics", "Print derived stop semantics when available")
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

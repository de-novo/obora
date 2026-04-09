import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  buildBindingPreview,
  buildOutputPreview,
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  formatBindingPreview,
  formatOutputPreview,
  formatResolutionSummary,
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

function isDebugOutput(options: Record<string, unknown>): boolean {
  return Boolean(options.debug || options.debugFile);
}

const DEBUG_EVENT_TYPES = [
  "execution_start",
  "execution_end",
  "step_start",
  "step_end",
  "workflow.validation_failed",
  "workflow.validation_passed",
  "workflow.repair_started",
  "workflow.repair_completed",
  "workflow.repair_no_progress",
  "workflow.back_edge_triggered",
  "workflow.back_edge_exhausted",
  "warning",
  "error",
  "knowledge_context_attached",
] as const;

function clipDebug(value: unknown, max = 180): string {
  if (value === undefined || value === null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function summarizeDebugEvent(type: string, data: Record<string, unknown> | undefined): string {
  switch (type) {
    case "execution_start":
      return `execution=${String(data?.executionId ?? "unknown")}`;
    case "execution_end": {
      const debugState = (data?.debugState as Record<string, unknown> | undefined) ?? undefined;
      const bb = (debugState?.blackboard as Record<string, unknown> | undefined) ?? undefined;
      const report =
        (debugState?.observerReport as Record<string, unknown> | undefined) ?? undefined;
      return `status=${String(data?.status ?? "unknown")}${bb ? ` blackboard.failures=${String(bb.failures ?? "?")} blackboard.facts=${String(bb.facts ?? "?")}` : ""}${report ? ` observer.totalRetries=${String(report.totalRetries ?? "?")} observer.totalValidationFailures=${String(report.totalValidationFailures ?? "?")}` : ""}`;
    }
    case "step_start":
      return `step=${String(data?.stepName ?? "unknown")}`;
    case "step_end":
      return `step=${String(data?.stepName ?? "unknown")} status=${String(data?.status ?? "unknown")} durationMs=${String(data?.durationMs ?? "-")}`;
    case "workflow.validation_failed": {
      const failedChecks = Array.isArray(data?.failedChecks) ? data.failedChecks.length : "?";
      const debugState = (data?.debugState as Record<string, unknown> | undefined) ?? undefined;
      const bb = (debugState?.blackboard as Record<string, unknown> | undefined) ?? undefined;
      const observer = (debugState?.observer as Record<string, unknown> | undefined) ?? undefined;
      return `step=${String(data?.stepName ?? "unknown")} failedChecks=${String(failedChecks)} summary=${clipDebug(data?.summary)}${bb ? ` bb.failures=${String(bb.failures ?? "?")} bb.facts=${String(bb.facts ?? "?")}` : ""}${observer ? ` obs.validationFailures=${String(observer.totalValidationFailures ?? "?")} obs.backEdges=${String(observer.totalBackEdges ?? "?")}` : ""}`;
    }
    case "workflow.validation_passed":
      return `step=${String(data?.stepName ?? "unknown")} summary=${clipDebug(data?.summary)}`;
    case "workflow.repair_started": {
      const debugState = (data?.debugState as Record<string, unknown> | undefined) ?? undefined;
      const bb = (debugState?.blackboard as Record<string, unknown> | undefined) ?? undefined;
      const observer = (debugState?.observer as Record<string, unknown> | undefined) ?? undefined;
      return `step=${String(data?.stepName ?? "unknown")} attempt=${String(data?.attempt ?? "?")} hint=${clipDebug(data?.reflectorHint) || "(none)"}${bb ? ` bb.failures=${String(bb.failures ?? "?")} bb.outputs=${clipDebug(bb.stepOutputs, 80)}` : ""}${observer ? ` obs.repairs=${String(observer.totalRepairs ?? "?")} obs.validationFailures=${String(observer.totalValidationFailures ?? "?")}` : ""}`;
    }
    case "workflow.repair_completed":
      return `step=${String(data?.stepName ?? "unknown")} attempt=${String(data?.attempt ?? "?")}`;
    case "workflow.repair_no_progress":
      return `source=${String(data?.sourceStep ?? "unknown")} category=${String(data?.category ?? "unknown")} reason=${clipDebug(data?.reason)}`;
    case "workflow.back_edge_triggered":
    case "workflow.back_edge_exhausted":
      return `source=${String(data?.sourceStep ?? "unknown")} target=${String(data?.targetStep ?? "unknown")} reason=${clipDebug(data?.reason)}`;
    case "warning":
    case "error":
      return clipDebug(data?.message ?? data?.error ?? data);
    case "knowledge_context_attached":
      return `workflow=${String(data?.workflowName ?? "unknown")} items=${String(data?.itemCount ?? "?")}`;
    default:
      return clipDebug(data);
  }
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
  const runtimeLLM = resolvedLLM && ((options.provider as string | undefined) || (options.model as string | undefined))
    ? {
        ...resolvedLLM,
        provider: (options.provider as string | undefined) ?? resolvedLLM.provider,
        model: (options.model as string | undefined) ?? resolvedLLM.model,
      }
    : undefined;

  const runtime = new OboraRuntime({
    policyPath: options.policy as string | undefined,
    agentsPath: options.agents as string | undefined,
    configPath: options.config as string | undefined,
    config: loadedConfig,
    llm: runtimeLLM,
    verbose: Boolean(options.verbose),
  });

  if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
    formatter.info(`Starting workflow execution: ${workflow}`);
  }

  const printPreview = (workflowDef?: { steps?: Array<{ name: string; input?: Record<string, unknown>; output?: { path?: string; schema?: string } }> }): void => {
    if (isQuietOutput(options) || isJsonOutput(options)) {
      return;
    }

    const summary = buildResolutionSummary(
      {
        llm: runtimeLLM,
      },
      runtimeLLM ?? resolvedLLM,
      loadedConfig
    );

    formatter.info(formatResolutionSummary(summary));
    const bindingPreview = workflowDef ? formatBindingPreview(buildBindingPreview(workflowDef)) : "";
    if (bindingPreview) {
      formatter.info(bindingPreview);
    }
    const outputPreview = workflowDef ? formatOutputPreview(buildOutputPreview(workflowDef)) : "";
    if (outputPreview) {
      formatter.info(outputPreview);
    }
  };

  let workflowName = workflow;
  let expandedWorkflow: unknown;
  let stopSemantics: unknown;
  let derivedOutputRoot: string | undefined;
  let derivedArchiveEnabled = false;
  const debugEnabled = isDebugOutput(options);
  let debugFilePath: string | undefined;
  let debugWriteChain = Promise.resolve();
  const appendDebugRecord = (record: Record<string, unknown>): void => {
    if (!debugEnabled || !debugFilePath) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n";
    debugWriteChain = debugWriteChain.then(() => appendFile(debugFilePath!, line, "utf-8"));
  };
  if (workflow.endsWith(".yaml") || workflow.endsWith(".yml")) {
    const loadedConfigRaw = await import("node:fs/promises").then((m) =>
      m.readFile(workflow, "utf-8")
    );
    const parsedRaw = await import("yaml").then((m) => m.parse(loadedConfigRaw));
    const loaded = await Workflow.fromYaml(workflow);
    runtime.define(loaded.name, loaded);
    workflowName = loaded.name;
    expandedWorkflow = loaded;
    stopSemantics = Workflow.getStopSemantics(parsedRaw);
    const workflowVariables =
      loaded.variables && typeof loaded.variables === "object"
        ? (loaded.variables as Record<string, unknown>)
        : {};
    derivedOutputRoot =
      typeof workflowVariables.output_root === "string" ? workflowVariables.output_root : undefined;
    derivedArchiveEnabled = workflowVariables.archive_enabled === true;

    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(`Loaded workflow YAML: ${workflow} -> ${workflowName}`);
    }
  }

  if (expandedWorkflow) {
    printPreview(expandedWorkflow as { steps?: Array<{ name: string; input?: Record<string, unknown>; output?: { path?: string; schema?: string } }> });
  } else if (!isQuietOutput(options) && !isJsonOutput(options)) {
    printPreview();
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

  if (debugEnabled) {
    debugFilePath =
      typeof options.debugFile === "string" && options.debugFile.length > 0
        ? (options.debugFile as string)
        : join(process.cwd(), ".obora-debug", `${basename(workflowName)}-${startedAt}.jsonl`);
    await mkdir(dirname(debugFilePath), { recursive: true });
    await writeFile(debugFilePath, "", "utf-8");
    appendDebugRecord({
      type: "debug.start",
      workflow,
      workflowName,
      options: {
        timeout: options.timeout,
        verbose: options.verbose,
        quiet: options.quiet,
        json: options.json,
      },
      pid: process.pid,
    });
    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(`debug trace enabled: ${debugFilePath}`);
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
      formatter.info("Dry run preview complete. No execution was started.");
      formatter.info(`Next step: obora run ${workflow}`);
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
      const failedChecksCount = Array.isArray(data?.failedChecks)
        ? data!.failedChecks.length
        : undefined;
      formatter.warn(
        `validation failed${data?.stepName ? ` [${data.stepName}]` : ""}: ${data?.summary ?? "unknown reason"}${
          typeof failedChecksCount === "number"
            ? ` (${failedChecksCount} check${failedChecksCount === 1 ? "" : "s"})`
            : ""
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
    const data = event.data as
      | { stepName?: string; attempt?: number; reflectorHint?: string }
      | undefined;
    repairLoopSummary.repairStarted += 1;
    repairLoopSummary.lastRepairStep = data?.stepName;
    repairLoopSummary.lastAttempt = data?.attempt;

    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(
        `repair attempt ${data?.attempt ?? repairLoopSummary.repairStarted}${data?.stepName ? ` → ${data.stepName}` : ""}`
      );
      if (data?.reflectorHint) {
        formatter.info(`  💡 reflector: ${data.reflectorHint}`);
      }
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
    const data = event.data as
      | { sourceStep?: string; reason?: string; category?: string }
      | undefined;
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

  if (debugEnabled) {
    for (const type of DEBUG_EVENT_TYPES) {
      runtime.on(type, (event) => {
        const data =
          event.data && typeof event.data === "object"
            ? (event.data as Record<string, unknown>)
            : undefined;
        appendDebugRecord({
          type,
          executionId: event.executionId,
          data: event.data,
          metadata: event.metadata,
        });
        if (!isQuietOutput(options) && !isJsonOutput(options)) {
          formatter.info(`[debug:${type}] ${summarizeDebugEvent(type, data)}`);
        }
      });
    }
  }

  const execution = await (async () => {
    try {
      const handle = await runtime.run(workflowName, {
        input,
        variables,
        signal: controller.signal,
      });

      appendDebugRecord({
        type: "debug.handle_created",
        executionId: handle.executionId,
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

      return { handle, result };
    } catch (error) {
      appendDebugRecord({
        type: "debug.exception",
        message: error instanceof Error ? error.message : String(error),
      });
      await debugWriteChain;
      throw error;
    }
  })();
  const { handle, result } = execution;
  const elapsedMs = Date.now() - startedAt;

  const effectiveOutputDir =
    typeof options.outputDir === "string" && options.outputDir.length > 0
      ? options.outputDir
      : derivedOutputRoot;

  const derivedMode =
    stopSemantics &&
    typeof stopSemantics === "object" &&
    typeof (stopSemantics as Record<string, unknown>).mode === "string"
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
          2
        ),
        "utf-8"
      );

      const archiveDir = join(
        effectiveOutputDir,
        `${basename(workflowName)}-${handle.executionId}.archive`
      );
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
          "utf-8"
        );
      }

      if (derivedMode === "research-loop") {
        await writeFile(
          join(archiveDir, "FINDINGS.md"),
          "# Findings\n\n- problem framing\n- main findings\n- bounded conclusion\n",
          "utf-8"
        );
      }

      if (derivedMode === "proof-loop") {
        await writeFile(
          join(archiveDir, "PROOF_GAPS.md"),
          "# Proof Gaps\n\n- unresolved lemmas\n- hidden assumptions\n- refutation risk\n",
          "utf-8"
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

  appendDebugRecord({
    type: "debug.end",
    workflowName: result.workflowName,
    executionId: handle.executionId,
    elapsedMs,
    repairLoop: hasRepairLoopActivity ? repairLoopSummary : undefined,
  });
  await debugWriteChain;

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
    .option("--debug", "Enable live debug trace output and JSONL event log")
    .option("--debug-file <path>", "Write debug JSONL trace to this file (implies --debug)")
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

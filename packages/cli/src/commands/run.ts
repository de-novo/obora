import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
  resolveWorkflowTarget,
  resolveLLMConfig,
  Workflow,
} from "@obora/sdk";
import type { OneFileStopSemantics, ResolutionSummary, RuntimeExecution } from "@obora/sdk";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";
import type { GlobalOptions } from "../utils/global-opts.js";

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

async function readJsonInputFromStdin(): Promise<string> {
  if (typeof process.stdin.setEncoding === "function") {
    process.stdin.setEncoding("utf8");
  }

  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    process.stdin.on("data", (chunk) => {
      chunks.push(typeof chunk === "string" ? chunk : String(chunk));
    });
    process.stdin.once("end", () => {
      resolve(chunks.join(""));
    });
    process.stdin.once("error", reject);
  });
}

function normalizeInputOptionValue(value: unknown): string {
  const rawValue = String(value);
  // Commander parses short equals syntax like `-i=@-` as the literal value `=@-`.
  return rawValue.startsWith("=") ? rawValue.slice(1) : rawValue;
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

interface RunGuidanceAction {
  kind: "run";
  command: string;
}

interface DryRunGuidance {
  recommendations: string[];
  actions: RunGuidanceAction[];
}

function buildPreferredRunCommand(workflowCommand: string): string {
  const normalizedWorkflow = workflowCommand.replace(/\\/g, "/");
  if (normalizedWorkflow === "judge.yaml" || normalizedWorkflow === "./judge.yaml") {
    return "obora judge";
  }
  return basename(normalizedWorkflow) === "judge.yaml"
    ? `obora judge ${workflowCommand}`
    : `obora run ${workflowCommand}`;
}

export function applyRunExecutionOptions(command: Command): Command {
  return command
    .option("--json", "Output structured execution results as JSON")
    .option("-i, --input <json>", "Input data as JSON string, @path/to/input.json, or @- for stdin")
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
    .option("--timeout <ms>", "Execution timeout in milliseconds")
    .option("--debug", "Enable live debug trace output and JSONL event log")
    .option("--debug-file <path>", "Write debug JSONL trace to this file (implies --debug)")
    .option(
      "--scope <scope>",
      "Resolve workflow names from project, global, or all workflow scopes"
    )
    .option("--project <path>", "Project root for scoped workflow discovery")
    .option("--global-workflows-dir <path>", "Global workflow directory override");
}

function parseExecutionTimeout(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && value > 0) {
      return value;
    }

    throw new CLIError(`Invalid execution timeout: ${String(value)}`, ExitCode.VALIDATION_ERROR);
  }

  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new CLIError(`Invalid execution timeout: ${String(value)}`, ExitCode.VALIDATION_ERROR);
}

function parseWorkflowResolveScope(value: unknown): "project" | "global" | "all" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const scope = String(value);
  if (scope === "project" || scope === "global" || scope === "all") return scope;
  throw new CLIError(
    `Invalid workflow scope: ${scope}. Expected project, global, or all.`,
    ExitCode.VALIDATION_ERROR
  );
}

export function normalizeRunExecutionOptions(
  globalOpts: GlobalOptions,
  commandOpts: Record<string, unknown>
): Record<string, unknown> {
  const merged = { ...globalOpts, ...commandOpts } as Record<string, unknown>;

  return {
    ...merged,
    timeout: parseExecutionTimeout(merged.timeout),
    scope: parseWorkflowResolveScope(merged.scope),
  };
}

function isYamlWorkflowPath(workflow: string): boolean {
  return workflow.endsWith(".yaml") || workflow.endsWith(".yml");
}

async function resolveRunnableWorkflowPath(
  workflow: string,
  options: Record<string, unknown>
): Promise<{ workflowPath: string; diagnostics: ReadonlyArray<string> }> {
  if (isYamlWorkflowPath(workflow)) {
    return { workflowPath: workflow, diagnostics: [] };
  }

  const result = await resolveWorkflowTarget({
    target: workflow,
    intent: "run",
    cwd: process.cwd(),
    scope: parseWorkflowResolveScope(options.scope),
    ...(typeof options.project === "string" ? { projectRoot: options.project } : {}),
    ...(typeof options.globalWorkflowsDir === "string"
      ? { globalWorkflowDir: options.globalWorkflowsDir }
      : {}),
  });

  if (result.status === "resolved" && result.locator) {
    return { workflowPath: result.locator.path, diagnostics: result.diagnostics };
  }

  if (result.status === "ambiguous" || options.scope) {
    throw new CLIError(
      result.diagnostics.join("\n") || `Workflow not found: ${workflow}`,
      ExitCode.VALIDATION_ERROR
    );
  }

  return { workflowPath: workflow, diagnostics: result.diagnostics };
}

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

function buildDryRunGuidance(
  workflowCommand: string,
  resolutionSummary: {
    fallbackStub: boolean;
  }
): DryRunGuidance {
  const actions: RunGuidanceAction[] = [
    { kind: "run", command: buildPreferredRunCommand(workflowCommand) },
  ];
  const recommendations: string[] = [];

  if (resolutionSummary.fallbackStub) {
    actions.unshift({ kind: "run", command: "obora doctor" });
    recommendations.push("Stub mode: configure auth with `obora doctor` before live execution.");
  } else {
    recommendations.push("Dry run passed. Start live execution when ready.");
  }

  return { recommendations, actions };
}

function buildDryRunOverview(
  workflowName: string,
  workflowCommand: string,
  resolutionSummary: {
    provider: string | null;
    model: string | null;
    fallbackStub: boolean;
  },
  bindingPreviewEntries: unknown[],
  outputPreviewEntries: unknown[]
): Record<string, unknown> {
  return {
    workflow: workflowName,
    validated: true,
    resolvedProvider: resolutionSummary.provider,
    resolvedModel: resolutionSummary.model,
    fallbackStub: resolutionSummary.fallbackStub,
    bindingCount: bindingPreviewEntries.length,
    outputCount: outputPreviewEntries.length,
    nextStep: buildPreferredRunCommand(workflowCommand),
  };
}

function buildDryRunDiagnostics(
  resolutionSummary: ResolutionSummary,
  bindingPreviewEntries: unknown[],
  outputPreviewEntries: unknown[],
  extras: {
    expandedWorkflow?: unknown;
    stopSemantics?: OneFileStopSemantics;
  } = {}
): Record<string, unknown> {
  return {
    resolution: resolutionSummary,
    bindingPreview: bindingPreviewEntries,
    outputPreview: outputPreviewEntries,
    ...(extras.expandedWorkflow !== undefined ? { expandedWorkflow: extras.expandedWorkflow } : {}),
    ...(extras.stopSemantics !== undefined ? { stopSemantics: extras.stopSemantics } : {}),
  };
}

export async function runRun(
  workflow: string,
  options: Record<string, unknown>
): Promise<RuntimeExecution | undefined> {
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
  const runtimeLLM = resolvedLLM
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
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    },
  });

  if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
    formatter.info(`Starting workflow execution: ${workflow}`);
  }

  const resolutionSummary = buildResolutionSummary(
    {
      llm: runtimeLLM,
    },
    runtimeLLM ?? resolvedLLM,
    loadedConfig
  );
  const workflowResolution = await resolveRunnableWorkflowPath(workflow, options);
  const workflowPath = workflowResolution.workflowPath;
  if (!isQuietOutput(options) && !isJsonOutput(options)) {
    workflowResolution.diagnostics.forEach((diagnostic) => formatter.warn(diagnostic));
  }

  const printPreview = (workflowDef?: {
    steps?: Array<{
      name: string;
      input?: Record<string, unknown>;
      output?: { path?: string; schema?: string };
    }>;
  }): void => {
    if (isQuietOutput(options) || isJsonOutput(options)) {
      return;
    }

    formatter.info(formatResolutionSummary(resolutionSummary));
    const bindingPreview = workflowDef ? formatBindingPreview(bindingPreviewEntries) : "";
    if (bindingPreview) {
      formatter.info(bindingPreview);
    }
    const outputPreview = workflowDef ? formatOutputPreview(outputPreviewEntries) : "";
    if (outputPreview) {
      formatter.info(outputPreview);
    }
  };

  const workflowState = {
    name: workflow,
    expanded: undefined as unknown,
    stopSemantics: undefined as OneFileStopSemantics | undefined,
    outputRoot: undefined as string | undefined,
    archiveEnabled: false,
  };
  const debugEnabled = isDebugOutput(options);
  const debugTrace = {
    filePath: undefined as string | undefined,
    writeChain: Promise.resolve(),
  };
  const appendDebugRecord = (record: Record<string, unknown>): void => {
    if (!debugEnabled || !debugTrace.filePath) return;
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record }) + "\n";
    debugTrace.writeChain = debugTrace.writeChain.then(() =>
      appendFile(debugTrace.filePath!, line, "utf-8")
    );
  };
  if (isYamlWorkflowPath(workflowPath)) {
    const loadedConfigRaw = await import("node:fs/promises").then((m) =>
      m.readFile(workflowPath, "utf-8")
    );
    const parsedRaw = await import("yaml").then((m) => m.parse(loadedConfigRaw));
    const loaded = await Workflow.fromYaml(workflowPath);
    runtime.define(loaded.name, loaded);
    workflowState.name = loaded.name;
    workflowState.expanded = loaded;
    workflowState.stopSemantics = Workflow.getStopSemantics(parsedRaw);
    const workflowVariables =
      loaded.variables && typeof loaded.variables === "object"
        ? (loaded.variables as Record<string, unknown>)
        : {};
    workflowState.outputRoot =
      typeof workflowVariables.output_root === "string" ? workflowVariables.output_root : undefined;
    workflowState.archiveEnabled = workflowVariables.archive_enabled === true;

    if (isVerboseOutput(options) && !isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.step(`Loaded workflow YAML: ${workflowPath} -> ${workflowState.name}`);
    }
  }

  const previewWorkflow = workflowState.expanded as
    | {
        steps?: Array<{
          name: string;
          input?: Record<string, unknown>;
          output?: { path?: string; schema?: string };
        }>;
      }
    | undefined;
  const bindingPreviewEntries = previewWorkflow ? buildBindingPreview(previewWorkflow) : [];
  const outputPreviewEntries = previewWorkflow ? buildOutputPreview(previewWorkflow) : [];

  if (workflowState.expanded) {
    printPreview(previewWorkflow);
  } else if (!isQuietOutput(options) && !isJsonOutput(options)) {
    printPreview();
  }

  const variables: Record<string, unknown> = Array.isArray(options.var)
    ? Object.fromEntries(
        options.var.flatMap((v) => {
          const [key, ...rest] = String(v).split("=");
          if (!key) {
            return [];
          }
          return [[key, rest.join("=")] as const];
        })
      )
    : {};

  const input: unknown =
    options.input !== undefined
      ? await (async () => {
          const rawInput = normalizeInputOptionValue(options.input);
          if (rawInput.startsWith("@")) {
            const inputPath = rawInput.slice(1);
            const fileContent =
              inputPath === "-"
                ? await (async () => {
                    if (process.stdin.isTTY) {
                      throw new CLIError(
                        "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
                        ExitCode.VALIDATION_ERROR
                      );
                    }
                    try {
                      return await readJsonInputFromStdin();
                    } catch {
                      throw new CLIError(
                        "Failed to read JSON input from stdin.",
                        ExitCode.VALIDATION_ERROR
                      );
                    }
                  })()
                : await (async () => {
                    try {
                      return await readFile(inputPath, "utf-8");
                    } catch {
                      throw new CLIError(
                        `Failed to read JSON input file: ${inputPath}`,
                        ExitCode.VALIDATION_ERROR
                      );
                    }
                  })();

            const normalizedInput = fileContent.replace(/^\uFEFF/, "");
            if (inputPath === "-" && normalizedInput.trim().length === 0) {
              throw new CLIError(
                "No stdin JSON detected. Pipe JSON to --input @- or pass inline JSON to --input.",
                ExitCode.VALIDATION_ERROR
              );
            }

            try {
              return JSON.parse(normalizedInput);
            } catch {
              throw new CLIError(
                inputPath === "-"
                  ? "Invalid JSON input from stdin. Please pipe valid JSON to --input @-."
                  : `Invalid JSON input file: ${inputPath}`,
                ExitCode.VALIDATION_ERROR
              );
            }
          } else {
            try {
              return JSON.parse(rawInput);
            } catch {
              throw new CLIError(
                "Invalid JSON input. Please provide a valid JSON string to --input.",
                ExitCode.VALIDATION_ERROR
              );
            }
          }
        })()
      : undefined;

  if (debugEnabled) {
    debugTrace.filePath =
      typeof options.debugFile === "string" && options.debugFile.length > 0
        ? (options.debugFile as string)
        : join(process.cwd(), ".obora-debug", `${basename(workflowState.name)}-${startedAt}.jsonl`);
    await mkdir(dirname(debugTrace.filePath), { recursive: true });
    await writeFile(debugTrace.filePath, "", "utf-8");
    appendDebugRecord({
      type: "debug.start",
      workflow,
      workflowName: workflowState.name,
      options: {
        timeout: options.timeout,
        verbose: options.verbose,
        quiet: options.quiet,
        json: options.json,
      },
      pid: process.pid,
    });
    if (!isQuietOutput(options) && !isJsonOutput(options)) {
      formatter.info(`debug trace enabled: ${debugTrace.filePath}`);
    }
  }

  if (options.dryRun) {
    const guidance = buildDryRunGuidance(workflow, resolutionSummary);
    const overview = buildDryRunOverview(
      workflowState.name,
      workflow,
      resolutionSummary,
      bindingPreviewEntries,
      outputPreviewEntries
    );
    const diagnostics = buildDryRunDiagnostics(
      resolutionSummary,
      bindingPreviewEntries,
      outputPreviewEntries,
      {
        ...(options.dumpExpandedWorkflow ? { expandedWorkflow: workflowState.expanded } : {}),
        ...(options.showStopSemantics ? { stopSemantics: workflowState.stopSemantics } : {}),
      }
    );

    if (isJsonOutput(options)) {
      formatter.json({
        workflow: workflowState.name,
        validated: true,
        resolution: resolutionSummary,
        bindingPreview: bindingPreviewEntries,
        outputPreview: outputPreviewEntries,
        overview,
        diagnostics,
        guidance,
        ...(options.dumpExpandedWorkflow ? { expandedWorkflow: workflowState.expanded } : {}),
        ...(options.showStopSemantics ? { stopSemantics: workflowState.stopSemantics } : {}),
        elapsedMs: Date.now() - startedAt,
      });
    } else if (!isQuietOutput(options)) {
      formatter.success(`Workflow "${workflowState.name}" validated successfully.`);
      if (options.dumpExpandedWorkflow && workflowState.expanded) {
        formatter.info("Expanded workflow:");
        formatter.json(workflowState.expanded);
      }
      if (options.showStopSemantics && workflowState.stopSemantics) {
        formatter.info("Stop semantics:");
        formatter.json(workflowState.stopSemantics);
      }
      formatter.info("Dry run preview complete. No execution was started.");
      if (resolutionSummary.fallbackStub) {
        formatter.warn("Stub mode: configure auth with `obora doctor` before live execution.");
        formatter.info("Before live execution: obora doctor");
      }
      formatter.info(`Next step: ${buildPreferredRunCommand(workflow)}`);
      if (isVerboseOutput(options)) {
        formatter.info(`Validation completed in ${Date.now() - startedAt}ms`);
      }
    }
    return undefined;
  }

  const controller = new AbortController();
  const timeoutHandle = { value: undefined as ReturnType<typeof setTimeout> | undefined };
  if (typeof options.timeout === "number" && Number.isFinite(options.timeout)) {
    timeoutHandle.value = setTimeout(() => {
      controller.abort();
    }, options.timeout);
    timeoutHandle.value.unref?.();
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
    DEBUG_EVENT_TYPES.forEach((type) => {
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
    });
  }

  const execution = await (async () => {
    try {
      const handle = await runtime.run(workflowState.name, {
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
          if (timeoutHandle.value) {
            clearTimeout(timeoutHandle.value);
            timeoutHandle.value = undefined;
          }
        }
      })();

      return { handle, result };
    } catch (error) {
      appendDebugRecord({
        type: "debug.exception",
        message: error instanceof Error ? error.message : String(error),
      });
      await debugTrace.writeChain;
      throw error;
    }
  })();
  const { handle, result } = execution;
  const elapsedMs = Date.now() - startedAt;

  const effectiveOutputDir =
    typeof options.outputDir === "string" && options.outputDir.length > 0
      ? options.outputDir
      : workflowState.outputRoot;

  const derivedMode = workflowState.stopSemantics?.mode;

  if (effectiveOutputDir) {
    await mkdir(effectiveOutputDir, { recursive: true });
    const filePath = join(
      effectiveOutputDir,
      `${basename(workflowState.name)}-${handle.executionId}.json`
    );
    await writeFile(filePath, JSON.stringify(result, null, 2), "utf-8");

    if (workflowState.archiveEnabled) {
      const archiveIntentPath = join(
        effectiveOutputDir,
        `${basename(workflowState.name)}-${handle.executionId}.archive-intent.json`
      );
      await writeFile(
        archiveIntentPath,
        JSON.stringify(
          {
            workflowName: result.workflowName,
            executionId: handle.executionId,
            archiveEnabled: true,
            outputRoot: workflowState.outputRoot,
            sourceResultPath: filePath,
          },
          null,
          2
        ),
        "utf-8"
      );

      const archiveDir = join(
        effectiveOutputDir,
        `${basename(workflowState.name)}-${handle.executionId}.archive`
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
  await debugTrace.writeChain;

  if (isJsonOutput(options)) {
    formatter.json({
      workflowName: result.workflowName,
      status: "completed",
      elapsedMs,
      ...(workflowState.outputRoot ? { outputRoot: workflowState.outputRoot } : {}),
      ...(workflowState.archiveEnabled ? { archiveEnabled: true } : {}),
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
    if (workflowState.archiveEnabled && isVerboseOutput(options)) {
      formatter.info("Archive intent enabled for this workflow.");
    }
    if (isVerboseOutput(options)) {
      formatter.info(`Total execution time: ${elapsedMs}ms`);
    }
  }

  return result;
}

export function createRunCommand(): Command {
  return applyRunExecutionOptions(
    new Command("run")
      .description("Execute a workflow (named workflow or one-file YAML mode)")
      .argument("<workflow>", "Workflow name or YAML path")
  ).action(async function (this: Command, workflow, options) {
    const globalOpts = getGlobalOpts(this);
    await handleCommandAction(
      async () => {
        const mergedOptions = normalizeRunExecutionOptions(globalOpts, options);
        await runRun(workflow, mergedOptions);
      },
      { verbose: Boolean(globalOpts.verbose || options.verbose) }
    );
  });
}

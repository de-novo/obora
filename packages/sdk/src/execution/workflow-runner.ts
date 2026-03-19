import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { loadConfig, resolveProviderConfig, type OboraConfig } from "../config-loader.js";
import { resolveLLMConfig, type LLMConfig } from "../llm-config.js";
import { topologicalSort } from "../dependency-resolver.js";
import { StepExecutor } from "../step-executor.js";
import type { LLMAdapterLike } from "../step-executor.js";
import { BudgetExceededError, CostTracker } from "../cost-tracker.js";
import {
  executeWorkflowHook,
  resolveWorkflowHook,
  type HookExecutionResult,
  type WorkflowHookLifecycle,
} from "../hooks.js";
import { queryKnowledge } from "../knowledge/queryKnowledge.js";
import type { WorkflowDef, WorkflowStep } from "../workflow.js";
import type { StorageAdapter, PolicyHashInput, RunRecord } from "@obora/runtime";

import { OboraError, OboraErrorCode } from "../runtime-types.js";
import type { AgentFactory, OboraRuntimeConfig, RuntimeExecution } from "../runtime-types.js";
import type { EventBus } from "../events/event-bus.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import { AdapterResolver } from "./adapter-resolver.js";
import {
  getRepairLoopConfig,
  getValidationStepConfig,
  normalizeValidationResult,
  type RepairContext,
  type ValidationResult,
} from "../validation-repair.js";
import {
  resolveFailureRoute,
  getAllRouteTargets,
  type RouteResolution,
} from "../conditional-routing.js";

// ── Internal shared-setup result ───────────────────────────────────────────

interface ExecutionEngine {
  stepExecutor: StepExecutor | undefined;
  costTracker: CostTracker | undefined;
  loadedConfig: OboraConfig | undefined;
  llmConfig: LLMConfig | undefined;
  runtimeAgents: Map<string, AgentFactory>;
  resolver: AdapterResolver;
}

interface RepairLoopRuntimeState {
  latestValidation?: ValidationResult;
  history: ValidationResult[];
  attempt: number;
  repeatedSignatureCount: number;
  lastSignature?: string;
}

interface PersistedValidationFailureDetail {
  stepName?: string;
  summary?: string;
  errorCode?: string;
  logPath?: string;
  failedChecks: Array<{
    name?: string;
    message?: string;
    severity?: string;
    file?: string;
  }>;
}

interface PersistedRepairLoopSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  lastStopCategory?: "no_progress" | "repeated_critical_issue" | "exhausted";
  recentValidationFailures: PersistedValidationFailureDetail[];
}

// ── WorkflowRunner ─────────────────────────────────────────────────────────

export interface WorkflowRunnerDeps {
  config: OboraRuntimeConfig;
  eventBus: EventBus;
  /** Factory bound to OboraRuntime.createLLMAdapter so spies still work. */
  adapterFactory: (cfg: LLMConfig) => Promise<LLMAdapterLike>;
  persistenceManager: PersistenceManager;
  agents: Map<string, AgentFactory>;
}

/**
 * WorkflowRunner owns the execution engine shared by `run()` and `resume()`.
 *
 * Responsibilities:
 *  - Config loading + LLM adapter resolution (via AdapterResolver)
 *  - Agent YAML loading
 *  - StepExecutor construction with per-agent LLM resolution
 *  - Step execution loop (back-edge / on_fail support)
 *  - Persistence save-points
 *  - Knowledge context injection
 */
export class WorkflowRunner {
  private readonly repairLoopSummaries = new Map<string, PersistedRepairLoopSummary>();

  constructor(private readonly deps: WorkflowRunnerDeps) {}

  // ── Agent YAML loader ────────────────────────────────────────────────────

  async loadAgentsFromYaml(path?: string): Promise<Map<string, AgentFactory>> {
    if (!path) return new Map();

    const content = await readFile(path, "utf-8");
    const parsed = parseYaml(content) as {
      agents?: Record<
        string,
        {
          role?: string;
          description?: string;
          provider?: string;
          model?: string;
          temperature?: number;
        }
      >;
    };
    const map = new Map<string, AgentFactory>();

    for (const [name, info] of Object.entries(parsed.agents ?? {})) {
      map.set(name, () => ({
        role: info.role,
        description: info.description,
        provider: info.provider,
        model: info.model,
        temperature: info.temperature,
      }));
    }

    return map;
  }

  // ── Shared engine builder ────────────────────────────────────────────────

  /**
   * Loads config, resolves LLM credentials, builds AdapterResolver + StepExecutor.
   * Called by both run() and resume() to eliminate duplicated setup.
   */
  async buildEngine(
    executionId: string,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined
  ): Promise<ExecutionEngine> {
    const { config, eventBus, adapterFactory, persistenceManager, agents } = this.deps;

    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);

    const llmConfig = resolveLLMConfig(config.llm, loadedConfig);
    const runtimeAgents = await this.loadAgentsFromYaml(config.agentsPath);
    const allAgents = new Map<string, AgentFactory>([...runtimeAgents, ...agents]);
    const resolver = new AdapterResolver(adapterFactory);

    const resourcesConfig = loadedConfig?.resources;
    const shouldTrackCost = Boolean(resourcesConfig);
    const costTracker = shouldTrackCost
      ? new CostTracker(
          await persistenceManager.getCostTrackingAdapter(),
          executionId,
          loadedConfig
        )
      : undefined;

    if (!llmConfig) {
      await eventBus.emit("warning", executionId, {
        message: "No LLM configured; workflow will run in stub mode.",
        code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
      });
    }

    const stepExecutor = llmConfig
      ? new StepExecutor(await resolver.get(llmConfig), allAgents, {
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
          verbose: config.verbose,
          tools: config.stepTools,
          resolveAgentLLM: this.buildResolveAgentLLM(
            executionId,
            loadedConfig,
            runtimeAgents,
            resolver
          ),
          onEvent: async (eventType, data) => {
            if (eventType === "llm_response" && costTracker) {
              const payload = data as {
                stepName?: string;
                model?: string;
                usage?: {
                  promptTokens?: number;
                  completionTokens?: number;
                  totalTokens?: number;
                };
                latencyMs?: number;
              };
              if (payload.stepName) {
                await costTracker.recordCall({
                  stepName: payload.stepName,
                  model: payload.model,
                  promptTokens: payload.usage?.promptTokens,
                  completionTokens: payload.usage?.completionTokens,
                  totalTokens: payload.usage?.totalTokens,
                  latencyMs: payload.latencyMs,
                });
              }
            }
            await eventBus.emit(eventType, executionId, data);
          },
        })
      : undefined;

    return {
      stepExecutor,
      costTracker,
      loadedConfig,
      llmConfig,
      runtimeAgents,
      resolver,
    };
  }

  // ── resolveAgentLLM builder ──────────────────────────────────────────────

  private buildResolveAgentLLM(
    executionId: string,
    loadedConfig: OboraConfig | undefined,
    runtimeAgents: Map<string, AgentFactory>,
    resolver: AdapterResolver
  ) {
    return async (agentName?: string) => {
      if (!loadedConfig || !agentName) return undefined;

      const yamlAgentRaw = runtimeAgents.get(agentName)?.();
      const yamlAgent =
        yamlAgentRaw && typeof yamlAgentRaw === "object"
          ? (yamlAgentRaw as { provider?: string; model?: string; temperature?: number })
          : undefined;
      const configAgent = loadedConfig.agents?.[agentName];
      const preferYamlAgent = Boolean(yamlAgent);

      const resolvedProviderName = preferYamlAgent
        ? (yamlAgent?.provider ?? loadedConfig.defaults?.provider)
        : (configAgent?.provider ?? loadedConfig.defaults?.provider);

      const providerConfig = resolveProviderConfig(loadedConfig, resolvedProviderName, {
        verbose: this.deps.config.verbose,
      });

      if (!providerConfig) {
        if (resolvedProviderName) {
          await this.deps.eventBus.emit("warning", executionId, {
            message: `Agent '${agentName}' configured with provider '${resolvedProviderName}' but API key not resolved. Falling back to default.`,
            code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
          });
        }
        return undefined;
      }

      return {
        adapter: await resolver.get(providerConfig),
        model: preferYamlAgent
          ? (yamlAgent?.model ?? providerConfig.model)
          : (configAgent?.model ?? providerConfig.model),
        temperature: preferYamlAgent
          ? (yamlAgent?.temperature ?? providerConfig.temperature)
          : (configAgent?.temperature ?? providerConfig.temperature),
        maxTokens: providerConfig.maxTokens,
      };
    };
  }

  // ── Knowledge context injection ──────────────────────────────────────────

  async injectKnowledgeContext(
    executionId: string,
    workflowName: string,
    execution: RuntimeExecution,
    knowledgeContext: NonNullable<import("../runtime-types.js").RunOptions["knowledgeContext"]>,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined
  ): Promise<void> {
    const { eventBus, persistenceManager } = this.deps;

    try {
      const inferredText =
        knowledgeContext.textQuery ??
        `${workflowName}\n${JSON.stringify(execution.input ?? "")}\n${execution.stepOrder.join(" ")}`;

      const knowledgeItems = await queryKnowledge({
        tags: knowledgeContext.tags,
        textQuery: knowledgeContext.textQuery,
        minConfidence: knowledgeContext.minConfidence ?? 0.8,
        limit: Math.max(1, knowledgeContext.limit ?? 5),
        projectId: knowledgeContext.projectId,
      });

      if (knowledgeItems.length === 0) return;

      const normalizedQuery = inferredText.toLowerCase();
      const deduped = Array.from(new Map(knowledgeItems.map((k) => [k.id, k])).values());
      const ranked = deduped
        .map((k) => {
          const text = `${k.title}\n${k.body}`.toLowerCase();
          const textHit = normalizedQuery.length > 0 && text.includes(normalizedQuery) ? 0.4 : 0;
          const tagHits = (knowledgeContext.tags ?? []).filter((t) => k.tags.includes(t)).length;
          const tagScore = Math.min(0.3, tagHits * 0.1);
          const score = k.confidence + textHit + tagScore;
          return { k, score };
        })
        .sort((a, b) => b.score - a.score)
        .map((x) => x.k);

      const contextLines = [
        "## Relevant Prior Knowledge",
        ...ranked.map(
          (k, idx) =>
            `${idx + 1}) [${k.tags.join(", ")}] ${k.title}\n   - confidence: ${k.confidence.toFixed(2)}`
        ),
      ];
      let contextMd = contextLines.join("\n");

      const maxTokens = Math.max(100, knowledgeContext.maxTokens ?? 800);
      const approxTokens = Math.ceil(contextMd.length / 4);
      if (approxTokens > maxTokens) {
        const maxChars = maxTokens * 4;
        contextMd = `${contextMd.slice(0, maxChars)}\n\n... [truncated]`;
        await eventBus.emit("warning", executionId, {
          message: "Knowledge context truncated by token cap",
          code: "SDK_KNOWLEDGE_CONTEXT_TRUNCATED",
          maxTokens,
          approxTokens,
        });
      }

      execution.outputs.__knowledge_context = contextMd;
      await eventBus.emit("knowledge_context_attached", executionId, {
        count: ranked.length,
        minConfidence: knowledgeContext.minConfidence ?? 0.8,
        maxTokens,
      });

      if (persistenceEnabled) {
        try {
          const adapter = await persistenceManager.getStorageAdapter(
            persistenceEnabled,
            persistenceConfig
          );
          await adapter.saveAuditEvent({
            id: randomUUID(),
            runId: executionId,
            stepName: "__knowledge__",
            timestamp: new Date().toISOString(),
            category: "execution",
            action: "knowledge.context_attached",
            actor: "sdk-runtime",
            detail: {
              count: ranked.length,
              maxTokens,
              tags: knowledgeContext.tags ?? [],
              items: ranked.map((k) => ({
                id: k.id,
                title: k.title,
                tags: k.tags,
                confidence: k.confidence,
                source: k.source,
              })),
            },
          });
        } catch (error) {
          if (this.deps.config.verbose) {
            console.warn("[knowledge] failed to persist knowledge audit event:", error);
          }
        }
      }
    } catch (error) {
      if (this.deps.config.verbose) {
        console.warn("[knowledge] failed to attach context:", error);
      }
    }
  }

  private ensureRepairLoopSummary(executionId: string): PersistedRepairLoopSummary {
    const existing = this.repairLoopSummaries.get(executionId);
    if (existing) return existing;

    const created: PersistedRepairLoopSummary = {
      validationFailed: 0,
      validationPassed: 0,
      repairStarted: 0,
      repairCompleted: 0,
      repairNoProgress: 0,
      backEdgeTriggered: 0,
      backEdgeExhausted: 0,
      recentValidationFailures: [],
    };
    this.repairLoopSummaries.set(executionId, created);
    return created;
  }

  private getPersistedRepairLoopSummary(
    executionId: string
  ): PersistedRepairLoopSummary | undefined {
    const summary = this.repairLoopSummaries.get(executionId);
    if (!summary) return undefined;
    const hasActivity =
      summary.validationFailed > 0 ||
      summary.validationPassed > 0 ||
      summary.repairStarted > 0 ||
      summary.repairCompleted > 0 ||
      summary.repairNoProgress > 0 ||
      summary.backEdgeTriggered > 0 ||
      summary.backEdgeExhausted > 0;
    return hasActivity ? structuredClone(summary) : undefined;
  }

  private clearPersistedRepairLoopSummary(executionId: string): void {
    this.repairLoopSummaries.delete(executionId);
  }

  private recordValidationFailure(
    executionId: string,
    stepName: string,
    validationResult: ValidationResult
  ): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.validationFailed += 1;
    summary.lastValidationStep = stepName;
    summary.lastValidationSummary = validationResult.summary;
    summary.recentValidationFailures.push({
      stepName,
      summary: validationResult.summary,
      ...(validationResult.errorCode ? { errorCode: validationResult.errorCode } : {}),
      ...(validationResult.logPath ? { logPath: validationResult.logPath } : {}),
      failedChecks: validationResult.failedChecks.map((check) => ({
        ...(check.name ? { name: check.name } : {}),
        ...(check.message ? { message: check.message } : {}),
        ...(check.severity ? { severity: check.severity } : {}),
        ...(check.file ? { file: check.file } : {}),
      })),
    });
    if (summary.recentValidationFailures.length > 5) {
      summary.recentValidationFailures.shift();
    }
  }

  private recordValidationPass(
    executionId: string,
    stepName: string,
    validationResult: ValidationResult
  ): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.validationPassed += 1;
    summary.lastValidationStep = stepName;
    summary.lastValidationSummary = validationResult.summary;
  }

  private recordRepairStarted(executionId: string, stepName: string, attempt?: number): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.repairStarted += 1;
    summary.lastRepairStep = stepName;
    if (attempt !== undefined) summary.lastAttempt = attempt;
  }

  private recordRepairCompleted(executionId: string, stepName: string, attempt?: number): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.repairCompleted += 1;
    summary.lastRepairStep = stepName;
    if (attempt !== undefined) summary.lastAttempt = attempt;
  }

  private recordRepairNoProgress(
    executionId: string,
    reason: string,
    category: "no_progress" | "repeated_critical_issue" = "no_progress"
  ): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.repairNoProgress += 1;
    summary.lastNoProgressReason = reason;
    summary.lastStopCategory = category;
  }

  private recordBackEdgeTriggered(executionId: string): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.backEdgeTriggered += 1;
  }

  private recordBackEdgeExhausted(executionId: string, reason: string): void {
    const summary = this.ensureRepairLoopSummary(executionId);
    summary.backEdgeExhausted += 1;
    summary.lastExhaustReason = reason;
    summary.lastStopCategory ??= "exhausted";
  }

  private buildRepairContext(
    step: WorkflowStep,
    repairLoopStates: Map<string, RepairLoopRuntimeState>
  ): RepairContext | undefined {
    const repairConfig = getRepairLoopConfig(step.config);
    if (!repairConfig?.enabled) {
      return undefined;
    }

    const state = repairLoopStates.get(step.name);
    if (!state) {
      return {
        mode: "initial_build",
        attempt: 1,
        validationStep: repairConfig.validation_step,
        maxNoProgressIterations: repairConfig.max_no_progress_iterations,
        repeatedCriticalIssueCeiling: repairConfig.repeated_critical_issue_ceiling,
      };
    }

    return {
      mode: "repair",
      attempt: state.attempt,
      latestValidation: state.latestValidation,
      previousValidationResults: state.history,
      validationStep: repairConfig.validation_step,
      repeatedSignatureCount: state.repeatedSignatureCount,
      maxNoProgressIterations: repairConfig.max_no_progress_iterations,
      repeatedCriticalIssueCeiling: repairConfig.repeated_critical_issue_ceiling,
    };
  }

  private resolveValidationResult(
    step: WorkflowStep,
    output: unknown
  ): ValidationResult | undefined {
    const validationConfig = getValidationStepConfig(step.config);
    if (!validationConfig?.enabled) {
      return undefined;
    }

    const normalized = normalizeValidationResult(output);
    if (normalized) {
      return normalized;
    }

    if (validationConfig.emit_structured_result) {
      throw new Error(`Validation step '${step.name}' must emit a structured ValidationResult`);
    }

    return undefined;
  }

  private async runStepHook(
    workflow: WorkflowDef,
    step: WorkflowStep,
    lifecycle: WorkflowHookLifecycle,
    executionId: string,
    options: {
      signal?: AbortSignal;
      continueOnError?: boolean;
      bestEffort?: boolean;
    } = {}
  ): Promise<HookExecutionResult | undefined> {
    const hook = resolveWorkflowHook(workflow.hooks, step.hooks, lifecycle);
    if (!hook) {
      return undefined;
    }

    const result = await executeWorkflowHook(hook, lifecycle, {
      cwd: process.cwd(),
      signal: options.signal,
    });

    if (result.success) {
      return result;
    }

    const failureDetails = {
      stepName: step.name,
      lifecycle,
      command: result.command,
      exitCode: result.exitCode,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };

    if (options.continueOnError || options.bestEffort) {
      await this.deps.eventBus.emit("warning", executionId, {
        message: `Hook '${lifecycle}' failed for step '${step.name}'`,
        bestEffort: options.bestEffort ?? false,
        ...failureDetails,
      });
      return result;
    }

    const exitText = result.exitCode === null ? "unknown" : String(result.exitCode);
    const detailText = result.stderr.trim() || result.stdout.trim() || `exit code ${exitText}`;
    throw new Error(`Hook '${lifecycle}' failed for step '${step.name}': ${detailText}`);
  }

  // ── Core step-execution loop ─────────────────────────────────────────────

  /**
   * Executes a sorted list of steps, handling back-edges (on_fail.goto),
   * persistence save-points, and event emission.
   *
   * Returns when all steps complete successfully.
   * Throws on step failure that exhausts back-edge retries.
   */
  async executeStepLoop(
    sortedSteps: WorkflowStep[],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean
  ): Promise<void> {
    const { eventBus, config } = this.deps;

    const stepIndexByName = new Map(sortedSteps.map((step, idx) => [step.name, idx]));
    const backEdgeIterations = new Map<string, number>();
    const repairLoopStates = new Map<string, RepairLoopRuntimeState>();
    let cursor = 0;

    const triggerBackEdge = async (
      step: WorkflowStep,
      reason: string,
      overrides?: {
        noProgress?: boolean;
        category?: "no_progress" | "repeated_critical_issue";
        cause?: unknown;
        targetResolution?: RouteResolution;
      }
    ): Promise<number> => {
      const onFail = step.on_fail;

      if (!onFail?.goto) {
        throw overrides?.cause ?? new Error(reason);
      }

      const targetStepName =
        overrides?.targetResolution?.target ??
        (typeof onFail.goto === "string" ? onFail.goto : onFail.goto[0]?.target);

      if (!targetStepName) {
        throw overrides?.cause ?? new Error(reason);
      }

      const targetIndex = stepIndexByName.get(targetStepName);
      if (targetIndex === undefined) {
        throw overrides?.cause ?? new Error(reason);
      }

      const maxIterations =
        typeof onFail.max_iterations === "number" &&
        Number.isFinite(onFail.max_iterations) &&
        onFail.max_iterations > 0
          ? onFail.max_iterations
          : 1;
      const key = `${step.name}->${targetStepName}`;
      const nextIteration = (backEdgeIterations.get(key) ?? 0) + 1;
      backEdgeIterations.set(key, nextIteration);

      if (overrides?.noProgress) {
        this.recordRepairNoProgress(executionId, reason, overrides.category ?? "no_progress");
        await eventBus.emit("workflow.repair_no_progress", executionId, {
          sourceStep: step.name,
          targetStep: targetStepName,
          iteration: nextIteration,
          reason,
          category: overrides.category ?? "no_progress",
        });
      }

      if (nextIteration > maxIterations || overrides?.noProgress) {
        this.recordBackEdgeExhausted(executionId, reason);
        await eventBus.emit("workflow.back_edge_exhausted", executionId, {
          sourceStep: step.name,
          targetStep: targetStepName,
          iteration: nextIteration,
          maxIterations,
          escalation: onFail.escalate_on_exhaust ?? "fail",
          reason,
        });
        throw overrides?.cause ?? new Error(reason);
      }

      const invalidated = sortedSteps.slice(targetIndex).map((s) => s.name);
      const invalidatedSet = new Set(invalidated);
      execution.completedSteps = execution.completedSteps.filter(
        (name) => !invalidatedSet.has(name)
      );
      for (const name of invalidated) {
        delete execution.outputs[name];
        delete execution.stepRecords[name];
      }

      this.recordBackEdgeTriggered(executionId);
      await eventBus.emit("workflow.back_edge_triggered", executionId, {
        sourceStep: step.name,
        targetStep: targetStepName,
        iteration: nextIteration,
        maxIterations,
        reason,
        ...(overrides?.targetResolution ? { routeResolution: overrides.targetResolution } : {}),
      });

      await this.runStepHook(workflow, step, "post_cycle", executionId, {
        signal,
        continueOnError: true,
        bestEffort: true,
      });

      return targetIndex;
    };

    while (cursor < sortedSteps.length) {
      const step = sortedSteps[cursor]!;

      if (isSettledFn?.()) return;

      if (signal?.aborted) return;

      if (costTracker) {
        await costTracker.preStepGate(step.name);
      }

      const repairContext = this.buildRepairContext(step, repairLoopStates);
      if (repairContext?.mode === "repair") {
        this.recordRepairStarted(executionId, step.name, repairContext.attempt);
        await eventBus.emit("workflow.repair_started", executionId, {
          stepName: step.name,
          attempt: repairContext.attempt,
          latestValidation: repairContext.latestValidation,
        });
      }

      const stepStartedAt = Date.now();
      await eventBus.emit("step_start", executionId, {
        stepName: step.name,
        agent: step.agent,
      });

      let result: { output: unknown; raw?: unknown } | undefined;
      const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

      try {
        const preStepHook = await this.runStepHook(workflow, step, "pre_step", executionId, {
          signal,
        });
        if (preStepHook) {
          hookOutputs.pre_step = preStepHook;
        }

        if (getValidationStepConfig(step.config)?.enabled) {
          const preValidationHook = await this.runStepHook(
            workflow,
            step,
            "pre_validation",
            executionId,
            { signal }
          );
          if (preValidationHook) {
            hookOutputs.pre_validation = preValidationHook;
          }
        }

        result = stepExecutor
          ? await stepExecutor.executeStep(step, {
              previousOutputs: execution.outputs,
              signal,
              ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
              ...(repairContext ? { repairContext } : {}),
            })
          : {
              output: "[stub] No LLM configured",
              raw: { stub: true, reason: "No LLM configured" },
            };

        const postStepHook = await this.runStepHook(workflow, step, "post_step", executionId, {
          signal,
          continueOnError: true,
        });
        if (postStepHook) {
          hookOutputs.post_step = postStepHook;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        cursor = await triggerBackEdge(step, reason, { cause: error });
        continue;
      }

      if (isSettledFn?.() || !result) return;

      const validationResult = this.resolveValidationResult(step, result.output);
      if (validationResult) {
        if (validationResult.passed) {
          this.recordValidationPass(executionId, step.name, validationResult);
          await eventBus.emit("workflow.validation_passed", executionId, {
            stepName: step.name,
            summary: validationResult.summary,
            signature: validationResult.signature,
          });
        } else {
          this.recordValidationFailure(executionId, step.name, validationResult);
          await eventBus.emit("workflow.validation_failed", executionId, {
            stepName: step.name,
            summary: validationResult.summary,
            errorCode: validationResult.errorCode,
            failedChecks: validationResult.failedChecks,
            signature: validationResult.signature,
            logPath: validationResult.logPath,
          });

          const goto = step.on_fail?.goto;
          if (goto) {
            const routeResolution = resolveFailureRoute(goto, validationResult);
            const targetStepName = routeResolution.target;

            const previousState = repairLoopStates.get(targetStepName);
            const repeatedSignatureCount =
              previousState?.lastSignature &&
              previousState.lastSignature === validationResult.signature
                ? previousState.repeatedSignatureCount + 1
                : 1;
            const nextState: RepairLoopRuntimeState = {
              latestValidation: validationResult,
              history: [...(previousState?.history ?? []), validationResult],
              attempt: (previousState?.attempt ?? 1) + 1,
              repeatedSignatureCount,
              lastSignature: validationResult.signature,
            };
            repairLoopStates.set(targetStepName, nextState);

            const repairConfig = getRepairLoopConfig(
              sortedSteps.find((candidate) => candidate.name === targetStepName)?.config
            );
            const noProgressLimit = repairConfig?.max_no_progress_iterations;
            const repeatedCriticalIssueCeiling = repairConfig?.repeated_critical_issue_ceiling;
            if (noProgressLimit !== undefined && repeatedSignatureCount > noProgressLimit) {
              cursor = await triggerBackEdge(
                step,
                `Validation for step '${step.name}' made no progress after ${repeatedSignatureCount} repeated failure signature(s): ${validationResult.summary}`,
                { noProgress: true, category: "no_progress", targetResolution: routeResolution }
              );
              continue;
            }
            if (
              repeatedCriticalIssueCeiling !== undefined &&
              repeatedSignatureCount > repeatedCriticalIssueCeiling
            ) {
              cursor = await triggerBackEdge(
                step,
                `Validation for step '${step.name}' exceeded repeated critical issue ceiling after ${repeatedSignatureCount} repeated failure signature(s): ${validationResult.summary}`,
                {
                  noProgress: true,
                  category: "repeated_critical_issue",
                  targetResolution: routeResolution,
                }
              );
              continue;
            }

            cursor = await triggerBackEdge(
              step,
              `Validation failed for step '${step.name}': ${validationResult.summary}`,
              { targetResolution: routeResolution }
            );
            continue;
          }

          cursor = await triggerBackEdge(
            step,
            `Validation failed for step '${step.name}': ${validationResult.summary}`
          );
          continue;
        }
      }

      execution.outputs[step.name] = result.output;
      execution.stepRecords[step.name] =
        Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
      execution.completedSteps.push(step.name);

      if (repairContext?.mode === "repair") {
        this.recordRepairCompleted(executionId, step.name, repairContext.attempt);
        await eventBus.emit("workflow.repair_completed", executionId, {
          stepName: step.name,
          attempt: repairContext.attempt,
        });
      }

      if (persistenceEnabled && persistenceAdapter) {
        try {
          const outputValue =
            typeof result.output === "object" && result.output !== null
              ? (result.output as Record<string, unknown>)
              : { value: result.output };
          await persistenceAdapter.saveStep({
            id: `${executionId}:${step.name}`,
            runId: executionId,
            stepName: step.name,
            status: "completed",
            output: outputValue,
            startedAt: new Date(stepStartedAt).toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: Date.now() - stepStartedAt,
          });
        } catch (err) {
          if (config.verbose) {
            console.warn("[persistence] Failed to save step:", err);
          }
        }
      }

      if (isSettledFn?.()) return;

      await eventBus.emit("step_end", executionId, {
        stepName: step.name,
        status: "completed",
        durationMs: Date.now() - stepStartedAt,
        outputPreview:
          typeof result.output === "string"
            ? result.output.slice(0, 200)
            : JSON.stringify(result.output).slice(0, 200),
      });

      if (isSettledFn?.()) return;

      cursor += 1;
    }
  }

  // ── Run execution ────────────────────────────────────────────────────────

  /**
   * Runs a workflow definition and returns the completed RuntimeExecution.
   * Called from OboraRuntime.run() after handle/promise scaffolding is set up.
   */
  async executeRun(
    executionId: string,
    workflowName: string,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    options: import("../runtime-types.js").RunOptions,
    isSettledFn: () => boolean
  ): Promise<void> {
    const { input, variables, signal, knowledgeContext } = options;
    const { eventBus, persistenceManager, config } = this.deps;

    await eventBus.emit("execution_start", executionId, {
      workflowName,
      input,
      variables,
    });

    if (isSettledFn()) return;

    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);

    const persistenceConfig = config.persistence ?? loadedConfig?.persistence;
    const persistenceEnabled = persistenceConfig?.enabled ?? false;

    // Persistence: save run at start
    let persistenceAdapter: StorageAdapter | null = null;
    if (persistenceEnabled) {
      try {
        persistenceAdapter = await persistenceManager.getStorageAdapter(
          persistenceEnabled,
          persistenceConfig
        );
        await persistenceAdapter.saveRun({
          id: executionId,
          workflowName,
          status: "running",
          input: { value: input ?? null },
          startedAt: execution.startedAt.toISOString(),
          metadata: { variables },
        });
      } catch (err) {
        if (config.verbose) {
          console.warn("[persistence] Failed to save run at start:", err);
        }
      }
    }

    const sortedSteps = topologicalSort(workflow.steps);
    execution.stepOrder = sortedSteps.map((step) => step.name);

    // Knowledge context injection
    const knowledgeEnabled = knowledgeContext?.enabled ?? true;
    if (knowledgeEnabled && knowledgeContext !== undefined) {
      await this.injectKnowledgeContext(
        executionId,
        workflowName,
        execution,
        knowledgeContext,
        persistenceEnabled,
        persistenceConfig
      );
    } else if (knowledgeEnabled) {
      // default: try with empty context options
      await this.injectKnowledgeContext(
        executionId,
        workflowName,
        execution,
        {},
        persistenceEnabled,
        persistenceConfig
      );
    }

    // Build execution engine
    const engine = await this.buildEngine(executionId, persistenceEnabled, persistenceConfig);

    // Run step loop
    await this.executeStepLoop(
      sortedSteps,
      workflow,
      execution,
      engine.stepExecutor,
      engine.costTracker,
      executionId,
      persistenceEnabled,
      persistenceAdapter,
      signal,
      isSettledFn
    );

    if (isSettledFn()) return;

    execution.status = "completed";
    execution.endedAt = new Date();

    // Persistence: update on completion
    if (persistenceEnabled && persistenceAdapter) {
      try {
        await persistenceAdapter.saveRun({
          id: executionId,
          workflowName,
          status: "completed",
          input: { value: input ?? null },
          startedAt: execution.startedAt.toISOString(),
          completedAt: execution.endedAt!.toISOString(),
          metadata: {
            variables,
            stepOrder: execution.stepOrder,
            ...(this.getPersistedRepairLoopSummary(executionId)
              ? { repairLoop: this.getPersistedRepairLoopSummary(executionId) }
              : {}),
          },
        });

        await persistenceAdapter.saveAuditEvent({
          id: randomUUID(),
          runId: executionId,
          stepName: "__knowledge__",
          timestamp: new Date().toISOString(),
          category: "execution",
          action: "knowledge.run_summary",
          actor: "sdk-runtime",
          detail: {
            workflowName,
            stepOrder: execution.stepOrder,
            outputKeys: Object.keys(execution.outputs),
          },
        });
      } catch (err) {
        if (config.verbose) {
          console.warn("[persistence] Failed to save run on completion:", err);
        }
      }
    }

    this.clearPersistedRepairLoopSummary(executionId);

    await eventBus.emit("execution_end", executionId, {
      workflowName,
      status: "completed",
    });
  }

  /**
   * Saves the run record on failure/abort.
   */
  async saveRunOnError(
    executionId: string,
    workflowName: string,
    execution: RuntimeExecution,
    variables: Record<string, unknown> | undefined,
    errorCode: string,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined
  ): Promise<void> {
    if (!persistenceEnabled) return;
    const { persistenceManager, config } = this.deps;
    try {
      const adapter = await persistenceManager.getStorageAdapter(
        persistenceEnabled,
        persistenceConfig
      );
      await adapter.saveRun({
        id: executionId,
        workflowName,
        status: execution.status as RunRecord["status"],
        input: { value: execution.input ?? null },
        startedAt: execution.startedAt.toISOString(),
        completedAt: execution.endedAt?.toISOString(),
        metadata: {
          variables,
          error: execution.error,
          errorCode,
          ...(this.getPersistedRepairLoopSummary(executionId)
            ? { repairLoop: this.getPersistedRepairLoopSummary(executionId) }
            : {}),
        },
      });
    } catch (err) {
      if (config.verbose) {
        console.warn("[persistence] Failed to save run on error:", err);
      }
    } finally {
      this.clearPersistedRepairLoopSummary(executionId);
    }
  }

  // ── Resume execution ─────────────────────────────────────────────────────

  /**
   * Re-executes only the `rerunSteps` of a previously failed/suspended run.
   * Restores completed step outputs from `stepPolicies` before re-running.
   */
  async executeResume(
    runId: string,
    workflowName: string,
    workflow: WorkflowDef,
    runInput: unknown,
    rerunSteps: string[],
    stepPolicies: Array<{ stepName: string; action: string; output?: unknown }>,
    currentPolicyConfig: PolicyHashInput,
    adapter: StorageAdapter
  ): Promise<RuntimeExecution> {
    const { eventBus, config } = this.deps;
    const executionId = runId;

    const execution: RuntimeExecution = {
      id: executionId,
      workflowName,
      status: "running",
      input: runInput,
      startedAt: new Date(),
      stepOrder: workflow.steps.map((s) => s.name),
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };

    const completedStepsSet = new Set<string>();

    // Restore completed / skip step outputs
    for (const policy of stepPolicies) {
      if (policy.action === "restore") {
        if (policy.output !== undefined) {
          execution.outputs[policy.stepName] = policy.output;
        }
        completedStepsSet.add(policy.stepName);
        execution.completedSteps = [...completedStepsSet];
      } else if (policy.action === "skip") {
        completedStepsSet.add(policy.stepName);
        execution.completedSteps = [...completedStepsSet];
      }
    }

    const persistenceEnabled = config.persistence?.enabled ?? false;
    const persistenceConfig = config.persistence;

    const engine = await this.buildEngine(executionId, persistenceEnabled, persistenceConfig);

    // Import CheckpointManager here to avoid top-level circular deps
    const { CheckpointManager } = await import("@obora/runtime");
    const mgr = new CheckpointManager(adapter);

    const sortedStepDefs = topologicalSort(workflow.steps).filter((s) =>
      rerunSteps.includes(s.name)
    );

    await eventBus.emit("execution_start", executionId, {
      workflowName,
      input: runInput,
      resume: true,
      rerunSteps,
    });

    for (const step of sortedStepDefs) {
      if (engine.costTracker) {
        await engine.costTracker.preStepGate(step.name);
      }
      await eventBus.emit("step_start", executionId, { stepName: step.name, agent: step.agent });

      const stepStartedAt = Date.now();
      const startedAtIso = new Date(stepStartedAt).toISOString();
      const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

      await adapter.saveStep({
        id: `${runId}:${step.name}`,
        runId,
        stepName: step.name,
        status: "running",
        startedAt: startedAtIso,
      });

      try {
        const preStepHook = await this.runStepHook(workflow, step, "pre_step", executionId);
        if (preStepHook) {
          hookOutputs.pre_step = preStepHook;
        }

        if (getValidationStepConfig(step.config)?.enabled) {
          const preValidationHook = await this.runStepHook(
            workflow,
            step,
            "pre_validation",
            executionId
          );
          if (preValidationHook) {
            hookOutputs.pre_validation = preValidationHook;
          }
        }

        const result = engine.stepExecutor
          ? await engine.stepExecutor.executeStep(step, {
              previousOutputs: execution.outputs,
              ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
            })
          : {
              output: "[stub] No LLM configured",
              raw: { stub: true, reason: "No LLM configured" },
            };

        const postStepHook = await this.runStepHook(workflow, step, "post_step", executionId, {
          continueOnError: true,
        });
        if (postStepHook) {
          hookOutputs.post_step = postStepHook;
        }

        execution.outputs[step.name] = result.output;
        execution.stepRecords[step.name] =
          Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
        completedStepsSet.add(step.name);
        execution.completedSteps = [...completedStepsSet];

        const completedAtIso = new Date().toISOString();
        await adapter.saveStep({
          id: `${runId}:${step.name}`,
          runId,
          stepName: step.name,
          status: "completed",
          output:
            result.output && typeof result.output === "object"
              ? (result.output as Record<string, unknown>)
              : ({ value: result.output } as Record<string, unknown>),
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs: Date.now() - stepStartedAt,
        });

        await mgr.saveCheckpoint(
          runId,
          step.name,
          execution.completedSteps,
          execution.outputs,
          currentPolicyConfig
        );

        await eventBus.emit("step_end", executionId, {
          stepName: step.name,
          status: "completed",
          durationMs: Date.now() - stepStartedAt,
        });
      } catch (stepErr) {
        const completedAtIso = new Date().toISOString();
        await adapter.saveStep({
          id: `${runId}:${step.name}`,
          runId,
          stepName: step.name,
          status: "failed",
          error: {
            code:
              stepErr instanceof BudgetExceededError
                ? OboraErrorCode.POLICY_RESOURCE_EXCEEDED
                : stepErr instanceof OboraError
                  ? stepErr.code
                  : OboraErrorCode.SDK_UNKNOWN_ERROR,
            message: stepErr instanceof Error ? stepErr.message : String(stepErr),
            stack: stepErr instanceof Error ? stepErr.stack : undefined,
          },
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs: Date.now() - stepStartedAt,
        });

        await mgr.saveCheckpoint(
          runId,
          step.name,
          execution.completedSteps,
          execution.outputs,
          currentPolicyConfig
        );

        throw stepErr;
      }
    }

    execution.status = "completed";
    execution.endedAt = new Date();
    await eventBus.emit("execution_end", executionId, {
      workflowName,
      status: "completed",
      resume: true,
    });
    await adapter.saveRun({
      id: runId,
      workflowName,
      status: "completed",
      input: { value: runInput ?? null },
      startedAt: execution.startedAt.toISOString(),
      completedAt: execution.endedAt.toISOString(),
      ...(this.getPersistedRepairLoopSummary(executionId)
        ? { metadata: { repairLoop: this.getPersistedRepairLoopSummary(executionId) } }
        : {}),
    });

    this.clearPersistedRepairLoopSummary(executionId);

    return execution;
  }
}

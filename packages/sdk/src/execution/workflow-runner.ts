import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { parse as parseYaml } from "yaml";

import { loadConfig, resolveProviderConfig, type OboraConfig } from "../config-loader.js";
import { resolveLLMConfig, type LLMConfig } from "../llm-config.js";
import { topologicalSort, groupByParallelizableLevels } from "../dependency-resolver.js";
import {
  ParallelScheduler,
  type ParallelStepOutcome,
} from "./parallel-scheduler.js";
import { StepExecutor } from "../step-executor.js";
import type { LLMAdapterLike, StepResult } from "../step-executor.js";
import { BudgetExceededError, CostTracker } from "../cost-tracker.js";
import {
  executeWorkflowHook,
  resolveWorkflowHook,
  type HookExecutionResult,
  type WorkflowHookLifecycle,
} from "../hooks.js";
import { queryKnowledge } from "../knowledge/queryKnowledge.js";
import type { WorkflowDef, WorkflowStep, MergeStrategy } from "../workflow.js";
import type { StorageAdapter, PolicyHashInput, RunRecord } from "@obora/runtime";

import { OboraError, OboraErrorCode } from "../runtime-types.js";
import type {
  AgentFactory,
  AuditEvent,
  OboraRuntimeConfig,
  RuntimeExecution,
  TKGPromotionTrigger,
} from "../runtime-types.js";
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
import { BlackboardManager } from "../blackboard/blackboard-manager.js";
import type { BlackboardSnapshot } from "../blackboard/blackboard-manager.js";
import { ExecutionObserver } from "../blackboard/execution-observer.js";
import type { ExecutionMetrics } from "../blackboard/execution-observer.js";
import { ExecutionReflector } from "../blackboard/execution-reflector.js";
import { ReflectorEngine } from "../reflector/reflector-engine.js";
import { KnowledgeStore } from "../reflector/knowledge-store.js";
import type { ReflectorRule } from "../reflector/rule-engine.js";
import {
  FileSharedMemoryStore,
  mergeSharedMemorySnapshots,
  sortMemoryScopesByPriority,
  type MemoryScope,
  type SharedMemorySnapshot,
  type SharedMemoryStore,
} from "../shared-memory/store.js";
import { TKGProjector, projectAuditEventToTemporalNode } from "../tkg/projector.js";
import {
  buildSharedMemorySnapshotFromTKGPromotion,
  reapplyApprovedTKGReviewQueueItems,
  summarizeTKGPromotionApply,
  type TKGApprovedReviewQueueApplySummary,
} from "../tkg/apply.js";
import {
  evaluateTKGPromotion,
  summarizeTKGPromotionEvaluation,
} from "../tkg/promotion.js";
import {
  FileTKGRollbackStore,
  restoreTKGRollbackFromStore,
  summarizeTKGRollbackEntries,
  type TKGRollbackEntry,
  type TKGRollbackRestoreSummary,
  type TKGRollbackStore,
} from "../tkg/rollback.js";
import {
  FileTKGReviewQueueStore,
  listOpenTKGReviewQueueItemsFromStore,
  resolveTKGReviewQueueItemInStore,
  type TKGReviewQueueItem,
  type TKGReviewQueueResolutionSummary,
  type TKGReviewQueueStore,
} from "../tkg/review-queue.js";
import {
  FileStagingTKGStore,
  type ProjectableTKGEventType,
  type StagingTKGStore,
} from "../tkg/store.js";

/** Duck-type for reflector: both ExecutionReflector and ReflectorEngine implement this. */
type ReflectorLike = {
  analyzeFailures(failures: import("../blackboard/blackboard-manager.js").FailureEntry[], currentStepName?: string): string | undefined;
};

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

const DEFAULT_MAX_CONCURRENCY = 3;

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

  private extractFailurePatterns(
    blackboard: BlackboardManager,
    reflector: ReflectorLike,
  ): string[] {
    const failures = blackboard.getFailureHistory();
    if (failures.length === 0) return [];
    const hint = reflector.analyzeFailures(failures);
    return hint ? [hint] : [];
  }

  private summarizeBlackboardSnapshot(snapshot: BlackboardSnapshot): Record<string, unknown> {
    return {
      facts: snapshot.facts.length,
      failures: snapshot.failures.length,
      stepOutputs: Object.keys(snapshot.stepOutputs),
      stepTimings: Object.keys(snapshot.stepTimings),
      lastFailure: snapshot.failures.at(-1)
        ? {
            stepName: snapshot.failures.at(-1)!.stepName,
            attempt: snapshot.failures.at(-1)!.attempt,
            summary: snapshot.failures.at(-1)!.validation.summary,
          }
        : undefined,
    };
  }

  private summarizeObserverMetrics(metrics?: ExecutionMetrics): Record<string, unknown> | undefined {
    if (!metrics) return undefined;
    return {
      totalSteps: metrics.stepMetrics.size,
      totalBackEdges: metrics.totalBackEdges,
      totalRepairs: metrics.totalRepairs,
      totalValidationFailures: metrics.totalValidationFailures,
      totalValidationPasses: metrics.totalValidationPasses,
      steps: [...metrics.stepMetrics.values()].map((step) => ({
        stepName: step.stepName,
        status: step.status,
        retryCount: step.retryCount,
        validationFailures: step.validationFailures,
        validationPasses: step.validationPasses,
      })),
    };
  }

  private resolveSharedMemoryConfig(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): NonNullable<OboraConfig["sharedMemory"]> | undefined {
    const baseConfig = loadedConfig?.sharedMemory;
    const runtimeSharedMemory = runtimeConfig.sharedMemory;

    const merged: NonNullable<OboraConfig["sharedMemory"]> = {
      ...(baseConfig ?? {}),
      ...(runtimeSharedMemory ?? {}),
      file: {
        ...(baseConfig?.file ?? {}),
        ...(runtimeSharedMemory?.file ?? {}),
      },
      custom: runtimeSharedMemory?.custom ?? baseConfig?.custom,
    };

    if (workflow.sharedMemory) {
      merged.enabled = workflow.sharedMemory.enabled ?? merged.enabled;
      merged.file = {
        ...(merged.file ?? {}),
        ...(workflow.sharedMemory.projectKey !== undefined
          ? { projectKey: workflow.sharedMemory.projectKey }
          : {}),
        ...(workflow.sharedMemory.scopes !== undefined
          ? { scopes: workflow.sharedMemory.scopes }
          : {}),
      };
    }

    return merged;
  }

  private resolveSharedMemoryStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): SharedMemoryStore | undefined {
    const sharedMemoryConfig = this.resolveSharedMemoryConfig(workflow, runtimeConfig, loadedConfig);
    if (!sharedMemoryConfig?.enabled) return undefined;

    if (sharedMemoryConfig.adapter === "custom") {
      return sharedMemoryConfig.custom?.instance;
    }

    const basePath = sharedMemoryConfig.file?.basePath ?? join(process.cwd(), ".obora", "shared-memory");
    return new FileSharedMemoryStore(basePath);
  }

  private resolveSharedMemoryScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): MemoryScope[] {
    const sharedMemoryConfig = this.resolveSharedMemoryConfig(workflow, runtimeConfig, loadedConfig);
    if (!sharedMemoryConfig?.enabled) {
      return [];
    }

    const scopeLevels = sharedMemoryConfig.file?.scopes ?? (["workflow", "project"] as MemoryScope["level"][]);
    const projectKey = sharedMemoryConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      })),
    );
  }

  private async importSharedMemory(
    store: SharedMemoryStore | undefined,
    scopes: MemoryScope[],
    blackboard: BlackboardManager,
    execution: RuntimeExecution,
  ): Promise<{ importedScopes: string[]; mergedSnapshot: SharedMemorySnapshot | null }> {
    if (!store) return { importedScopes: [], mergedSnapshot: null };

    let mergedSnapshot: SharedMemorySnapshot | null = null;
    const importedScopes: string[] = [];
    const factSources = new Map<string, MemoryScope>();

    for (const scope of scopes) {
      const snapshot = await store.load(scope);
      if (!snapshot) continue;
      blackboard.recordSharedMemorySnapshot(snapshot, scope);
      for (const fact of snapshot.knowledge.facts) {
        factSources.set(fact.id, scope);
      }
      mergedSnapshot = mergeSharedMemorySnapshots(mergedSnapshot, snapshot);
      importedScopes.push(`${scope.level}:${scope.key}`);
    }

    if (mergedSnapshot) {
      blackboard.importPersistentSnapshot(mergedSnapshot, scopes.at(-1) ?? { level: "workflow", key: "merged" }, {
        factSources: Object.fromEntries(factSources.entries()),
        storeSnapshot: false,
      });

      execution.outputs.__shared_memory__ = {
        importedScopes,
        knowledge: mergedSnapshot.knowledge,
        decisions: mergedSnapshot.decisions,
        context: mergedSnapshot.context,
        provenance: {
          knowledge: Object.fromEntries(
            [...factSources.entries()].map(([factId, scope]) => [factId, `${scope.level}:${scope.key}`]),
          ),
        },
      };
    }

    return { importedScopes, mergedSnapshot };
  }

  private async persistSharedMemory(
    store: SharedMemoryStore | undefined,
    scopes: MemoryScope[],
    blackboard: BlackboardManager,
    executionId: string,
  ): Promise<void> {
    if (!store || scopes.length === 0) return;
    const snapshot = blackboard.exportPersistentSnapshot(executionId);
    for (const scope of scopes) {
      if (typeof store.merge === "function") {
        await store.merge(scope, snapshot);
      } else {
        await store.save(scope, snapshot);
      }
    }
  }

  private resolveTKGProjectionConfig(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): NonNullable<OboraConfig["tkgProjection"]> | undefined {
    const baseConfig = loadedConfig?.tkgProjection;
    const runtimeTKGProjection = runtimeConfig.tkgProjection;

    const merged: NonNullable<OboraConfig["tkgProjection"]> = {
      ...(baseConfig ?? {}),
      ...(runtimeTKGProjection ?? {}),
      file: {
        ...(baseConfig?.file ?? {}),
        ...(runtimeTKGProjection?.file ?? {}),
      },
      custom: runtimeTKGProjection?.custom ?? baseConfig?.custom,
      promotion: {
        ...(baseConfig?.promotion ?? {}),
        ...(runtimeTKGProjection?.promotion ?? {}),
      },
      rollback: {
        ...(baseConfig?.rollback ?? {}),
        ...(runtimeTKGProjection?.rollback ?? {}),
        file: {
          ...(baseConfig?.rollback?.file ?? {}),
          ...(runtimeTKGProjection?.rollback?.file ?? {}),
        },
        custom: runtimeTKGProjection?.rollback?.custom ?? baseConfig?.rollback?.custom,
      },
      reviewQueue: {
        ...(baseConfig?.reviewQueue ?? {}),
        ...(runtimeTKGProjection?.reviewQueue ?? {}),
        file: {
          ...(baseConfig?.reviewQueue?.file ?? {}),
          ...(runtimeTKGProjection?.reviewQueue?.file ?? {}),
        },
        custom: runtimeTKGProjection?.reviewQueue?.custom ?? baseConfig?.reviewQueue?.custom,
      },
    };

    if (workflow.tkgProjection) {
      merged.enabled = workflow.tkgProjection.enabled ?? merged.enabled;
      merged.file = {
        ...(merged.file ?? {}),
        ...(workflow.tkgProjection.projectKey !== undefined
          ? { projectKey: workflow.tkgProjection.projectKey }
          : {}),
        ...(workflow.tkgProjection.scopes !== undefined
          ? { scopes: workflow.tkgProjection.scopes }
          : {}),
      };
      merged.promotion = {
        ...(merged.promotion ?? {}),
        ...(workflow.tkgProjection.promotion ?? {}),
      };
      merged.rollback = {
        ...(merged.rollback ?? {}),
        ...(workflow.tkgProjection.rollback?.enabled !== undefined
          ? { enabled: workflow.tkgProjection.rollback.enabled }
          : {}),
      };
      merged.reviewQueue = {
        ...(merged.reviewQueue ?? {}),
        ...(workflow.tkgProjection.reviewQueue?.enabled !== undefined
          ? { enabled: workflow.tkgProjection.reviewQueue.enabled }
          : {}),
      };
    }

    return merged;
  }

  private resolveStagingTKGStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): StagingTKGStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled) return undefined;

    if (tkgProjectionConfig.adapter === "custom") {
      return tkgProjectionConfig.custom?.instance;
    }

    const basePath = tkgProjectionConfig.file?.basePath ?? join(process.cwd(), ".obora", "tkg-staging");
    return new FileStagingTKGStore(basePath);
  }

  private resolveTKGProjectionScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): MemoryScope[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled) {
      return [];
    }

    const scopeLevels = tkgProjectionConfig.file?.scopes ?? (["workflow", "project"] as MemoryScope["level"][]);
    const projectKey = tkgProjectionConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      })),
    );
  }

  private resolveTKGPromotionApplyScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): MemoryScope[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled || tkgProjectionConfig.promotion?.enabled === false) {
      return [];
    }

    const scopeLevels = tkgProjectionConfig.promotion?.applyScopes;
    if (!scopeLevels || scopeLevels.length === 0) {
      return [];
    }

    const projectKey = tkgProjectionConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      })),
    );
  }

  private resolveTKGPromotionTriggers(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): TKGPromotionTrigger[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled || tkgProjectionConfig.promotion?.enabled === false) {
      return [];
    }

    const configuredTriggers = tkgProjectionConfig.promotion?.triggers;
    if (!configuredTriggers || configuredTriggers.length === 0) {
      return ["execution_end"];
    }

    return [...new Set(configuredTriggers)];
  }

  private buildDeterministicTKGId(parts: unknown[]): string {
    return createHash("sha1").update(JSON.stringify(parts)).digest("hex");
  }

  private async flushTKGPromotionCheckpoint(
    params: {
      trigger: TKGPromotionTrigger;
      execution: RuntimeExecution;
      executionId: string;
      workflowName: string;
      tkgProjectionConfig: NonNullable<OboraConfig["tkgProjection"]> | undefined;
      sharedMemoryStore: SharedMemoryStore | undefined;
      sharedMemoryScopes: MemoryScope[];
      stagingTKGStore: StagingTKGStore | undefined;
      tkgProjectionScopes: MemoryScope[];
      tkgPromotionApplyScopes: MemoryScope[];
      tkgRollbackStore: TKGRollbackStore | undefined;
      tkgReviewQueueStore: TKGReviewQueueStore | undefined;
      pendingEvent?: AuditEvent & { type: ProjectableTKGEventType };
    },
  ): Promise<void> {
    const {
      trigger,
      execution,
      executionId,
      workflowName,
      tkgProjectionConfig,
      sharedMemoryStore,
      sharedMemoryScopes,
      stagingTKGStore,
      tkgProjectionScopes,
      tkgPromotionApplyScopes,
      tkgRollbackStore,
      tkgReviewQueueStore,
      pendingEvent,
    } = params;

    if (!stagingTKGStore || tkgProjectionScopes.length === 0) {
      return;
    }

    const evaluationScope = tkgProjectionScopes.at(-1)!;
    const loadedStagingSnapshot = await stagingTKGStore.load(evaluationScope);
    let stagingSnapshot = loadedStagingSnapshot;

    if (pendingEvent) {
      const pendingNode = projectAuditEventToTemporalNode(pendingEvent, workflowName);
      stagingSnapshot = {
        nodes: [
          ...(loadedStagingSnapshot?.nodes ?? []).filter((node) => node.id !== pendingNode.id),
          pendingNode,
        ],
      };
    }

    if (!stagingSnapshot) {
      return;
    }

    const evaluationMode = tkgProjectionConfig?.promotion?.evaluationMode
      ?? (trigger === "execution_end" ? "full_history" : "latest_effective");

    const promotionEvaluation = evaluateTKGPromotion(stagingSnapshot, {
      minConfidence: tkgProjectionConfig?.promotion?.minConfidence,
      confidenceSpreadThreshold: tkgProjectionConfig?.promotion?.confidenceSpreadThreshold,
      executionId,
      evaluationMode,
    });
    const promotionSummary = summarizeTKGPromotionEvaluation(promotionEvaluation);

    if (process.env.OBORA_DEBUG === "1") {
      await this.deps.eventBus.emit("tkg.checkpoint", executionId, {
        trigger,
        evaluationMode,
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        candidateCount: promotionSummary.candidateCount,
        promotableCount: promotionSummary.promotableCount,
        reviewQueueCount: promotionSummary.reviewQueueCount,
        candidateNodeIds: promotionEvaluation.candidates.map((candidate) => candidate.nodeId),
      });
    }

    execution.outputs.__tkg_promotion__ = {
      trigger,
      scope: `${evaluationScope.level}:${evaluationScope.key}`,
      minConfidence: tkgProjectionConfig?.promotion?.minConfidence ?? 0.8,
      allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes ?? [
        "workflow.validation_passed",
        "workflow.repair_completed",
      ],
      ...promotionSummary,
    };

    const promotionApplyScopes = tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes;
    if (sharedMemoryStore && promotionApplyScopes.length > 0 && tkgProjectionConfig?.promotion?.enabled !== false) {
      const promotionSnapshot = buildSharedMemorySnapshotFromTKGPromotion(
        stagingSnapshot,
        promotionEvaluation,
        executionId,
        {
          allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes,
        },
      );

      if (promotionSnapshot.knowledge.facts.length > 0) {
        const rollbackEntries: TKGRollbackEntry[] = [];

        for (const scope of promotionApplyScopes) {
          if (tkgRollbackStore) {
            const existingSnapshot = await sharedMemoryStore.load(scope);
            if (existingSnapshot) {
              const rollbackEntry: TKGRollbackEntry = {
                id: this.buildDeterministicTKGId([
                  "rollback",
                  executionId,
                  scope.level,
                  scope.key,
                  promotionSnapshot.knowledge.facts.map((fact) => fact.id).sort(),
                ]),
                createdAt: new Date().toISOString(),
                executionId,
                workflowName,
                scope: `${scope.level}:${scope.key}`,
                reason: "pre-tkg-promotion-apply",
                snapshot: existingSnapshot,
              };

              if (typeof tkgRollbackStore.append === "function") {
                await tkgRollbackStore.append(scope, rollbackEntry);
              } else {
                const existing = await tkgRollbackStore.load(scope);
                await tkgRollbackStore.save(scope, {
                  entries: [...(existing?.entries ?? []), rollbackEntry],
                });
              }
              rollbackEntries.push(rollbackEntry);
            }
          }

          if (typeof sharedMemoryStore.merge === "function") {
            await sharedMemoryStore.merge(scope, promotionSnapshot);
          } else {
            await sharedMemoryStore.save(scope, promotionSnapshot);
          }
        }

        const applySummary = summarizeTKGPromotionApply(promotionSnapshot);
        execution.outputs.__tkg_promotion_apply__ = {
          trigger,
          scopes: promotionApplyScopes.map((scope) => `${scope.level}:${scope.key}`),
          ...applySummary,
        };

        if (process.env.OBORA_DEBUG === "1") {
          await this.deps.eventBus.emit("tkg.apply", executionId, {
            trigger,
            scopes: promotionApplyScopes.map((scope) => `${scope.level}:${scope.key}`),
            appliedFactCount: applySummary.appliedFactCount,
            appliedNodeIds: applySummary.appliedNodeIds,
          });
        }

        if (rollbackEntries.length > 0) {
          const rollbackSummary = summarizeTKGRollbackEntries(rollbackEntries);
          execution.outputs.__tkg_promotion_rollback__ = {
            trigger,
            ...rollbackSummary,
          };

          if (process.env.OBORA_DEBUG === "1") {
            await this.deps.eventBus.emit("tkg.rollback", executionId, {
              trigger,
              ...rollbackSummary,
            });
          }
        }
      }
    }

    if (tkgReviewQueueStore && promotionEvaluation.reviewQueue.length > 0) {
      const reviewItem = {
        id: this.buildDeterministicTKGId([
          "review-queue",
          executionId,
          evaluationScope.level,
          evaluationScope.key,
          promotionEvaluation.reviewQueue,
        ]),
        createdAt: new Date().toISOString(),
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        workflowName,
        status: "open" as const,
        candidateNodeIds: promotionEvaluation.candidates
          .filter((candidate) => candidate.requiresReview)
          .map((candidate) => candidate.nodeId),
        conflicts: promotionEvaluation.reviewQueue,
        summary: promotionSummary,
      };

      if (typeof tkgReviewQueueStore.enqueue === "function") {
        await tkgReviewQueueStore.enqueue(evaluationScope, reviewItem);
      } else {
        const existing = await tkgReviewQueueStore.load(evaluationScope);
        await tkgReviewQueueStore.save(evaluationScope, {
          items: [...(existing?.items ?? []), reviewItem],
        });
      }

      execution.outputs.__tkg_review_queue__ = {
        trigger,
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        queuedItems: promotionEvaluation.reviewQueue.length,
      };

      if (process.env.OBORA_DEBUG === "1") {
        await this.deps.eventBus.emit("tkg.review_queue", executionId, {
          trigger,
          scope: `${evaluationScope.level}:${evaluationScope.key}`,
          queuedItems: promotionEvaluation.reviewQueue.length,
        });
      }
    }
  }

  private resolveTKGRollbackStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): TKGRollbackStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled || !tkgProjectionConfig.rollback?.enabled) return undefined;

    if (tkgProjectionConfig.rollback.adapter === "custom") {
      return tkgProjectionConfig.rollback.custom?.instance;
    }

    const basePath = tkgProjectionConfig.rollback.file?.basePath ?? join(process.cwd(), ".obora", "tkg-rollback");
    return new FileTKGRollbackStore(basePath);
  }

  private resolveTKGReviewQueueStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined,
  ): TKGReviewQueueStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, runtimeConfig, loadedConfig);
    if (!tkgProjectionConfig?.enabled || !tkgProjectionConfig.reviewQueue?.enabled) return undefined;

    if (tkgProjectionConfig.reviewQueue.adapter === "custom") {
      return tkgProjectionConfig.reviewQueue.custom?.instance;
    }

    const basePath = tkgProjectionConfig.reviewQueue.file?.basePath ?? join(process.cwd(), ".obora", "tkg-review-queue");
    return new FileTKGReviewQueueStore(basePath);
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
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver,
  ): Promise<void> {
    const { eventBus, config } = this.deps;

    const stepIndexByName = new Map(sortedSteps.map((step, idx) => [step.name, idx]));
    const backEdgeIterations = new Map<string, number>();
    const repairLoopStates = new Map<string, RepairLoopRuntimeState>();
    /** Reflector v2 force_target overrides, keyed by validation/failing step name. */
    const forcedRouteTargets = new Map<string, string>();
    /** Global repair attempt counter — not reset by back-edges */
    let globalRepairAttempts = 0;
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
        // Inject reflector hint from blackboard failure history
        if (reflector && blackboard) {
          const failures = blackboard.getFailureHistory();
          config?.logger?.info?.(`[reflector] analyzing ${failures.length} failures for step ${step.name}`);
          const hint = reflector.analyzeFailures(failures, step.name);
          config?.logger?.info?.(`[reflector] hint result: ${hint ? hint.slice(0, 120) + '...' : '(none)'}`);
          if (hint) {
            repairContext.reflectorHint = hint;
            config?.logger?.info?.(`[reflector] ${step.name} attempt ${repairContext.attempt}: ${hint}`);
          }
          // Execute Reflector v2 actions (force_target, abort, switch_model)
          if (reflector instanceof ReflectorEngine) {
            const lastOutput = reflector.getLastOutput();
            if (lastOutput) {
              for (const ar of lastOutput.actions) {
                const pending = (ar.metadata as Record<string, unknown>)?.pendingAction as
                  | { type: string; payload: Record<string, unknown> }
                  | undefined;
                if (!pending) continue;
                if (pending.type === "abort") {
                  const reason = String(pending.payload?.reason ?? "Reflector abort action triggered");
                  config?.logger?.warn?.(`[reflector] ABORT: ${reason}`);
                  throw new OboraError(reason, OboraErrorCode.EXECUTION_FAILED);
                }
                if (pending.type === "force_target") {
                  const target = String(pending.payload?.target ?? "");
                  if (target && stepIndexByName.has(target)) {
                    config?.logger?.info?.(`[reflector] force_target → ${target}`);
                    repairContext.forceTarget = target;
                    const validationStepName = repairContext.validationStep;
                    if (validationStepName) {
                      forcedRouteTargets.set(validationStepName, target);
                      config?.logger?.info?.(
                        `[reflector] queued force_target for validation step ${validationStepName} → ${target}`
                      );
                    }
                  }
                }
              }
            }
          }
        }
        this.recordRepairStarted(executionId, step.name, repairContext.attempt);
        await eventBus.emit("workflow.repair_started", executionId, {
          stepName: step.name,
          attempt: repairContext.attempt,
          latestValidation: repairContext.latestValidation,
          reflectorHint: repairContext.reflectorHint,
          ...(blackboard || observer
            ? {
                debugState: {
                  ...(blackboard
                    ? {
                        blackboard: this.summarizeBlackboardSnapshot(
                          blackboard.getSnapshot(),
                        ),
                      }
                    : {}),
                  ...(observer
                    ? {
                        observer: this.summarizeObserverMetrics(
                          observer.getMetrics(executionId),
                        ),
                      }
                    : {}),
                },
              }
            : {}),
        });
      }

      const stepStartedAt = Date.now();
      if (blackboard) {
        blackboard.recordStepStart(step.name);
      }
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
        if (blackboard) {
          const repairState = repairLoopStates.get(step.name);
          blackboard.recordValidation(step.name, validationResult, repairState?.attempt ?? 1);
        }

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
            ...(blackboard || observer
              ? {
                  debugState: {
                    ...(blackboard
                      ? {
                          blackboard: this.summarizeBlackboardSnapshot(
                            blackboard.getSnapshot(),
                          ),
                        }
                      : {}),
                    ...(observer
                      ? {
                          observer: this.summarizeObserverMetrics(
                            observer.getMetrics(executionId),
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          });

          const goto = step.on_fail?.goto;
          if (goto) {
            globalRepairAttempts++;

            // Check global repair ceiling (prevents infinite loops across back-edges)
            // Reflector v2: forceTarget overrides route resolution
            const queuedForceTarget = forcedRouteTargets.get(step.name);
            const repairState = repairLoopStates.get(step.name);
            const forceTarget = queuedForceTarget ?? (
              repairState
                ? undefined
                : (repairContext as RepairContext | undefined)?.forceTarget
            );
            const baseResolution = resolveFailureRoute(goto, validationResult);
            const routeResolution: RouteResolution = forceTarget && stepIndexByName.has(forceTarget)
              ? { target: forceTarget, matchReason: "default" as const }
              : baseResolution;
            if (queuedForceTarget) {
              forcedRouteTargets.delete(step.name);
            }
            const targetStepName = routeResolution.target;
            const repairConfigForCeiling = getRepairLoopConfig(
              sortedSteps.find((candidate) => candidate.name === targetStepName)?.config
            );
            const globalCeiling = repairConfigForCeiling?.max_total_repair_attempts;
            if (globalCeiling !== undefined && globalRepairAttempts > globalCeiling) {
              cursor = await triggerBackEdge(
                step,
                `Global repair ceiling exceeded (${globalRepairAttempts} total attempts across all back-edges). Stopping repair for step '${step.name}'.`,
                { noProgress: true, category: "no_progress", targetResolution: routeResolution }
              );
              continue;
            }

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

      // Record step output on blackboard
      if (blackboard) {
        blackboard.recordStepOutput(step.name, result.output);
        blackboard.recordStepEnd(step.name);
      }

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

  // ── Single-step execution (shared by sequential and parallel paths) ──────

  /**
   * Execute a single step with hooks, blackboard recording, persistence, and events.
   * Does NOT handle back-edges or repair loops — those are the caller's responsibility.
   * Throws on step failure.
   */
  private async executeSingleStep(
    step: WorkflowStep,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    blackboard?: BlackboardManager,
  ): Promise<{ output: unknown; raw?: unknown }> {
    const { eventBus, config } = this.deps;

    if (costTracker) {
      await costTracker.preStepGate(step.name);
    }

    const stepStartedAt = Date.now();
    if (blackboard) {
      blackboard.recordStepStart(step.name);
    }
    await eventBus.emit("step_start", executionId, {
      stepName: step.name,
      agent: step.agent,
    });

    const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

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
        { signal },
      );
      if (preValidationHook) {
        hookOutputs.pre_validation = preValidationHook;
      }
    }

    // Handle explicit parallel branches within a single step
    let result: { output: unknown; raw?: unknown };
    if (step.parallel && step.parallel.length > 0) {
      result = await this.executeParallelBranches(
        step,
        execution,
        stepExecutor,
        signal,
      );
    } else {
      result = stepExecutor
        ? await stepExecutor.executeStep(step, {
            previousOutputs: execution.outputs,
            signal,
            ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
          })
        : {
            output: "[stub] No LLM configured",
            raw: { stub: true, reason: "No LLM configured" },
          };
    }

    const postStepHook = await this.runStepHook(workflow, step, "post_step", executionId, {
      signal,
      continueOnError: true,
    });
    if (postStepHook) {
      hookOutputs.post_step = postStepHook;
    }

    // Record output
    execution.outputs[step.name] = result.output;
    execution.stepRecords[step.name] =
      Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
    execution.completedSteps.push(step.name);

    if (blackboard) {
      blackboard.recordStepOutput(step.name, result.output);
      blackboard.recordStepEnd(step.name);
    }

    // Persist
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

    await eventBus.emit("step_end", executionId, {
      stepName: step.name,
      status: "completed",
      durationMs: Date.now() - stepStartedAt,
      outputPreview:
        typeof result.output === "string"
          ? result.output.slice(0, 200)
          : JSON.stringify(result.output).slice(0, 200),
    });

    return result;
  }

  // ── Parallel branch execution (fan-out-fan-in within a single step) ────

  /**
   * Executes explicit parallel branches defined on a step, then merges results.
   */
  private async executeParallelBranches(
    step: WorkflowStep,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    signal?: AbortSignal,
  ): Promise<{ output: unknown; raw?: unknown }> {
    const branches = step.parallel!;
    const mergeStrategy: MergeStrategy = step.merge ?? "concat";
    const scheduler = new ParallelScheduler();

    const settled = await Promise.allSettled(
      branches.map(async (branch) => {
        const branchStep: WorkflowStep = {
          ...step,
          agent: branch.agent,
          input: branch.input ?? step.input,
          parallel: undefined,
          merge: undefined,
        };

        if (!stepExecutor) {
          return { output: "[stub] No LLM configured", raw: { stub: true } } as StepResult;
        }

        return stepExecutor.executeStep(branchStep, {
          previousOutputs: execution.outputs,
          signal,
        });
      }),
    );

    const successResults = settled
      .filter(
        (r): r is PromiseFulfilledResult<StepResult> => r.status === "fulfilled",
      )
      .map((r) => r.value);

    if (successResults.length === 0) {
      const errors = settled
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      throw new Error(
        `All parallel branches failed for step '${step.name}': ${errors.join("; ")}`,
      );
    }

    const merged = scheduler.mergeResults(successResults, mergeStrategy);
    return { output: merged, raw: { branches: settled } };
  }

  // ── Parallel step-execution loop ───────────────────────────────────────

  /**
   * Executes steps layer by layer, running independent steps in parallel.
   *
   * For single-step layers, delegates to the existing sequential `executeStepLoop`
   * to preserve full back-edge and repair-loop support.
   *
   * For multi-step layers, runs all steps concurrently with `Promise.allSettled`.
   */
  async executeParallelStepLoop(
    layers: WorkflowStep[][],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver,
    maxConcurrency: number = DEFAULT_MAX_CONCURRENCY,
  ): Promise<void> {
    const { eventBus } = this.deps;
    const scheduler = new ParallelScheduler(maxConcurrency);

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx]!;

      if (isSettledFn?.() || signal?.aborted) return;

      // Single-step layer → delegate to the full sequential loop
      // (preserves back-edge, repair-loop, and validation handling)
      if (layer.length === 1) {
        await this.executeStepLoop(
          layer,
          workflow,
          execution,
          stepExecutor,
          costTracker,
          executionId,
          persistenceEnabled,
          persistenceAdapter,
          signal,
          isSettledFn,
          blackboard,
          reflector,
          observer,
        );
        continue;
      }

      // Multi-step layer → parallel execution
      await eventBus.emit("parallel_layer_start", executionId, {
        layerIndex: layerIdx,
        stepNames: layer.map((s) => s.name),
        concurrency: Math.min(layer.length, scheduler.maxConcurrency),
      });

      const layerStartedAt = Date.now();
      const outcomes = await scheduler.executeParallelSteps(
        layer,
        async (step) => {
          const result = await this.executeSingleStep(
            step,
            workflow,
            execution,
            stepExecutor,
            costTracker,
            executionId,
            persistenceEnabled,
            persistenceAdapter,
            signal,
            blackboard,
          );
          return result as StepResult;
        },
      );

      const completed: string[] = [];
      const failed: string[] = [];
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          completed.push(outcome.stepName);
        } else {
          failed.push(outcome.stepName);
          await eventBus.emit("warning", executionId, {
            message: `Step '${outcome.stepName}' failed in parallel layer: ${
              outcome.error instanceof Error
                ? outcome.error.message
                : String(outcome.error)
            }`,
          });
        }
      }

      // Record parallel execution metrics on blackboard
      if (blackboard) {
        blackboard.recordStepOutput(`__parallel_layer_${layerIdx}`, {
          completed,
          failed,
          concurrency: Math.min(layer.length, scheduler.maxConcurrency),
          durationMs: Date.now() - layerStartedAt,
        });
      }

      await eventBus.emit("parallel_layer_end", executionId, {
        layerIndex: layerIdx,
        stepNames: layer.map((s) => s.name),
        completed,
        failed,
        durationMs: Date.now() - layerStartedAt,
      });

      if (isSettledFn?.()) return;
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
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, config, loadedConfig);
    const sharedMemoryStore = this.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const stagingTKGStore = this.resolveStagingTKGStore(workflow, config, loadedConfig);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.resolveTKGPromotionApplyScopes(workflow, config, loadedConfig);
    const tkgPromotionTriggers = this.resolveTKGPromotionTriggers(workflow, config, loadedConfig);
    const tkgRollbackStore = this.resolveTKGRollbackStore(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);

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

    // Create blackboard, observer, and reflector for this execution
    const blackboard = new BlackboardManager({ sessionId: executionId });
    const observer = new ExecutionObserver(eventBus, blackboard);

    const sharedMemoryImport = await this.importSharedMemory(
      sharedMemoryStore,
      sharedMemoryScopes,
      blackboard,
      execution,
    );
    if (sharedMemoryImport.importedScopes.length > 0) {
      await eventBus.emit("knowledge_context_attached", executionId, {
        workflowName,
        itemCount: sharedMemoryImport.mergedSnapshot?.knowledge.facts.length ?? 0,
        sources: sharedMemoryImport.importedScopes,
        sourceType: "shared-memory",
      });
    }
    // Use ReflectorEngine v2 — wire YAML reflector config if present
    const reflectorConfig = workflow.reflector;
    const reflectorRules: ReflectorRule[] = (reflectorConfig?.rules ?? []).map((r) => ({
      name: r.name,
      when: r.when,
      actions: r.actions.map((a, i) => ({
        type: a.type,
        priority: i,
        payload: Object.fromEntries(Object.entries(a).filter(([k]) => k !== "type")),
      })),
    }));
    const knowledgeStore = reflectorConfig?.knowledge_store
      ? new KnowledgeStore(reflectorConfig.knowledge_store)
      : undefined;
    const reflector = new ReflectorEngine({
      rules: reflectorRules.length > 0 ? reflectorRules : undefined,
      knowledgeStore,
    });

    if (engine.costTracker) {
      observer.attachCostTracker(engine.costTracker);
    }
    observer.observe(executionId);
    const tkgProjector = stagingTKGStore && tkgProjectionScopes.length > 0
      ? new TKGProjector(eventBus, stagingTKGStore, {
          workflowName,
          scopes: tkgProjectionScopes,
        })
      : undefined;
    tkgProjector?.observe(executionId);
    const tkgPromotionTriggerUnsubscribes = tkgPromotionTriggers
      .filter((trigger) => trigger !== "execution_end")
      .map((trigger) =>
        eventBus.on(trigger, async (event) => {
          if (event.executionId !== executionId) return;
          try {
            await this.flushTKGPromotionCheckpoint({
              trigger,
              execution,
              executionId,
              workflowName,
              tkgProjectionConfig,
              sharedMemoryStore,
              sharedMemoryScopes,
              stagingTKGStore,
              tkgProjectionScopes,
              tkgPromotionApplyScopes,
              tkgRollbackStore,
              tkgReviewQueueStore,
              pendingEvent: event as AuditEvent & { type: ProjectableTKGEventType },
            });
          } catch (error) {
            await eventBus.emit("warning", executionId, {
              message: `TKG trigger checkpoint failed for ${trigger}`,
              severity: "warning",
              detail: String(error),
            });
          }
        }),
      );

    try {
      // Build execution plan and choose sequential or parallel path
      const scheduler = new ParallelScheduler(workflow.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
      const plan = scheduler.buildExecutionPlan(sortedSteps);

      if (plan.isParallel) {
        await this.executeParallelStepLoop(
          plan.layers,
          workflow,
          execution,
          engine.stepExecutor,
          engine.costTracker,
          executionId,
          persistenceEnabled,
          persistenceAdapter,
          signal,
          isSettledFn,
          blackboard,
          reflector,
          observer,
          scheduler.maxConcurrency,
        );
      } else {
        // Sequential path — preserves full back-edge and repair-loop support
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
          isSettledFn,
          blackboard,
          reflector,
          observer,
        );
      }

      if (isSettledFn()) return;

      // Finalize observer metrics and generate execution report
      observer.finalize(executionId, "success");
      const report = observer.generateReport(executionId, {
        workflowName,
        failurePatterns: this.extractFailurePatterns(blackboard, reflector),
      });
      await this.persistSharedMemory(sharedMemoryStore, sharedMemoryScopes, blackboard, executionId);
      if (tkgProjector) {
        execution.outputs.__tkg_projection__ = tkgProjector.getSummary();
      }
      if (tkgPromotionTriggers.includes("execution_end")) {
        try {
          await this.flushTKGPromotionCheckpoint({
            trigger: "execution_end",
            execution,
            executionId,
            workflowName,
            tkgProjectionConfig,
            sharedMemoryStore,
            sharedMemoryScopes,
            stagingTKGStore,
            tkgProjectionScopes,
            tkgPromotionApplyScopes,
            tkgRollbackStore,
            tkgReviewQueueStore,
          });
        } catch (error) {
          await eventBus.emit("warning", executionId, {
            message: "TKG execution_end checkpoint failed",
            severity: "warning",
            detail: String(error),
          });
        }
      }
      const blackboardSnapshot = blackboard.getSnapshot();

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
        ...(report ? { report } : {}),
        debugState: {
          blackboard: this.summarizeBlackboardSnapshot(blackboardSnapshot),
          observerReport: report,
        },
      });
    } finally {
      for (const unsubscribe of tkgPromotionTriggerUnsubscribes) {
        unsubscribe();
      }
      tkgProjector?.dispose();
      observer.dispose();
    }
  }

  async listOpenTKGReviewQueueItems(
    workflow: WorkflowDef,
  ): Promise<TKGReviewQueueItem[]> {
    const { config } = this.deps;
    const loadedConfig = config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);
    const queueScope = tkgProjectionScopes.at(-1);

    if (!tkgReviewQueueStore || !queueScope) {
      return [];
    }

    return listOpenTKGReviewQueueItemsFromStore(tkgReviewQueueStore, queueScope);
  }

  async resolveTKGReviewQueueItem(
    workflow: WorkflowDef,
    itemId: string,
    resolution: { status: "approved" | "rejected"; actor?: string; note?: string },
  ): Promise<TKGReviewQueueResolutionSummary> {
    const { config } = this.deps;
    const loadedConfig = config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);
    const queueScope = tkgProjectionScopes.at(-1);

    if (!tkgReviewQueueStore || !queueScope) {
      return {
        resolved: false,
        scope: queueScope ? `${queueScope.level}:${queueScope.key}` : "unresolved",
        itemId,
      };
    }

    return resolveTKGReviewQueueItemInStore(tkgReviewQueueStore, queueScope, itemId, {
      status: resolution.status,
      resolvedAt: new Date().toISOString(),
      actor: resolution.actor,
      note: resolution.note,
    });
  }

  async restoreLatestTKGRollback(
    workflow: WorkflowDef,
    options: { rollbackId?: string } = {},
  ): Promise<TKGRollbackRestoreSummary> {
    const { config } = this.deps;
    const loadedConfig = config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const sharedMemoryStore = this.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.resolveTKGPromotionApplyScopes(workflow, config, loadedConfig);
    const tkgRollbackStore = this.resolveTKGRollbackStore(workflow, config, loadedConfig);

    const targetScope = (tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes).at(-1);
    if (!sharedMemoryStore || !tkgRollbackStore || !targetScope) {
      return {
        restored: false,
        scope: targetScope ? `${targetScope.level}:${targetScope.key}` : "unresolved",
        restoredFactCount: 0,
      };
    }

    return restoreTKGRollbackFromStore(
      tkgRollbackStore,
      sharedMemoryStore,
      targetScope,
      options.rollbackId,
    );
  }

  async reapplyApprovedTKGReviewQueueItems(
    workflow: WorkflowDef,
    options: { sourceExecutionId?: string } = {},
  ): Promise<TKGApprovedReviewQueueApplySummary> {
    const { config } = this.deps;
    const loadedConfig = config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, config, loadedConfig);
    const sharedMemoryStore = this.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const stagingTKGStore = this.resolveStagingTKGStore(workflow, config, loadedConfig);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.resolveTKGPromotionApplyScopes(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);

    const applyScopes = tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes;
    const queueScope = tkgProjectionScopes.at(-1);

    if (!sharedMemoryStore || !stagingTKGStore || !tkgReviewQueueStore || !queueScope || applyScopes.length === 0) {
      return {
        appliedFactCount: 0,
        appliedNodeIds: [],
        approvedItemCount: 0,
        approvedItemIds: [],
        scopes: applyScopes.map((scope) => `${scope.level}:${scope.key}`),
      };
    }

    return reapplyApprovedTKGReviewQueueItems({
      sharedMemoryStore,
      stagingStore: stagingTKGStore,
      reviewQueueStore: tkgReviewQueueStore,
      queueScope,
      applyScopes,
      sourceExecutionId: options.sourceExecutionId,
      allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes,
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

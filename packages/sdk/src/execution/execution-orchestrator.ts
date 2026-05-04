import { randomUUID } from "node:crypto";

import { loadConfig } from "../config-loader.js";
import type { OboraConfig } from "../config-loader.js";
import { topologicalSort } from "../dependency-resolver.js";
import { ParallelScheduler } from "./parallel-scheduler.js";
import type { StorageAdapter, PolicyHashInput } from "@obora/runtime";
import { OboraError, OboraErrorCode } from "../runtime-types.js";
import type { RunOptions, RuntimeExecution, AuditEvent, TKGPromotionTrigger } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import { BlackboardManager } from "../blackboard/blackboard-manager.js";
import { ExecutionObserver } from "../blackboard/execution-observer.js";
import { ReflectorEngine } from "../reflector/reflector-engine.js";
import { KnowledgeStore } from "../reflector/knowledge-store.js";
import type { ReflectorRule } from "../reflector/rule-engine.js";
import { TKGProjector } from "../tkg/projector.js";
import { queryKnowledge } from "../knowledge/queryKnowledge.js";
import {
  mergeSharedMemorySnapshots,
  type MemoryScope,
  type SharedMemorySnapshot,
  type SharedMemoryStore,
} from "../shared-memory/store.js";
import { BudgetExceededError } from "../cost-tracker.js";
import { DEFAULTS } from "../defaults.js";
import type {
  ProjectableTKGEventType,
  StagingTKGStore,
} from "../tkg/store.js";
import type { WorkflowRunnerDeps } from "./workflow-runner.js";
import { TKGService } from "./tkg-service.js";
import { TKGPromotionEngine } from "./tkg-promotion-engine.js";
import { EngineBuilder } from "./engine-builder.js";
import { StepExecutionEngine } from "./step-execution-engine.js";
import { RepairLoopTracker } from "./repair-loop-tracker.js";
import type { ExecutionEngine } from "./engine-builder.js";
import {
  getValidationStepConfig,
  type ValidationResult,
} from "../validation-repair.js";
import {
  type HookExecutionResult,
  type WorkflowHookLifecycle,
} from "../hooks.js";

const DEFAULT_MAX_CONCURRENCY = 3;

export interface ExecutionOrchestratorDeps {
  deps: WorkflowRunnerDeps;
  tkgService: TKGService;
  tkgPromotionEngine: TKGPromotionEngine;
  stepExecutionEngine: StepExecutionEngine;
  engineBuilder: EngineBuilder;
  repairLoopTracker: RepairLoopTracker;
}

export class ExecutionOrchestrator {
  constructor(private readonly deps: ExecutionOrchestratorDeps) {}

  // ── Knowledge context injection ──────────────────────────────────────────

  async injectKnowledgeContext(
    executionId: string,
    workflowName: string,
    execution: RuntimeExecution,
    knowledgeContext: NonNullable<RunOptions["knowledgeContext"]>,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined
  ): Promise<void> {
    const { eventBus, persistenceManager } = this.deps.deps;

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
          this.deps.deps.config.logger?.warn?.("[knowledge] failed to persist knowledge audit event:", error);
        }
      }
    } catch (error) {
      this.deps.deps.config.logger?.warn?.("[knowledge] failed to attach context:", error);
    }
  }

  private async importSharedMemory(
    store: SharedMemoryStore | undefined,
    scopes: MemoryScope[],
    blackboard: BlackboardManager,
    execution: RuntimeExecution
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
      blackboard.importPersistentSnapshot(
        mergedSnapshot,
        scopes.at(-1) ?? { level: "workflow", key: "merged" },
        {
          factSources: Object.fromEntries(factSources.entries()),
          storeSnapshot: false,
        }
      );

      execution.outputs.__shared_memory__ = {
        importedScopes,
        knowledge: mergedSnapshot.knowledge,
        decisions: mergedSnapshot.decisions,
        context: mergedSnapshot.context,
        provenance: {
          knowledge: Object.fromEntries(
            [...factSources.entries()].map(([factId, scope]) => [
              factId,
              `${scope.level}:${scope.key}`,
            ])
          ),
        },
      };
    }

    return { importedScopes, mergedSnapshot };
  }

  // ── Run execution ────────────────────────────────────────────────────────

  async executeRun(
    executionId: string,
    workflowName: string,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    options: RunOptions,
    isSettledFn: () => boolean
  ): Promise<void> {
    const { input, variables, signal, knowledgeContext } = options;
    const { eventBus, persistenceManager, config } = this.deps.deps;

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
    const tkgProjectionConfig = this.deps.tkgService.resolveTKGProjectionConfig(workflow, config, loadedConfig);
    const sharedMemoryStore = await this.deps.tkgService.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.deps.tkgService.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const stagingTKGStore = this.deps.tkgService.resolveStagingTKGStore(workflow, config, loadedConfig);
    const tkgProjectionScopes = this.deps.tkgService.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.deps.tkgService.resolveTKGPromotionApplyScopes(
      workflow,
      config,
      loadedConfig
    );
    const tkgPromotionTriggers = this.deps.tkgService.resolveTKGPromotionTriggers(workflow, config, loadedConfig);
    const tkgRollbackStore = this.deps.tkgService.resolveTKGRollbackStore(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.deps.tkgService.resolveTKGReviewQueueStore(workflow, config, loadedConfig);

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
        config.logger?.warn?.("[persistence] Failed to save run at start:", err);
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
    const engine = await this.deps.engineBuilder.build(
      executionId,
      persistenceEnabled,
      persistenceConfig,
      workflow
    );

    // Create blackboard, observer, and reflector for this execution
    const blackboard = new BlackboardManager({ sessionId: executionId });
    const observer = new ExecutionObserver(eventBus, blackboard);

    const sharedMemoryImport = await this.importSharedMemory(
      sharedMemoryStore,
      sharedMemoryScopes,
      blackboard,
      execution
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
    const tkgProjector =
      stagingTKGStore && tkgProjectionScopes.length > 0
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
            await this.deps.tkgPromotionEngine.flushTKGPromotionCheckpoint({
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
        })
      );

    try {
      // Build execution plan and choose sequential or parallel path
      const scheduler = new ParallelScheduler(workflow.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY);
      const plan = scheduler.buildExecutionPlan(sortedSteps);

      if (plan.isParallel) {
        await this.deps.stepExecutionEngine.executeParallelStepLoop(
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
          scheduler.maxConcurrency
        );
      } else {
        // Sequential path — preserves full back-edge and repair-loop support
        await this.deps.stepExecutionEngine.executeStepLoop(
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
          observer
        );
      }

      if (isSettledFn()) return;

      // Finalize observer metrics and generate execution report
      observer.finalize(executionId, "success");
      const report = observer.generateReport(executionId, {
        workflowName,
        failurePatterns: this.deps.stepExecutionEngine.extractFailurePatterns(blackboard, reflector),
      });
      const sharedMemorySnapshot = blackboard.exportPersistentSnapshot(executionId);
      await this.deps.tkgPromotionEngine.persistSharedMemory(
        sharedMemoryStore,
        sharedMemoryScopes,
        sharedMemorySnapshot,
        executionId
      );
      if (tkgProjector) {
        execution.outputs.__tkg_projection__ = tkgProjector.getSummary();
      }
      if (tkgPromotionTriggers.includes("execution_end")) {
        try {
          await this.deps.tkgPromotionEngine.flushTKGPromotionCheckpoint({
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
              ...(this.deps.repairLoopTracker.getSummary(executionId)
                ? { repairLoop: this.deps.repairLoopTracker.getSummary(executionId) }
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
          config.logger?.warn?.("[persistence] Failed to save run on completion:", err);
        }
      }

      this.deps.repairLoopTracker.clearSummary(executionId);

      await eventBus.emit("execution_end", executionId, {
        workflowName,
        status: "completed",
        ...(report ? { report } : {}),
        debugState: {
          blackboard: this.deps.stepExecutionEngine.summarizeBlackboardSnapshot(blackboardSnapshot),
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

  // ── Resume execution ─────────────────────────────────────────────────────

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
    const { eventBus, config } = this.deps.deps;
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

    const engine = await this.deps.engineBuilder.build(
      executionId,
      persistenceEnabled,
      persistenceConfig,
      workflow
    );

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
        const preStepHook = await this.deps.stepExecutionEngine.runStepHook(workflow, step, "pre_step", executionId);
        if (preStepHook) {
          hookOutputs.pre_step = preStepHook;
        }

        if (getValidationStepConfig(step.config)?.enabled) {
          const preValidationHook = await this.deps.stepExecutionEngine.runStepHook(
            workflow,
            step,
            "pre_validation",
            executionId
          );
          if (preValidationHook) {
            hookOutputs.pre_validation = preValidationHook;
          }
        }

        if (!engine.stepExecutor) {
          throw OboraError.adapterUnavailable(new Error("No LLM adapter configured for resumed step execution"));
        }
        const result = await engine.stepExecutor.executeStep(step, {
          previousOutputs: execution.outputs,
          ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
        });

        const postStepHook = await this.deps.stepExecutionEngine.runStepHook(workflow, step, "post_step", executionId, {
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
      ...(this.deps.repairLoopTracker.getSummary(executionId)
        ? { metadata: { repairLoop: this.deps.repairLoopTracker.getSummary(executionId) } }
        : {}),
    });

    this.deps.repairLoopTracker.clearSummary(executionId);

    return execution;
  }
}

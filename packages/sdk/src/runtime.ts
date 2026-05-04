/**
 * OboraRuntime – thin facade.
 *
 * Orchestration responsibilities have been decomposed into focused modules:
 *   events/event-bus.ts        – audit event publish / subscribe
 *   persistence/persistence-manager.ts – storage adapter + artifact store
 *   execution/adapter-resolver.ts      – per-execution LLM adapter cache
 *   execution/workflow-runner.ts       – run() + resume() shared engine
 *   query/run-query.ts                 – runs / step query facade
 *
 * This file re-exports all public types and wires the sub-modules together.
 */

import { randomUUID } from "node:crypto";

import { Policy, type PolicyDefinition } from "./policy.js";
import { PluginRegistry, type RegisterOptions } from "./plugin-registry.js";
import type { LoadedPlugin } from "./plugin-types.js";
import { resolvePluginType } from "./plugin-type-map.js";
import type {
  NonDeterminismWarning,
  ReExecutionDiffReport,
  ReExecutionOptions,
  ReExecutionPlan,
  ReExecutionResult,
  StepReExecutionResult,
} from "./replay.js";
import { Workflow } from "./workflow.js";
import type { WorkflowDef } from "./workflow.js";

import type { LLMConfig } from "./runtime-types.js";
import type { LLMAdapterLike } from "./step-executor.js";
import type { RunFilter } from "@obora/runtime";

// Sub-modules
import { EventBus } from "./events/event-bus.js";
import { PersistenceManager } from "./persistence/persistence-manager.js";
import { WorkflowRunner } from "./execution/workflow-runner.js";
import { ExecutionController } from "./execution/execution-controller.js";
import { RunQuery } from "./query/run-query.js";
import { type DLQStore, FileDLQStore } from "./dlq/index.js";
import { type ExecutionLock, FileExecutionLock } from "./execution/execution-lock.js";

// Re-export error classes from runtime-errors.ts for backward compatibility
export { OboraError, OboraErrorCode } from "./runtime-errors.js";

// Re-export all types from runtime-types so existing imports keep working
export type {
  AuditEventType,
  AuditEvent,
  RuntimeExecution,
  RunStatus,
  RunHandle,
  RunOptions,
  EventHandler,
  Unsubscribe,
  AgentFactory,
  PatternPlugin,
  CustomPatternDefinition,
  PatternRegistration,
  OboraPlugin,
  OboraAuditConfig,
  PersistenceConfig,
  ArtifactsConfig,
  SharedMemoryConfig,
  TKGProjectionConfig,
  OboraRuntimeConfig,
} from "./runtime-types.js";
export type { PluginToolHandler } from "./runtime-types.js";

import {
  OboraError,
  OboraErrorCode,
} from "./runtime-errors.js";

import type {
  AuditEvent,
  AuditEventType,
  AgentFactory,
  CustomPatternDefinition,
  EventHandler,
  OboraRuntimeConfig,
  PatternPlugin,
  PatternRegistration,
  PluginToolHandler,
  RunHandle,
  RunOptions,
  RunStatus,
  RuntimeExecution,
  Unsubscribe,
} from "./runtime-types.js";
import type { TKGApprovedReviewQueueApplySummary } from "./tkg/apply.js";
import type {
  TKGReviewQueueItem,
  TKGReviewQueueResolutionSummary,
} from "./tkg/review-queue.js";
import type { TKGRollbackRestoreSummary } from "./tkg/rollback.js";

export type WorkflowDefinition = WorkflowDef;

// ── OboraRuntime ───────────────────────────────────────────────────────────

export class OboraRuntime {
  // ── Registries ───────────────────────────────────────────────────────────
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly agents = new Map<string, AgentFactory>();
  private readonly tools = new Map<string, PluginToolHandler>();
  private readonly patterns = new Map<string, PatternRegistration>();
  private readonly pluginRegistry = new PluginRegistry();
  private readonly executions = new Map<string, RuntimeExecution>();

  // ── Sub-module instances ──────────────────────────────────────────────────
  private readonly eventBus: EventBus;
  private readonly persistenceManager: PersistenceManager;
  private readonly runner: WorkflowRunner;
  private readonly query: RunQuery;
  private readonly dlqStore?: DLQStore;
  private readonly executionLock?: ExecutionLock;
  private readonly executionController: ExecutionController;

  // ── Policy ───────────────────────────────────────────────────────────────
  private policy?: PolicyDefinition;
  private readonly policyLoadPromise?: Promise<void>;

  constructor(private readonly config: OboraRuntimeConfig = {}) {
    this.eventBus = new EventBus(config.audit);
    this.persistenceManager = new PersistenceManager(config);
    this.query = new RunQuery(this.persistenceManager);
    this.runner = new WorkflowRunner({
      config,
      eventBus: this.eventBus,
      adapterFactory: (cfg) => this.createLLMAdapter(cfg),
      persistenceManager: this.persistenceManager,
      agents: this.agents,
    });

    // P0: DLQ store initialization
    if (config.dlq?.enabled) {
      const dlqPath = config.dlq.filePath ?? ".obora/dlq/dead-letters.json";
      this.dlqStore = new FileDLQStore(dlqPath);
    }

    // P0: Execution lock initialization
    if (config.executionLock?.enabled) {
      const lockPath = config.executionLock.basePath ?? ".obora/locks";
      this.executionLock = new FileExecutionLock(lockPath, config.executionLock.staleLockThresholdMs);
    }

    this.executionController = new ExecutionController({
      config,
      runner: this.runner,
      eventBus: this.eventBus,
      persistenceManager: this.persistenceManager,
      dlqStore: this.dlqStore,
      executionLock: this.executionLock,
      executions: this.executions,
    });

    if (config.policyPath) {
      this.policyLoadPromise = Policy.fromYaml(config.policyPath)
        .then((policy) => {
          this.policy = policy;
        })
        .catch((error: unknown) => {
          const err = error as NodeJS.ErrnoException;
          if (err?.code === "ENOENT") return;

          if (error instanceof OboraError) throw error;

          throw OboraError.policyLoadFailed(error);
        });
    }
  }

  // ── Workflow registration ─────────────────────────────────────────────────

  define(name: string, workflow: WorkflowDef): this {
    Workflow.create(workflow);
    this.workflows.set(name, workflow);
    return this;
  }

  async loadWorkflow(path: string): Promise<this> {
    const workflow = await Workflow.fromYaml(path);
    this.define(workflow.name, workflow);
    return this;
  }

  // ── Agent / Tool / Pattern / Plugin registration ──────────────────────────

  registerAgent(name: string, factory: AgentFactory): this {
    this.agents.set(name, factory);
    return this;
  }

  registerTool(name: string, tool: PluginToolHandler): this {
    this.tools.set(name, tool);
    return this;
  }

  registerPattern(pattern: PatternRegistration): this {
    this.patterns.set(pattern.name, pattern);
    return this;
  }

  registerPlugin(plugin: LoadedPlugin, options?: RegisterOptions): this {
    this.pluginRegistry.register(plugin, options);

    const pluginName = plugin.descriptor.metadata.name;
    const pluginType = plugin.descriptor.metadata.type;

    void this.eventBus.emit("plugin_load", "runtime", { pluginName, pluginType });
    return this;
  }

  getPlugins(typeOrAlias?: string): LoadedPlugin[] {
    if (!typeOrAlias) return this.pluginRegistry.getAll();
    const type = resolvePluginType(typeOrAlias);
    return this.pluginRegistry.getAll(type);
  }

  // ── Event API ─────────────────────────────────────────────────────────────

  on<T extends AuditEventType>(event: T, handler: EventHandler<T>): Unsubscribe {
    return this.eventBus.on(event, handler);
  }

  events(filter?: {
    executionId?: string;
    type?: AuditEventType | AuditEventType[];
  }): AsyncIterableIterator<AuditEvent> {
    return this.eventBus.events(filter);
  }

  onError(handler: (error: OboraError) => void): Unsubscribe {
    return this.on("error", (event) => {
      const data = event.data as {
        message?: string;
        code?: string;
        executionId?: string;
        stepName?: string;
      };
      const err = new OboraError(
        data.message ?? "Unknown error",
        data.code ?? OboraErrorCode.SDK_UNKNOWN_ERROR,
        event.executionId,
        data.stepName,
      );
      handler(err);
    });
  }

  // ── emitEvent (kept here so tests can access via loose casting) ─────────

  /**
   * @internal
   * Delegate to EventBus. Kept as a named private method so existing tests
   * that call `emitEvent(...)` through a loose cast continue to work.
   */
  private async emitEvent(
    type: AuditEventType,
    executionId: string,
    data: unknown,
    metadata?: AuditEvent["metadata"],
  ): Promise<void> {
    return this.eventBus.emit(type, executionId, data, metadata);
  }

  // ── LLM Adapter factory (kept here so tests can spy on it) ───────────────

  /**
   * @internal
   * Creates a new LLM adapter for the given config.
   * Kept as a method on OboraRuntime so test spies work:
   *   vi.spyOn(runtime as unknown as { createLLMAdapter: … }, "createLLMAdapter")
   */
  private async createLLMAdapter(config: LLMConfig): Promise<LLMAdapterLike> {
    try {
      const adaptersModule = "@obora/adapters";
      const adapters = (await import(adaptersModule)) as Record<string, unknown>;
      const PiAIAdapterCtor = adapters.PiAIAdapter as new (cfg: {
        provider: string;
        apiKey: string;
        model?: string;
        baseUrl?: string;
      }) => LLMAdapterLike;

      return new PiAIAdapterCtor({
        provider: config.provider,
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
      });
    } catch (error) {
      throw OboraError.adapterUnavailable(error);
    }
  }

  // ── run() ─────────────────────────────────────────────────────────────────

  async run(name: string, options: RunOptions = {}): Promise<RunHandle> {
    await this.policyLoadPromise;

    if (!this.workflows.has(name)) {
      throw OboraError.workflowNotFound(name);
    }

    const workflow = this.workflows.get(name)!;

    // Update policy reference on the controller in case it loaded after construction
    this.executionController.setPolicy(this.policy);

    return this.executionController.start(name, workflow, options, this.agents, this.workflows);
  }

  // ── resume() ──────────────────────────────────────────────────────────────

  async resume(
    runId: string,
    options: { fromStep?: string; driftPolicy?: "reject" | "warn" | "ignore" } = {},
  ): Promise<{
    execution: { id: string; status: string };
    restoredSteps: string[];
    rerunSteps: string[];
    driftDetected: boolean;
  }> {
    await this.policyLoadPromise;

    // Update policy reference on the controller in case it loaded after construction
    this.executionController.setPolicy(this.policy);

    return this.executionController.resume(runId, options, this.workflows);
  }

  // ── Replay API ────────────────────────────────────────────────────────────

  /**
   * Simulate a replay of a previous execution.
   * This is a dry-run simulation: it does not re-invoke the LLM or re-execute steps.
   * It generates a replay plan and diff report based on the original execution record.
   */
  async simulateReplay(
    executionId: string,
    options?: Partial<ReExecutionOptions>,
  ): Promise<ReExecutionResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw OboraError.replayExecutionNotFound(executionId);
    }

    const reExecutionId = randomUUID();
    const mode = options?.mode ?? "full";
    const dryRun = options?.dryRun ?? true;

    await this.eventBus.emit("reexecution_start", reExecutionId, {
      originalExecutionId: executionId,
      mode,
      dryRun,
    });

    const allSteps = execution.stepOrder ?? [];
    if (
      mode === "from_checkpoint" &&
      options?.startFromStep &&
      !allSteps.includes(options.startFromStep)
    ) {
      throw OboraError.replayStepNotFound(options.startFromStep);
    }

    const checkpointIdx = options?.startFromStep
      ? allSteps.indexOf(options.startFromStep)
      : -1;
    const stepsToSkip = checkpointIdx > 0 ? allSteps.slice(0, checkpointIdx) : [];
    const stepsToRerun =
      checkpointIdx > 0 ? allSteps.slice(checkpointIdx) : [...allSteps];

    const restoredState: Record<string, unknown> = {};
    if (mode === "from_checkpoint" && options?.startFromStep) {
      for (const skippedStep of stepsToSkip) {
        const originalOutput = execution.outputs?.[skippedStep];
        if (originalOutput !== undefined) {
          restoredState[skippedStep] = originalOutput;
        }
      }
    }

    const nonDeterminismWarnings: NonDeterminismWarning[] = [];
    if (options?.detectNonDeterminism) {
      const warning: NonDeterminismWarning = {
        type: "state_external",
        description: "Non-determinism detection is limited in simulation mode",
        severity: "info",
      };
      nonDeterminismWarnings.push(warning);
      for (const stepName of stepsToRerun) {
        const output = execution.outputs?.[stepName];
        if (!(stepName in execution.outputs)) {
          nonDeterminismWarnings.push({
            type: "state_external",
            description: `Potential non-determinism: no original output for step '${stepName}'`,
            stepName,
            severity: "warning",
          });
          continue;
        }

      }
    }

    const plan: ReExecutionPlan = {
      executionId,
      originalWorkflow: execution.workflowName,
      mode,
      startFromStep: options?.startFromStep,
      restoredState: Object.keys(restoredState).length > 0 ? restoredState : undefined,
      stepsToRerun,
      stepsToSkip,
      nonDeterminismWarnings,
      createdAt: new Date(),
    };

    const stepResults: StepReExecutionResult[] = [];
    for (const stepName of stepsToRerun) {
      const result: StepReExecutionResult = {
        stepName,
        status: "completed",
        matchesOriginal: true,
      };

      await this.eventBus.emit("reexecution_step_start", reExecutionId, { stepName });

      if (options?.onStepComplete) {
        await options.onStepComplete(stepName, result);
      }

      await this.eventBus.emit("reexecution_step_end", reExecutionId, {
        stepName,
        status: "completed",
      });
      stepResults.push(result);
    }

    const diffReport: ReExecutionDiffReport = {
      executionId,
      reExecutionId,
      plan,
      differences: stepResults.map((stepResult) => ({
        stepName: stepResult.stepName,
        status: stepResult.matchesOriginal ? "unchanged" : "changed",
      })),
      summary: {
        total_steps: stepResults.length,
        changed: 0,
        unchanged: stepResults.length,
        skipped: stepsToSkip.length,
      },
    };

    const reResult: ReExecutionResult = {
      reExecutionId,
      originalExecutionId: executionId,
      plan,
      stepResults,
      diffReport,
      success: true,
      completedAt: new Date(),
    };

    await this.eventBus.emit("reexecution_end", reExecutionId, {
      originalExecutionId: executionId,
      success: true,
    });

    return reResult;
  }

  async listOpenTKGReviewQueueItems(
    workflowName: string,
  ): Promise<TKGReviewQueueItem[]> {
    if (!this.workflows.has(workflowName)) {
      throw OboraError.workflowNotFound(workflowName);
    }

    return this.runner.listOpenTKGReviewQueueItems(this.workflows.get(workflowName)!);
  }

  async resolveTKGReviewQueueItem(
    workflowName: string,
    itemId: string,
    resolution: { status: "approved" | "rejected"; actor?: string; note?: string },
  ): Promise<TKGReviewQueueResolutionSummary> {
    if (!this.workflows.has(workflowName)) {
      throw OboraError.workflowNotFound(workflowName);
    }

    return this.runner.resolveTKGReviewQueueItem(this.workflows.get(workflowName)!, itemId, resolution);
  }

  async restoreLatestTKGRollback(
    workflowName: string,
    options: { rollbackId?: string } = {},
  ): Promise<TKGRollbackRestoreSummary> {
    if (!this.workflows.has(workflowName)) {
      throw OboraError.workflowNotFound(workflowName);
    }

    return this.runner.restoreLatestTKGRollback(this.workflows.get(workflowName)!, options);
  }

  async reapplyApprovedTKGReviewQueueItems(
    workflowName: string,
    options: { sourceExecutionId?: string } = {},
  ): Promise<TKGApprovedReviewQueueApplySummary> {
    if (!this.workflows.has(workflowName)) {
      throw OboraError.workflowNotFound(workflowName);
    }

    return this.runner.reapplyApprovedTKGReviewQueueItems(this.workflows.get(workflowName)!, options);
  }

  // ── Query facade (delegates to RunQuery) ──────────────────────────────────

  async getRunRecord(runId: string) {
    return this.query.runs.get(runId);
  }

  async listRunRecords(filter: RunFilter = {}) {
    return this.query.runs.list(filter);
  }

  async getRunSteps(runId: string) {
    return this.query.runs.steps(runId);
  }

  async getRunArtifacts(runId: string, stepName?: string) {
    return this.query.getRunArtifacts(runId, stepName);
  }

  async getArtifact(runId: string, stepName: string, name: string) {
    return this.query.getArtifact(runId, stepName, name);
  }

  async deleteArtifact(runId: string, stepName: string, name: string): Promise<void> {
    return this.query.deleteArtifact(runId, stepName, name);
  }

  async getRunCosts(runId: string, stepName?: string) {
    const adapter = await this.persistenceManager.getStorageAdapter();
    return adapter.getCosts(runId, stepName);
  }

  async getRunCostSummary(runId: string) {
    return this.query.runs.cost(runId);
  }

  async getRunAuditTimeline(runId: string, stepName?: string) {
    return this.query.runs.auditReplay(runId, stepName);
  }

  async getRun(runId: string) {
    return this.query.getRun(runId);
  }

  // ── Spec-aligned namespaced query APIs ───────────────────────────────────

  readonly runs = {
    get: (runId: string) => this.query.runs.get(runId),
    list: (filter: RunFilter = {}) =>
      this.query.runs.list(filter),
    steps: (runId: string) => this.query.runs.steps(runId),
    artifacts: (runId: string, stepName?: string) =>
      this.query.runs.artifacts(runId, stepName),
    cost: (runId: string) => this.query.runs.cost(runId),
    auditReplay: (runId: string, stepName?: string) =>
      this.query.runs.auditReplay(runId, stepName),
  };

  readonly step = {
    cost: (runId: string, stepName: string) => this.query.step.cost(runId, stepName),
    artifacts: (runId: string, stepName: string) =>
      this.query.step.artifacts(runId, stepName),
    artifact: (runId: string, stepName: string, name: string) =>
      this.query.step.artifact(runId, stepName, name),
  };

}

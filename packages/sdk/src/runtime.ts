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
import { BudgetExceededError } from "./cost-tracker.js";
import type { LLMConfig } from "./llm-config.js";
import type { LLMAdapterLike } from "./step-executor.js";

// Sub-modules
import { EventBus } from "./events/event-bus.js";
import { PersistenceManager } from "./persistence/persistence-manager.js";
import { WorkflowRunner } from "./execution/workflow-runner.js";
import { RunQuery } from "./query/run-query.js";

// Re-export all types from runtime-types so existing imports keep working
export {
  OboraError,
  OboraErrorCode,
} from "./runtime-types.js";

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
  ToolHandler,
  PatternPlugin,
  CustomPatternDefinition,
  PatternRegistration,
  OboraPlugin,
  OboraAuditConfig,
  PersistenceConfig,
  ArtifactsConfig,
  OboraRuntimeConfig,
} from "./runtime-types.js";

import {
  OboraError,
  OboraErrorCode,
} from "./runtime-types.js";

import type {
  AuditEvent,
  AuditEventType,
  AgentFactory,
  CustomPatternDefinition,
  EventHandler,
  OboraRuntimeConfig,
  PatternPlugin,
  PatternRegistration,
  RunHandle,
  RunOptions,
  RunStatus,
  RuntimeExecution,
  ToolHandler,
  Unsubscribe,
} from "./runtime-types.js";

export type WorkflowDefinition = WorkflowDef;

// ── OboraRuntime ───────────────────────────────────────────────────────────

export class OboraRuntime {
  // ── Registries ───────────────────────────────────────────────────────────
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly agents = new Map<string, AgentFactory>();
  private readonly tools = new Map<string, ToolHandler>();
  private readonly patterns = new Map<string, PatternRegistration>();
  private readonly pluginRegistry = new PluginRegistry();
  private readonly executions = new Map<string, RuntimeExecution>();

  // ── Sub-module instances ──────────────────────────────────────────────────
  private readonly eventBus: EventBus;
  private readonly persistenceManager: PersistenceManager;
  private readonly runner: WorkflowRunner;
  private readonly query: RunQuery;

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

    if (config.policyPath) {
      this.policyLoadPromise = Policy.fromYaml(config.policyPath)
        .then((policy) => {
          this.policy = policy;
        })
        .catch((error: unknown) => {
          const err = error as NodeJS.ErrnoException;
          if (err?.code === "ENOENT") return;

          if (error instanceof OboraError) throw error;

          throw new OboraError(
            "Failed to load policy",
            OboraErrorCode.POLICY_LOAD_FAILED,
            undefined,
            undefined,
            error,
          );
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

  registerTool(name: string, tool: ToolHandler): this {
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

  // ── emitEvent (kept here so tests can access via `as any`) ──────────────

  /**
   * @internal
   * Delegate to EventBus. Kept as a named private method so existing tests
   * that call `(runtime as any).emitEvent(...)` continue to work.
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
      throw new OboraError(
        "LLM adapter is unavailable",
        OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
        undefined,
        undefined,
        error,
      );
    }
  }

  // ── run() ─────────────────────────────────────────────────────────────────

  async run(name: string, options: RunOptions = {}): Promise<RunHandle> {
    await this.policyLoadPromise;

    if (!this.workflows.has(name)) {
      throw new OboraError(
        `Workflow is not defined: ${name}`,
        OboraErrorCode.SDK_WORKFLOW_NOT_FOUND,
      );
    }

    const { input, variables, signal } = options;
    const executionId = randomUUID();
    const workflow = this.workflows.get(name)!;

    const execution: RuntimeExecution = {
      id: executionId,
      workflowName: name,
      status: "running",
      input,
      startedAt: new Date(),
      stepOrder: workflow.steps.map((s) => s.name),
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };

    const runTimeoutMs = this.resolveExecutionTimeoutMs(workflow, variables);
    let status: RunStatus = "queued";
    let settled = false;
    let rejectWait: ((reason?: unknown) => void) | undefined;
    let runTimeout: ReturnType<typeof setTimeout> | undefined;
    let signalAbortListener: (() => void) | undefined;

    const waitPromise = new Promise<RuntimeExecution>((resolve, reject) => {
      rejectWait = reject;

      queueMicrotask(async () => {
        try {
          if (settled) return;

          status = "running";
          execution.status = "running";

          await this.runner.executeRun(
            executionId,
            name,
            workflow,
            execution,
            options,
            () => settled,
          );

          if (settled) return;

          status = "completed";
          execution.status = "completed";
          execution.endedAt = new Date();
          settled = true;

          this.executions.set(executionId, structuredClone(execution));
          resolve(structuredClone(execution));
        } catch (error) {
          if (settled) return;

          const budgetExceeded = error instanceof BudgetExceededError;
          status = budgetExceeded ? "suspended" : "failed";
          execution.status = budgetExceeded ? "suspended" : "failed";
          execution.error = error instanceof Error ? error.message : String(error);
          execution.endedAt = new Date();
          settled = true;

          const errorCode = budgetExceeded
            ? OboraErrorCode.POLICY_RESOURCE_EXCEEDED
            : error instanceof OboraError
              ? error.code
              : OboraErrorCode.SDK_UNKNOWN_ERROR;

          // Determine persistence config for error save
          const persistenceConfig =
            this.config.config?.persistence ?? this.config.persistence;
          const persistenceEnabled = persistenceConfig?.enabled ?? false;

          await this.runner.saveRunOnError(
            executionId,
            name,
            execution,
            variables,
            errorCode,
            persistenceEnabled,
            persistenceConfig,
          );

          await this.eventBus.emit("error", executionId, {
            message: execution.error,
            code: errorCode,
          });
          await this.eventBus.emit("execution_end", executionId, {
            workflowName: name,
            status: budgetExceeded ? "suspended" : "failed",
          });

          reject(
            budgetExceeded
              ? new OboraError(
                  execution.error,
                  OboraErrorCode.POLICY_RESOURCE_EXCEEDED,
                  executionId,
                )
              : error,
          );
        } finally {
          if (runTimeout) {
            clearTimeout(runTimeout);
            runTimeout = undefined;
          }
          signalAbortListener?.();
          signalAbortListener = undefined;
        }
      });
    });

    const handle: RunHandle = {
      executionId,
      get status() {
        return status;
      },
      wait: () => waitPromise,
      cancel: async (reason?: string) => {
        if (
          settled ||
          status === "completed" ||
          status === "failed" ||
          status === "aborted"
        ) {
          return;
        }

        if (runTimeout) {
          clearTimeout(runTimeout);
          runTimeout = undefined;
        }
        signalAbortListener?.();
        signalAbortListener = undefined;

        status = "aborted";
        execution.status = "aborted";
        execution.error = reason ?? "Execution cancelled";
        execution.endedAt = new Date();
        settled = true;

        const abortError = new OboraError(
          execution.error,
          OboraErrorCode.SDK_EXECUTION_CANCELLED,
          executionId,
          undefined,
          reason,
        );

        await this.eventBus.emit("error", executionId, {
          message: abortError.message,
          code: abortError.code,
        });
        const persistenceConfig =
          this.config.config?.persistence ?? this.config.persistence;
        const persistenceEnabled = persistenceConfig?.enabled ?? false;

        await this.runner.saveRunOnError(
          executionId,
          name,
          execution,
          variables,
          OboraErrorCode.SDK_EXECUTION_CANCELLED,
          persistenceEnabled,
          persistenceConfig,
        );

        await this.eventBus.emit("execution_end", executionId, {
          workflowName: name,
          status: "aborted",
        });

        rejectWait?.(abortError);
      },
    };

    if (runTimeoutMs !== undefined) {
      runTimeout = setTimeout(() => {
        void handle.cancel(`Execution timed out after ${runTimeoutMs}ms`);
      }, runTimeoutMs);
    }

    if (signal) {
      if (signal.aborted) {
        void handle.cancel(
          typeof signal.reason === "string" ? signal.reason : undefined,
        );
      } else {
        const onAbort = () => {
          void handle.cancel(
            typeof signal.reason === "string" ? signal.reason : undefined,
          );
        };
        signal.addEventListener("abort", onAbort, { once: true });
        signalAbortListener = () => signal.removeEventListener("abort", onAbort);
      }
    }

    return handle;
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
    const adapter = await this.persistenceManager.getStorageAdapter();
    const { CheckpointManager } = await import("@obora/runtime");

    const mgr = new CheckpointManager(adapter);
    const run = await adapter.getRun(runId);
    if (!run) {
      throw new OboraError(`Run not found: ${runId}`, OboraErrorCode.SDK_EXECUTION_NOT_FOUND);
    }

    const checkpoint = await mgr.getLatestCheckpoint(runId);
    if (!checkpoint) {
      throw new OboraError(`No checkpoint found for run: ${runId}`, "SDK_CHECKPOINT_NOT_FOUND");
    }

    if (run.status !== "failed" && run.status !== "suspended") {
      throw new OboraError(
        `Run ${runId} is not resumable (status: ${run.status})`,
        "SDK_RESUME_INVALID_STATUS",
        runId,
      );
    }

    const currentPolicyConfig = (this.policy ?? {}) as import("@obora/runtime").PolicyHashInput;
    const drift = mgr.detectDrift(checkpoint, currentPolicyConfig);
    const driftPolicy = options.driftPolicy ?? "warn";
    if (drift.drifted && driftPolicy === "reject") {
      throw new OboraError(
        `Policy drift detected: ${drift.oldHash} → ${drift.newHash}`,
        "SDK_POLICY_DRIFT",
      );
    }

    const workflow = this.workflows.get(run.workflowName);
    const savedSteps = await adapter.getSteps(runId);

    let allStepNames: string[];
    if (workflow) {
      allStepNames = workflow.steps.map((s) => s.name);
    } else {
      const seen = new Set<string>();
      allStepNames = [];
      for (const s of savedSteps) {
        if (!seen.has(s.stepName)) {
          seen.add(s.stepName);
          allStepNames.push(s.stepName);
        }
      }
    }

    if (options.fromStep && !allStepNames.includes(options.fromStep)) {
      throw new OboraError(
        `Invalid fromStep: '${options.fromStep}' is not a valid step name. Available steps: ${allStepNames.join(", ")}`,
        OboraErrorCode.ORCH_STEP_NOT_FOUND,
      );
    }

    const stepPolicies = mgr.resolveStepPolicies(
      savedSteps,
      checkpoint.completedSteps,
      allStepNames,
      options,
    );

    const restoredSteps = stepPolicies
      .filter((p: { action: string }) => p.action === "restore")
      .map((p: { stepName: string }) => p.stepName);
    const rerunSteps = stepPolicies
      .filter((p: { action: string }) => p.action === "rerun")
      .map((p: { stepName: string }) => p.stepName);

    if (!workflow && rerunSteps.length > 0) {
      throw new OboraError(
        `Workflow '${run.workflowName}' is not loaded. Load the workflow definition before resume to execute rerun steps.`,
        OboraErrorCode.SDK_WORKFLOW_NOT_FOUND,
        runId,
      );
    }

    if (rerunSteps.length === 0) {
      await adapter.saveRun({
        ...run,
        status: "completed",
        completedAt: new Date().toISOString(),
      });
      return {
        execution: { id: runId, status: "completed" },
        restoredSteps,
        rerunSteps,
        driftDetected: drift.drifted,
      };
    }

    await adapter.saveRun({ ...run, status: "running", completedAt: undefined });

    if (workflow) {
      await this.policyLoadPromise;

      const execution = await this.runner.executeResume(
        runId,
        run.workflowName,
        workflow,
        run.input,
        rerunSteps,
        stepPolicies,
        currentPolicyConfig,
        adapter,
      );

      this.executions.set(runId, structuredClone(execution));
    }

    return {
      execution: { id: runId, status: "completed" },
      restoredSteps,
      rerunSteps,
      driftDetected: drift.drifted,
    };
  }

  // ── Replay API ────────────────────────────────────────────────────────────

  async replay(
    executionId: string,
    options?: Partial<ReExecutionOptions>,
  ): Promise<ReExecutionResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new OboraError(
        `Execution not found: ${executionId}`,
        OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
      );
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
      throw new OboraError(
        `Checkpoint step not found: ${options.startFromStep}`,
        OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
      );
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
        if (typeof output === "string" && output.startsWith("[stub] No LLM configured")) {
          nonDeterminismWarnings.push({
            type: "state_external",
            description: `Potential non-determinism: no original output for step '${stepName}'`,
            stepName,
            severity: "warning",
          });
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

  // ── Query facade (delegates to RunQuery) ──────────────────────────────────

  async getRunRecord(runId: string) {
    return this.query.runs.get(runId);
  }

  async listRunRecords(filter: import("@obora/runtime").RunFilter = {}) {
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
    list: (filter: import("@obora/runtime").RunFilter = {}) =>
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  private resolveExecutionTimeoutMs(
    workflow: WorkflowDefinition,
    variables?: Record<string, unknown>,
  ): number | undefined {
    const fromOptions = variables?.executionTimeoutMs;
    if (typeof fromOptions === "number" && Number.isFinite(fromOptions) && fromOptions > 0) {
      return fromOptions;
    }

    const fromWorkflow = workflow.variables?.executionTimeoutMs;
    if (typeof fromWorkflow === "number" && Number.isFinite(fromWorkflow) && fromWorkflow > 0) {
      return fromWorkflow;
    }

    return undefined;
  }
}

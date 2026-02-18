import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

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
import { topologicalSort } from "./dependency-resolver.js";
import { resolveLLMConfig, type LLMConfig } from "./llm-config.js";
import { loadConfig, resolveProviderConfig, type OboraConfig } from "./config-loader.js";
import { StepExecutor } from "./step-executor.js";
import { Workflow } from "./workflow.js";
import { BudgetExceededError, CostTracker } from "./cost-tracker.js";
import type { WorkflowDef } from "./workflow.js";

export type WorkflowDefinition = WorkflowDef;

// Mirrors @obora-kit/runtime AuditEventType
export type AuditEventType =
  | "execution_start"
  | "execution_end"
  | "step_start"
  | "step_end"
  | "cell_start"
  | "cell_end"
  | "tool_call"
  | "tool_result"
  | "llm_request"
  | "llm_response"
  | "policy_check"
  | "policy_deny"
  | "state_change"
  | "consensus_vote"
  | "consensus_result"
  | "gate_wait"
  | "gate_resolve"
  | "gate_assignment_created"
  | "gate_assignment_reassigned"
  | "gate_assignment_expired"
  | "gate_approval_decision"
  | "gate_sla_warning"
  | "gate_sla_expired"
  | "recovery_start"
  | "recovery_end"
  | "snapshot_create"
  | "snapshot_restore"
  | "plugin_load"
  | "plugin_unload"
  | "reexecution_start"
  | "reexecution_step_start"
  | "reexecution_step_end"
  | "reexecution_end"
  | "warning"
  | "error";

export interface AuditEvent<T extends AuditEventType = AuditEventType> {
  id: string;
  executionId: string;
  cellId?: string;
  timestamp: Date;
  type: T;
  data: unknown;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
    costUsd?: number;
  };
}

export const OboraErrorCode = {
  CELL_TIMEOUT: "CELL_1001",
  CELL_TOOL_DENIED: "CELL_1002",
  CELL_LLM_ERROR: "CELL_1003",
  CELL_ABORTED: "CELL_1004",
  POLICY_DENY: "POLICY_2001",
  POLICY_GATE_REQUIRED: "POLICY_2002",
  POLICY_GATE_TIMEOUT: "POLICY_2003",
  POLICY_GATE_REJECTED: "POLICY_2004",
  POLICY_SANDBOX_VIOLATION: "POLICY_2005",
  POLICY_RESOURCE_EXCEEDED: "POLICY_2006",
  POLICY_LOAD_FAILED: "POLICY_2007",
  CONSENSUS_FAIL: "CONSENSUS_3001",
  CONSENSUS_TIMEOUT: "CONSENSUS_3002",
  CONSENSUS_QUORUM_NOT_MET: "CONSENSUS_3003",
  RECOVERY_RETRY_EXHAUSTED: "RECOVERY_4001",
  RECOVERY_ROLLBACK_FAILED: "RECOVERY_4002",
  RECOVERY_ESCALATION_TIMEOUT: "RECOVERY_4003",
  ORCH_WORKFLOW_NOT_FOUND: "ORCH_5001",
  ORCH_STEP_NOT_FOUND: "ORCH_5002",
  ORCH_DEPENDENCY_FAILED: "ORCH_5003",
  ORCH_EXECUTION_TIMEOUT: "ORCH_5004",
  AUDIT_STORE_ERROR: "AUDIT_6001",
  AUDIT_REPLAY_NOT_FOUND: "AUDIT_6002",
  ADAPTER_LLM_UNAVAILABLE: "ADAPTER_7001",
  ADAPTER_AUTH_FAILED: "ADAPTER_7002",
  ADAPTER_TOOL_NOT_FOUND: "ADAPTER_7003",
  SDK_WORKFLOW_NOT_FOUND: "SDK_8001",
  SDK_EXECUTION_CANCELLED: "SDK_8002",
  SDK_NOT_IMPLEMENTED: "SDK_8003",
  SDK_INVALID_POLICY: "SDK_8004",
  SDK_INVALID_WORKFLOW: "SDK_8005",
  SDK_UNKNOWN_ERROR: "SDK_8006",
  SDK_EXECUTION_NOT_FOUND: "SDK_8007",
  SDK_INVALID_CONFIG: "SDK_8008",
  SDK_INVALID_PLUGIN: "SDK_9001",
  SDK_PLUGIN_LOAD_FAILED: "SDK_9002",
  SDK_PLUGIN_CONFLICT: "SDK_9003",
  SDK_FIXTURE_INVALID: "SDK_9004",
} as const;

export interface RuntimeExecution {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "waiting" | "suspended" | "aborted";
  input: unknown;
  startedAt: Date;
  endedAt?: Date;
  error?: string;
  stepOrder: string[];
  completedSteps: string[];
  stepRecords: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export interface PatternPlugin {
  name: string;
}

export interface CustomPatternDefinition {
  name: string;
  execute?: (...args: unknown[]) => unknown;
}

export interface OboraPlugin {
  name: string;
  version: string;
  type: string;
}

export interface OboraAuditConfig {
  enabled?: boolean;
  sink?: (event: AuditEvent) => void | Promise<void>;
}

export interface PersistenceConfig {
  enabled: boolean;
  adapter: "sqlite" | "custom";
  sqlite?: { path: string };
  custom?: { instance: import("@obora/runtime").StorageAdapter };
}

export interface OboraRuntimeConfig {
  policyPath?: string;
  audit?: OboraAuditConfig;
  llm?: LLMConfig;
  config?: OboraConfig;
  configPath?: string;
  agentsPath?: string;
  verbose?: boolean;
  persistence?: PersistenceConfig;
}

export type AgentFactory = (...args: unknown[]) => unknown;
export type ToolHandler = (params: unknown, context?: unknown) => unknown | Promise<unknown>;
export type PatternRegistration = PatternPlugin | CustomPatternDefinition;

export type RunStatus = "queued" | "running" | "waiting" | "suspended" | "completed" | "failed" | "aborted";

export interface RunOptions {
  input?: unknown;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface RunHandle {
  executionId: string;
  readonly status: RunStatus;
  wait(): Promise<RuntimeExecution>;
  cancel(reason?: string): Promise<void>;
}

export type EventHandler<T extends AuditEventType = AuditEventType> = (
  event: AuditEvent & { type: T }
) => void | Promise<void>;
export type Unsubscribe = () => void;

export class OboraError extends Error {
  constructor(
    message: string,
    /**
     * Runtime codes (OboraErrorCode) + SDK facade codes (e.g., SDK_*).
     */
    public readonly code: string,
    public readonly executionId?: string,
    public readonly stepName?: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OboraError";
  }
}

export class OboraRuntime {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly agents = new Map<string, AgentFactory>();
  private readonly tools = new Map<string, ToolHandler>();
  private readonly patterns = new Map<string, PatternRegistration>();
  private readonly pluginRegistry = new PluginRegistry();
  private readonly handlers = new Map<AuditEventType, Set<EventHandler<AuditEventType>>>();
  private readonly anyHandlers = new Set<(event: AuditEvent) => void | Promise<void>>();
  private readonly executions = new Map<string, RuntimeExecution>();

  private policy?: PolicyDefinition;
  private readonly policyLoadPromise?: Promise<void>;

  constructor(private readonly config: OboraRuntimeConfig = {}) {
    if (config.policyPath) {
      this.policyLoadPromise = Policy.fromYaml(config.policyPath)
        .then((policy) => {
          this.policy = policy;
        })
        .catch((error: unknown) => {
          const err = error as NodeJS.ErrnoException;
          if (err?.code === "ENOENT") {
            return;
          }

          if (error instanceof OboraError) {
            throw error;
          }

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

  async replay(
    executionId: string,
    options?: Partial<ReExecutionOptions>,
  ): Promise<ReExecutionResult> {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new OboraError(`Execution not found: ${executionId}`, OboraErrorCode.AUDIT_REPLAY_NOT_FOUND);
    }

    const reExecutionId = randomUUID();
    const mode = options?.mode ?? "full";
    const dryRun = options?.dryRun ?? true;

    await this.emitEvent("reexecution_start", reExecutionId, {
      originalExecutionId: executionId,
      mode,
      dryRun,
    });

    const allSteps = execution.stepOrder ?? [];
    if (mode === "from_checkpoint" && options?.startFromStep && !allSteps.includes(options.startFromStep)) {
      throw new OboraError(
        `Checkpoint step not found: ${options.startFromStep}`,
        OboraErrorCode.AUDIT_REPLAY_NOT_FOUND,
      );
    }

    const checkpointIdx = options?.startFromStep ? allSteps.indexOf(options.startFromStep) : -1;
    const stepsToSkip = checkpointIdx > 0 ? allSteps.slice(0, checkpointIdx) : [];
    const stepsToRerun = checkpointIdx > 0 ? allSteps.slice(checkpointIdx) : [...allSteps];

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

      await this.emitEvent("reexecution_step_start", reExecutionId, { stepName });

      if (options?.onStepComplete) {
        await options.onStepComplete(stepName, result);
      }

      await this.emitEvent("reexecution_step_end", reExecutionId, {
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

    await this.emitEvent("reexecution_end", reExecutionId, {
      originalExecutionId: executionId,
      success: true,
    });

    return reResult;
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

  async run(name: string, options: RunOptions = {}): Promise<RunHandle> {
    await this.policyLoadPromise;

    if (!this.workflows.has(name)) {
      throw new OboraError(`Workflow is not defined: ${name}`, OboraErrorCode.SDK_WORKFLOW_NOT_FOUND);
    }

    const { input, variables, signal } = options;
    const executionId = randomUUID();
    const workflow = this.workflows.get(name)!;
    const execution = this.createExecution(executionId, name, input, workflow);
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
          if (settled) {
            return;
          }

          status = "running";
          execution.status = "running";
          await this.emitEvent("execution_start", executionId, {
            workflowName: name,
            input,
            variables,
          });

          if (settled) {
            return;
          }

          const loadedConfig =
            this.config.config !== undefined ? this.config.config : await loadConfig(this.config.configPath);
          const llmConfig = resolveLLMConfig(this.config.llm, loadedConfig);
          const stepOrder = topologicalSort(workflow.steps);

          const resourcesConfig = loadedConfig?.resources;
          const shouldTrackCost = Boolean(resourcesConfig);
          const costTracker = shouldTrackCost
            ? new CostTracker(await this.getCostTrackingAdapter(), executionId, loadedConfig)
            : undefined;
          execution.stepOrder = stepOrder.map((step) => step.name);

          const runtimeAgents = await this.loadAgentsFromYaml(this.config.agentsPath);
          const allAgents = new Map<string, AgentFactory>([...runtimeAgents, ...this.agents]);

          const adapterCache = new Map<string, Awaited<ReturnType<OboraRuntime["createLLMAdapter"]>>>();
          const getAdapter = async (cfg: LLMConfig) => {
            const apiKeyHash = createHash("sha256").update(cfg.apiKey).digest("hex").slice(0, 16);
            const cacheKey = `${cfg.provider}:${cfg.model ?? ""}:${cfg.baseUrl ?? ""}:${apiKeyHash}`;
            const cached = adapterCache.get(cacheKey);
            if (cached) {
              return cached;
            }
            const adapter = await this.createLLMAdapter(cfg);
            adapterCache.set(cacheKey, adapter);
            return adapter;
          };

          const stepExecutor = llmConfig
            ? new StepExecutor(await getAdapter(llmConfig), allAgents, {
                model: llmConfig.model,
                temperature: llmConfig.temperature,
                maxTokens: llmConfig.maxTokens,
                verbose: this.config.verbose,
                resolveAgentLLM: async (agentName?: string) => {
                  if (!loadedConfig || !agentName) {
                    return undefined;
                  }

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
                    verbose: this.config.verbose,
                  });
                  if (!providerConfig) {
                    if (resolvedProviderName) {
                      await this.emitEvent("warning", executionId, {
                        message: `Agent '${agentName}' configured with provider '${resolvedProviderName}' but API key not resolved. Falling back to default.`,
                        code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
                      });
                    }
                    return undefined;
                  }

                  return {
                    adapter: await getAdapter(providerConfig),
                    model: preferYamlAgent
                      ? (yamlAgent?.model ?? providerConfig.model)
                      : (configAgent?.model ?? providerConfig.model),
                    temperature: preferYamlAgent
                      ? (yamlAgent?.temperature ?? providerConfig.temperature)
                      : (configAgent?.temperature ?? providerConfig.temperature),
                    maxTokens: providerConfig.maxTokens,
                  };
                },
                onEvent: async (eventType, data) => {
                  if (eventType === "llm_response" && costTracker) {
                    const payload = data as {
                      stepName?: string;
                      model?: string;
                      usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
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
                  await this.emitEvent(eventType, executionId, data);
                },
              })
            : undefined;

          if (!llmConfig) {
            await this.emitEvent("warning", executionId, {
              message: "No LLM configured; workflow will run in stub mode.",
              code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
            });
          }

          for (const step of stepOrder) {
            if (settled) {
              return;
            }

            if (signal?.aborted) {
              await handle.cancel(typeof signal.reason === "string" ? signal.reason : undefined);
              return;
            }

            if (costTracker) {
              await costTracker.preStepGate(step.name);
            }

            const stepStartedAt = Date.now();
            await this.emitEvent("step_start", executionId, {
              stepName: step.name,
              agent: step.agent,
            });

            const result = stepExecutor
              ? await stepExecutor.executeStep(step, {
                  previousOutputs: execution.outputs,
                  signal,
                })
              : {
                  output: "[stub] No LLM configured",
                  raw: {
                    stub: true,
                    reason: "No LLM configured",
                  },
                };

            if (settled) {
              return;
            }

            execution.outputs[step.name] = result.output;
            execution.stepRecords[step.name] = result;
            execution.completedSteps.push(step.name);

            if (settled) {
              return;
            }

            await this.emitEvent("step_end", executionId, {
              stepName: step.name,
              status: "completed",
              durationMs: Date.now() - stepStartedAt,
              outputPreview:
                typeof result.output === "string" ? result.output.slice(0, 200) : JSON.stringify(result.output).slice(0, 200),
            });

            if (settled) {
              return;
            }
          }

          status = "completed";
          execution.status = "completed";
          execution.endedAt = new Date();
          settled = true;

          await this.emitEvent("execution_end", executionId, {
            workflowName: name,
            status: "completed",
          });

          this.executions.set(executionId, structuredClone(execution));
          resolve(structuredClone(execution));
        } catch (error) {
          if (settled) {
            return;
          }

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
          await this.emitEvent("error", executionId, {
            message: execution.error,
            code: errorCode,
          });
          await this.emitEvent("execution_end", executionId, {
            workflowName: name,
            status: budgetExceeded ? "suspended" : "failed",
          });

          reject(
            budgetExceeded
              ? new OboraError(execution.error, OboraErrorCode.POLICY_RESOURCE_EXCEEDED, executionId)
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
        if (settled || status === "completed" || status === "failed" || status === "aborted") {
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

        await this.emitEvent("error", executionId, {
          message: abortError.message,
          code: abortError.code,
        });
        await this.emitEvent("execution_end", executionId, {
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
        void handle.cancel(typeof signal.reason === "string" ? signal.reason : undefined);
      } else {
        const onAbort = () => {
          void handle.cancel(typeof signal.reason === "string" ? signal.reason : undefined);
        };
        signal.addEventListener("abort", onAbort, { once: true });
        signalAbortListener = () => signal.removeEventListener("abort", onAbort);
      }
    }

    return handle;
  }

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

    void this.emitEvent("plugin_load", "runtime", {
      pluginName,
      pluginType,
    });
    return this;
  }

  getPlugins(typeOrAlias?: string): LoadedPlugin[] {
    if (!typeOrAlias) {
      return this.pluginRegistry.getAll();
    }

    const type = resolvePluginType(typeOrAlias);
    return this.pluginRegistry.getAll(type);
  }

  on<T extends AuditEventType>(event: T, handler: EventHandler<T>): Unsubscribe {
    const bucket = this.handlers.get(event) ?? new Set<EventHandler<AuditEventType>>();
    const normalizedHandler = handler as EventHandler<AuditEventType>;
    bucket.add(normalizedHandler);
    this.handlers.set(event, bucket);

    return () => {
      const current = this.handlers.get(event);
      if (!current) {
        return;
      }

      current.delete(normalizedHandler);
      if (current.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  events(filter?: {
    executionId?: string;
    type?: AuditEventType | AuditEventType[];
  }): AsyncIterableIterator<AuditEvent> {
    const queue: AuditEvent[] = [];
    let resolve: ((value: IteratorResult<AuditEvent>) => void) | null = null;
    let done = false;

    const handler = (event: AuditEvent) => {
      if (done) {
        return;
      }

      if (filter?.executionId && event.executionId !== filter.executionId) {
        return;
      }

      if (filter?.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(event.type)) {
          return;
        }
      }

      if (resolve) {
        const pending = resolve;
        resolve = null;
        pending({ value: event, done: false });
      } else {
        queue.push(event);
      }
    };

    this.anyHandlers.add(handler);

    const close = () => {
      done = true;
      this.anyHandlers.delete(handler);
      if (resolve) {
        const pending = resolve;
        resolve = null;
        pending({ value: undefined, done: true });
      }
    };

    const iterator: AsyncIterableIterator<AuditEvent> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async next() {
        if (queue.length > 0) {
          return { value: queue.shift()!, done: false };
        }

        if (done) {
          return { value: undefined, done: true };
        }

        return await new Promise<IteratorResult<AuditEvent>>((nextResolve) => {
          resolve = nextResolve;
        });
      },
      async return() {
        close();
        return { value: undefined, done: true };
      },
    };

    return iterator;
  }

  private async createLLMAdapter(config: LLMConfig): Promise<{
    chatCompletion: (params: {
      model?: string;
      messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
      temperature?: number;
      maxTokens?: number;
      signal?: AbortSignal;
    }) => Promise<{ message: { role: "assistant"; content: string | null } }>;
  }> {
    try {
      const adaptersModule = "@obora-kit/adapters";
      const adapters = (await import(adaptersModule)) as Record<string, unknown>;
      const PiAIAdapterCtor = adapters.PiAIAdapter as new (cfg: {
        provider: string;
        apiKey: string;
        model?: string;
        baseUrl?: string;
      }) => {
        chatCompletion: (params: {
          model?: string;
          messages: Array<{ role: "system" | "user" | "assistant" | "tool"; content: string }>;
          temperature?: number;
          maxTokens?: number;
          signal?: AbortSignal;
        }) => Promise<{ message: { role: "assistant"; content: string | null } }>;
      };

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

  private async loadAgentsFromYaml(path?: string): Promise<Map<string, AgentFactory>> {
    if (!path) {
      return new Map();
    }

    const content = await readFile(path, "utf-8");
    const parsed = parseYaml(content) as {
      agents?: Record<string, { role?: string; description?: string; provider?: string; model?: string; temperature?: number }>;
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

  private createExecution(
    executionId: string,
    workflowName: string,
    input: unknown,
    workflow: WorkflowDefinition,
  ): RuntimeExecution {
    const stepOrder = workflow.steps.map((step) => step.name);

    return {
      id: executionId,
      workflowName,
      status: "running",
      input,
      startedAt: new Date(),
      stepOrder,
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };
  }

  private async emitEvent(
    type: AuditEventType,
    executionId: string,
    data: unknown,
    metadata?: AuditEvent["metadata"],
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      executionId,
      timestamp: new Date(),
      type,
      data,
      ...(metadata ? { metadata } : {}),
    };

    if (this.config.audit?.enabled !== false) {
      await this.config.audit?.sink?.(event);
    }

    const handlers = this.handlers.get(type);
    const callbacks = [...(handlers ?? []), ...this.anyHandlers];
    if (callbacks.length === 0) {
      return;
    }

    await Promise.allSettled(
      callbacks.map(async (callback) => {
        await callback(event);
      }),
    );
  }

  // ── Resume API (M6-02) ──

  /**
   * Resume a failed/suspended run from its last checkpoint.
   *
   * SDK-level resume delegates to the storage adapter for checkpoint loading
   * and returns the resume result with restored/rerun step information.
   */
  async resume(
    runId: string,
    options: { fromStep?: string; driftPolicy?: "reject" | "warn" | "ignore" } = {},
  ): Promise<{
    execution: { id: string; status: string };
    restoredSteps: string[];
    rerunSteps: string[];
    driftDetected: boolean;
  }> {
    const adapter = await this.getStorageAdapter();
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

    // Resolve current policy for drift detection (use loaded policy if available)
    const currentPolicyConfig = this.policy ?? {};
    const drift = mgr.detectDrift(checkpoint, currentPolicyConfig);
    const driftPolicy = options.driftPolicy ?? "warn";
    if (drift.drifted && driftPolicy === "reject") {
      throw new OboraError(
        `Policy drift detected: ${drift.oldHash} → ${drift.newHash}`,
        "SDK_POLICY_DRIFT",
      );
    }

    // Use workflow definition for complete step names (not just saved steps)
    const workflow = this.workflows.get(run.workflowName);
    const savedSteps = await adapter.getSteps(runId);

    let allStepNames: string[];
    if (workflow) {
      allStepNames = workflow.steps.map((s) => s.name);
    } else {
      // Fallback: use saved steps + deduplicate for validation/reporting only
      const seen = new Set<string>();
      allStepNames = [];
      for (const s of savedSteps) {
        if (!seen.has(s.stepName)) {
          seen.add(s.stepName);
          allStepNames.push(s.stepName);
        }
      }
    }

    // Validate fromStep
    if (options.fromStep && !allStepNames.includes(options.fromStep)) {
      throw new OboraError(
        `Invalid fromStep: '${options.fromStep}' is not a valid step name. Available steps: ${allStepNames.join(", ")}`,
        OboraErrorCode.ORCH_STEP_NOT_FOUND,
      );
    }

    // Determine step policies
    const stepPolicies = mgr.resolveStepPolicies(savedSteps, checkpoint.completedSteps, allStepNames, options);

    const restoredSteps = stepPolicies.filter((p: { action: string }) => p.action === "restore").map((p: { stepName: string }) => p.stepName);
    const rerunSteps = stepPolicies.filter((p: { action: string }) => p.action === "rerun").map((p: { stepName: string }) => p.stepName);

    if (!workflow && rerunSteps.length > 0) {
      throw new OboraError(
        `Workflow '${run.workflowName}' is not loaded. Load the workflow definition before resume to execute rerun steps.`,
        OboraErrorCode.SDK_WORKFLOW_NOT_FOUND,
        runId,
      );
    }

    if (rerunSteps.length === 0) {
      await adapter.saveRun({ ...run, status: "completed", completedAt: new Date().toISOString() });
      return {
        execution: { id: runId, status: "completed" },
        restoredSteps,
        rerunSteps,
        driftDetected: drift.drifted,
      };
    }

    // Update run status and execute rerun steps
    await adapter.saveRun({ ...run, status: "running", completedAt: undefined });

    // If we have a workflow definition, actually re-execute the rerun steps
    if (workflow) {
      await this.policyLoadPromise;
      const executionId = runId;
      const execution = this.createExecution(executionId, run.workflowName, run.input, workflow);

      const completedStepsSet = new Set<string>();

      // Restore completed step outputs
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

      // Execute rerun steps
      const loadedConfig =
        this.config.config !== undefined ? this.config.config : await loadConfig(this.config.configPath);
      const llmConfig = resolveLLMConfig(this.config.llm, loadedConfig);
      const costTracker = this.config.persistence?.enabled
        ? new CostTracker(adapter, runId, loadedConfig)
        : undefined;

      const runtimeAgents = await this.loadAgentsFromYaml(this.config.agentsPath);
      const allAgents = new Map<string, AgentFactory>([...runtimeAgents, ...this.agents]);
      const adapterCache = new Map<string, Awaited<ReturnType<OboraRuntime["createLLMAdapter"]>>>();
      const getAdapter = async (cfg: LLMConfig) => {
        const apiKeyHash = createHash("sha256").update(cfg.apiKey).digest("hex").slice(0, 16);
        const cacheKey = `${cfg.provider}:${cfg.model ?? ""}:${cfg.baseUrl ?? ""}:${apiKeyHash}`;
        const cached = adapterCache.get(cacheKey);
        if (cached) return cached;
        const a = await this.createLLMAdapter(cfg);
        adapterCache.set(cacheKey, a);
        return a;
      };

      const stepExecutor = llmConfig
        ? new StepExecutor(await getAdapter(llmConfig), allAgents, {
            model: llmConfig.model,
            temperature: llmConfig.temperature,
            maxTokens: llmConfig.maxTokens,
            verbose: this.config.verbose,
            resolveAgentLLM: async (agentName?: string) => {
              if (!loadedConfig || !agentName) {
                return undefined;
              }

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
                verbose: this.config.verbose,
              });
              if (!providerConfig) {
                if (resolvedProviderName) {
                  await this.emitEvent("warning", executionId, {
                    message: `Agent '${agentName}' configured with provider '${resolvedProviderName}' but API key not resolved. Falling back to default.`,
                    code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
                  });
                }
                return undefined;
              }

              return {
                adapter: await getAdapter(providerConfig),
                model: preferYamlAgent
                  ? (yamlAgent?.model ?? providerConfig.model)
                  : (configAgent?.model ?? providerConfig.model),
                temperature: preferYamlAgent
                  ? (yamlAgent?.temperature ?? providerConfig.temperature)
                  : (configAgent?.temperature ?? providerConfig.temperature),
                maxTokens: providerConfig.maxTokens,
              };
            },
            onEvent: async (eventType, data) => {
              if (eventType === "llm_response" && costTracker) {
                const payload = data as {
                  stepName?: string;
                  model?: string;
                  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
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
              await this.emitEvent(eventType, executionId, data);
            },
          })
        : undefined;

      if (!llmConfig) {
        await this.emitEvent("warning", executionId, {
          message: "No LLM configured; workflow will run in stub mode.",
          code: OboraErrorCode.ADAPTER_LLM_UNAVAILABLE,
        });
      }

      const sortedStepDefs = topologicalSort(workflow.steps).filter((s) => rerunSteps.includes(s.name));

      await this.emitEvent("execution_start", executionId, {
        workflowName: run.workflowName,
        input: run.input,
        resume: true,
        rerunSteps,
      });

      try {
        for (const step of sortedStepDefs) {
          if (costTracker) {
            await costTracker.preStepGate(step.name);
          }
          await this.emitEvent("step_start", executionId, { stepName: step.name, agent: step.agent });
          const stepStartedAt = Date.now();
          const startedAtIso = new Date(stepStartedAt).toISOString();

          await adapter.saveStep({
            id: `${runId}:${step.name}`,
            runId,
            stepName: step.name,
            status: "running",
            startedAt: startedAtIso,
          });

          try {
            const result = stepExecutor
              ? await stepExecutor.executeStep(step, { previousOutputs: execution.outputs })
              : { output: "[stub] No LLM configured", raw: { stub: true, reason: "No LLM configured" } };

            execution.outputs[step.name] = result.output;
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
              currentPolicyConfig,
            );

            await this.emitEvent("step_end", executionId, {
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
                code: stepErr instanceof BudgetExceededError
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
              currentPolicyConfig,
            );

            throw stepErr;
          }
        }

        // Update run as completed
        execution.status = "completed";
        execution.endedAt = new Date();
        await this.emitEvent("execution_end", executionId, {
          workflowName: run.workflowName,
          status: "completed",
          resume: true,
        });
        await adapter.saveRun({ ...run, status: "completed", completedAt: execution.endedAt.toISOString() });
        this.executions.set(executionId, structuredClone(execution));
      } catch (err) {
        const budgetExceeded = err instanceof BudgetExceededError
          || (err instanceof OboraError && err.code === OboraErrorCode.POLICY_RESOURCE_EXCEEDED);

        execution.status = budgetExceeded ? "suspended" : "failed";
        execution.endedAt = new Date();
        await this.emitEvent("execution_end", executionId, {
          workflowName: run.workflowName,
          status: budgetExceeded ? "suspended" : "failed",
          resume: true,
        });
        await adapter.saveRun({
          ...run,
          status: budgetExceeded ? "suspended" : "failed",
          completedAt: execution.endedAt.toISOString(),
        });
        this.executions.set(executionId, structuredClone(execution));
        throw err;
      }
    }

    return {
      execution: { id: runId, status: "completed" },
      restoredSteps,
      rerunSteps,
      driftDetected: drift.drifted,
    };
  }

  // ── Persistence Query API (M6-01) ──

  private _storageAdapter?: import("@obora/runtime").StorageAdapter;

  private async getCostTrackingAdapter(): Promise<import("@obora/runtime").StorageAdapter> {
    if (this.config.persistence?.enabled) {
      return this.getStorageAdapter();
    }

    const { InMemoryStorageAdapter } = await import("@obora/runtime");
    return new InMemoryStorageAdapter() as import("@obora/runtime").StorageAdapter;
  }

  private async getStorageAdapter(): Promise<import("@obora/runtime").StorageAdapter> {
    if (this._storageAdapter) return this._storageAdapter;

    const p = this.config.persistence;
    if (!p?.enabled) {
      throw new OboraError("Persistence is not enabled", "SDK_PERSISTENCE_DISABLED");
    }

    if (p.adapter === "custom" && p.custom?.instance) {
      this._storageAdapter = p.custom.instance;
    } else if (p.adapter === "sqlite" && p.sqlite?.path) {
      const { SQLiteStorageAdapter } = await import("@obora/runtime");
      this._storageAdapter = new SQLiteStorageAdapter({ path: p.sqlite.path });
    } else {
      throw new OboraError("Invalid persistence configuration", "SDK_PERSISTENCE_CONFIG_ERROR");
    }

    return this._storageAdapter;
  }

  /** Get a run record by ID */
  async getRunRecord(runId: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getRun(runId);
  }

  /** List run records with optional filter */
  async listRunRecords(filter: import("@obora/runtime").RunFilter = {}) {
    const adapter = await this.getStorageAdapter();
    return adapter.listRuns(filter);
  }

  /** Get step records for a run */
  async getRunSteps(runId: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getSteps(runId);
  }

  /** Get artifact records for a run, optionally filtered by step */
  async getRunArtifacts(runId: string, stepName?: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getArtifacts(runId, stepName);
  }

  /** Get cost records for a run, optionally filtered by step */
  async getRunCosts(runId: string, stepName?: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getCosts(runId, stepName);
  }

  /** Get aggregated run cost summary */
  async getRunCostSummary(runId: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getRunCostSummary(runId);
  }

  /** Get structured audit timeline for a run */
  async getRunAuditTimeline(runId: string, stepName?: string) {
    const adapter = await this.getStorageAdapter();
    return adapter.getAuditTimeline(runId, stepName);
  }

  /** SDK ergonomic run handle with run.auditReplay(stepName?) */
  async getRun(runId: string) {
    const adapter = await this.getStorageAdapter();
    const run = await adapter.getRun(runId);
    if (!run) return null;

    return {
      ...run,
      steps: async () => adapter.getSteps(runId),
      artifacts: async (stepName?: string) => adapter.getArtifacts(runId, stepName),
      cost: async () => adapter.getRunCostSummary(runId),
      auditReplay: async (stepName?: string) => adapter.getAuditTimeline(runId, stepName),
    };
  }

  // ── run namespace (spec-aligned facade) ──

  /** Spec-aligned run query API: `runtime.runs.get(id)`, `runtime.runs.steps(id)`, `runtime.runs.artifacts(stepId)` */
  readonly runs = {
    /** Get a run record by ID */
    get: async (runId: string) => {
      const adapter = await this.getStorageAdapter();
      return adapter.getRun(runId);
    },

    /** List run records with optional filter */
    list: async (filter: import("@obora/runtime").RunFilter = {}) => {
      const adapter = await this.getStorageAdapter();
      return adapter.listRuns(filter);
    },

    /** Get step records for a run */
    steps: async (runId: string) => {
      const adapter = await this.getStorageAdapter();
      return adapter.getSteps(runId);
    },

    /** Get artifact records for a run, optionally filtered by step */
    artifacts: async (runId: string, stepName?: string) => {
      const adapter = await this.getStorageAdapter();
      return adapter.getArtifacts(runId, stepName);
    },

    /** Spec-aligned: run.cost() equivalent facade */
    cost: async (runId: string) => {
      const adapter = await this.getStorageAdapter();
      return adapter.getRunCostSummary(runId);
    },

    /** Spec-aligned: run.auditReplay(stepName?) facade */
    auditReplay: async (runId: string, stepName?: string) => {
      const adapter = await this.getStorageAdapter();
      return adapter.getAuditTimeline(runId, stepName);
    },
  };

  /** Spec-aligned: step.cost() equivalent facade */
  readonly step = {
    cost: async (runId: string, stepName: string) => {
      const adapter = await this.getStorageAdapter();
      const records = await adapter.getCosts(runId, stepName);
      const tokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
      const costUsd = records.reduce((sum, r) => sum + r.costUsd, 0);
      return { stepName, tokens, costUsd, records };
    },
  };
}

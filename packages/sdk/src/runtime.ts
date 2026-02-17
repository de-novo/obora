import { randomUUID } from "node:crypto";

import { Policy, type PolicyDefinition } from "./policy.js";
import { Workflow } from "./workflow.js";
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
} as const;

export interface RuntimeExecution {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "waiting" | "suspended";
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

export interface OboraRuntimeConfig {
  policyPath?: string;
  audit?: OboraAuditConfig;
}

export type AgentFactory = (...args: unknown[]) => unknown;
export type ToolHandler = (params: unknown, context?: unknown) => unknown | Promise<unknown>;
export type PatternRegistration = PatternPlugin | CustomPatternDefinition;

export type RunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "aborted";

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
  private readonly plugins = new Map<string, OboraPlugin>();
  private readonly handlers = new Map<AuditEventType, Set<EventHandler>>();
  private readonly anyHandlers = new Set<(event: AuditEvent) => void | Promise<void>>();

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

  async replay(executionId: string, options?: unknown): Promise<unknown> {
    void executionId;
    void options;
    throw new OboraError("Not implemented: replay", "SDK_NOT_IMPLEMENTED");
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
        data.code ?? "SDK_UNKNOWN_ERROR",
        event.executionId,
        data.stepName,
      );
      handler(err);
    });
  }

  async run(name: string, options: RunOptions = {}): Promise<RunHandle> {
    await this.policyLoadPromise;

    if (!this.workflows.has(name)) {
      throw new OboraError(`Workflow is not defined: ${name}`, "SDK_WORKFLOW_NOT_FOUND");
    }

    const { input, variables, signal } = options;
    const executionId = randomUUID();
    const execution = this.createExecution(executionId, name, input);
    let status: RunStatus = "queued";
    let settled = false;
    let rejectWait: ((reason?: unknown) => void) | undefined;

    const waitPromise = new Promise<RuntimeExecution>((resolve, reject) => {
      rejectWait = reject;

      queueMicrotask(async () => {
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

        status = "completed";
        execution.status = "completed";
        execution.endedAt = new Date();
        settled = true;

        await this.emitEvent("execution_end", executionId, {
          workflowName: name,
          status: "completed",
        });

        resolve(structuredClone(execution));
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

        status = "aborted";
        execution.status = "failed";
        execution.error = reason ?? "Execution cancelled";
        execution.endedAt = new Date();
        settled = true;

        const abortError = new OboraError(
          execution.error,
          "SDK_EXECUTION_CANCELLED",
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

    if (signal) {
      if (signal.aborted) {
        void handle.cancel(typeof signal.reason === "string" ? signal.reason : undefined);
      } else {
        signal.addEventListener(
          "abort",
          () => {
            void handle.cancel(typeof signal.reason === "string" ? signal.reason : undefined);
          },
          { once: true },
        );
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

  registerPlugin(plugin: OboraPlugin): this {
    this.plugins.set(plugin.name, plugin);
    void this.emitEvent("plugin_load", "runtime", {
      pluginName: plugin.name,
      pluginType: plugin.type,
    });
    return this;
  }

  on<T extends AuditEventType>(event: T, handler: EventHandler<T>): Unsubscribe {
    const bucket = this.handlers.get(event) ?? new Set<EventHandler>();
    bucket.add(handler as unknown as EventHandler);
    this.handlers.set(event, bucket);

    return () => {
      const current = this.handlers.get(event);
      if (!current) {
        return;
      }

      current.delete(handler as unknown as EventHandler);
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

  private createExecution(executionId: string, workflowName: string, input: unknown): RuntimeExecution {
    return {
      id: executionId,
      workflowName,
      status: "running",
      input,
      startedAt: new Date(),
      stepOrder: [],
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
}

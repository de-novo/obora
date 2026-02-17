import { randomUUID } from "node:crypto";
import type {
  AuditEvent,
  AuditEventType,
  Execution,
  OboraPlugin,
  PatternPlugin,
  RuntimeOrchestrator,
} from "@obora-kit/runtime";
import type { CustomPatternDefinition } from "@obora-kit/runtime";

export type WorkflowDefinition = Parameters<RuntimeOrchestrator["define"]>[1];

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

export interface RunHandle {
  executionId: string;
  readonly status: RunStatus;
  wait(): Promise<Execution>;
  cancel(reason?: string): Promise<void>;
}

export type EventHandler<T extends AuditEventType = AuditEventType> = (
  event: Extract<AuditEvent, { type: T }> | AuditEvent
) => void | Promise<void>;
export type Unsubscribe = () => void;

export class OboraRuntime {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly agents = new Map<string, AgentFactory>();
  private readonly tools = new Map<string, ToolHandler>();
  private readonly patterns = new Map<string, PatternRegistration>();
  private readonly plugins = new Map<string, OboraPlugin>();
  private readonly handlers = new Map<AuditEventType, Set<EventHandler>>();

  constructor(private readonly config: OboraRuntimeConfig = {}) {}

  define(name: string, workflow: WorkflowDefinition): this {
    this.workflows.set(name, workflow);
    return this;
  }

  run(name: string, input?: unknown): RunHandle {
    if (!this.workflows.has(name)) {
      throw new Error(`Workflow is not defined: ${name}`);
    }

    const executionId = randomUUID();
    const execution = this.createExecution(executionId, name, input);
    let status: RunStatus = "queued";
    let settled = false;
    let rejectWait: ((reason?: unknown) => void) | undefined;

    const waitPromise = new Promise<Execution>((resolve, reject) => {
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

        await this.emitEvent("error", executionId, {
          message: execution.error,
        });
        await this.emitEvent("execution_end", executionId, {
          workflowName: name,
          status: "aborted",
        });

        rejectWait?.(new Error(execution.error));
      },
    };

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
    bucket.add(handler as EventHandler);
    this.handlers.set(event, bucket);

    return () => {
      const current = this.handlers.get(event);
      if (!current) {
        return;
      }

      current.delete(handler as EventHandler);
      if (current.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  private createExecution(executionId: string, workflowName: string, input: unknown): Execution {
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

  private async emitEvent(type: AuditEventType, executionId: string, data: unknown): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      executionId,
      timestamp: new Date(),
      type,
      data,
    };

    if (this.config.audit?.enabled !== false) {
      await this.config.audit?.sink?.(event);
    }

    const handlers = this.handlers.get(type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    await Promise.all(
      [...handlers].map(async (handler) => {
        await handler(event);
      })
    );
  }
}

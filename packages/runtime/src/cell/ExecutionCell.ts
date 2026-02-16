import { randomUUID } from "node:crypto";
import { BaseActor } from "./BaseActor.js";
import type { IBlackboard } from "../_legacy/actor/types/blackboard.js";
import { createActorId } from "../_legacy/actor/types/actor.js";
import type { ActorId, ActorRole } from "../_legacy/actor/types/actor.js";
import type { IMessageBus, Message, MessageType } from "../_legacy/actor/types/message.js";
import { createAction } from "../_legacy/actor/types/action.js";
import { createObservation } from "../_legacy/actor/types/observation.js";
import { createFailureResult, createSuccessResult } from "../_legacy/actor/types/result.js";
import type {
  CellId,
  CellMetrics,
  CellResult,
  CellStatus,
  StateChange,
  Task,
  ToolCallRecord,
} from "./types.js";
import type { AuditRecorder, CellContext, StateAccessor, ToolSet } from "./CellContext.js";

export interface ExecutionCell {
  readonly id: CellId;
  readonly status: CellStatus;

  execute(task: Task): Promise<CellResult>;
  suspend(): Promise<void>;
  resume(): Promise<void>;
  abort(reason: string): Promise<void>;
}

interface DefaultExecutionCellOptions {
  id: CellId;
  context: CellContext;
  runTask?: (task: Task, context: CellContext) => Promise<unknown>;
  actorRole?: ActorRole;
  actorName?: string;
}

class NoOpMessageBus implements IMessageBus {
  send(_message: Message): void {}
  sendTo(_to: ActorId, _message: Omit<Message, "to">): void {}
  broadcast(_message: Omit<Message, "to">): void {}
  receive(_handler: (message: Message) => void): void {}
  request<T>(_message: Message, _timeoutMs?: number): Promise<Message<T>> {
    return Promise.reject(new Error("NoOpMessageBus does not support request"));
  }
  subscribe(_messageType: MessageType, _handler: (message: Message) => void): () => void {
    return () => {};
  }
  getQueueSize(_actorId: ActorId): number {
    return 0;
  }
  clearQueue(_actorId: ActorId): void {}
  filter(_predicate: (message: Message) => boolean): Message[] {
    return [];
  }
}

class BlackboardAdapter implements IBlackboard {
  private readonly keysSet = new Set<string>();

  constructor(private readonly accessor: StateAccessor) {}

  get version(): number {
    return this.keysSet.size;
  }

  read(key: string): unknown {
    return this.accessor.read(key);
  }

  write(key: string, value: unknown): void {
    this.keysSet.add(key);
    this.accessor.write(key, value);
  }

  delete(_key: string): void {}

  keys(): string[] {
    return [...this.keysSet];
  }

  find(pattern: string): string[] {
    return [...this.keysSet].filter((key) => key.includes(pattern));
  }
}

class CellActor extends BaseActor {
  private currentTask: Task | null = null;

  constructor(
    id: CellId,
    blackboard: IBlackboard,
    messageBus: IMessageBus,
    private readonly runner: (task: Task) => Promise<unknown>
  ) {
    super(createActorId("executor"), `cell-${id}`, "executor", blackboard, messageBus);
  }

  setTask(task: Task): void {
    this.currentTask = task;
  }

  async observe() {
    return createObservation({ actorId: this.id });
  }

  async think() {
    if (!this.currentTask) {
      throw new Error("Task is not set");
    }

    return createAction(this.id, "execute", { task: this.currentTask }, this.currentTask.id);
  }

  async act(action: ReturnType<typeof createAction>) {
    const task = (action.params?.task as Task | undefined) ?? this.currentTask;
    if (!task) {
      return createFailureResult(action.id, this.id, "Task is not set", 0);
    }

    const startedAt = Date.now();
    try {
      const output = await this.runner(task);
      return createSuccessResult(action.id, this.id, output, Date.now() - startedAt);
    } catch (error) {
      return createFailureResult(action.id, this.id, (error as Error).message, Date.now() - startedAt);
    }
  }
}

export class DefaultExecutionCell implements ExecutionCell {
  readonly id: CellId;

  private readonly actor: CellActor;
  private readonly rawContext: CellContext;
  private readonly defaultRunner: (task: Task, context: CellContext) => Promise<unknown>;
  private readonly stateChanges: StateChange[] = [];
  private readonly toolCalls: ToolCallRecord[] = [];
  private statusValue: CellStatus = "idle";
  private abortReason: string | null = null;
  private suspendedResolver: (() => void) | null = null;
  private suspendedWaiter: Promise<void> | null = null;

  constructor(options: DefaultExecutionCellOptions) {
    this.id = options.id;
    this.rawContext = options.context;
    this.defaultRunner =
      options.runTask ??
      (async (task, context) => {
        if (typeof task.input === "object" && task.input && "tool" in (task.input as Record<string, unknown>)) {
          const input = task.input as { tool: string; params?: unknown };
          return context.tools.invoke(input.tool, input.params ?? {});
        }
        return task.input;
      });

    const blackboard = new BlackboardAdapter(options.context.blackboard);
    const messageBus = new NoOpMessageBus();
    this.actor = new CellActor(this.id, blackboard, messageBus, async (task) => {
      await this.waitIfSuspended();
      this.throwIfAborted();
      return this.defaultRunner(task, this.buildInstrumentedContext(task));
    });
  }

  get status(): CellStatus {
    return this.statusValue;
  }

  async execute(task: Task): Promise<CellResult> {
    if (this.statusValue === "running") {
      throw new Error(`Cell ${this.id} is already running`);
    }

    this.abortReason = null;
    this.statusValue = "running";
    this.stateChanges.length = 0;
    this.toolCalls.length = 0;

    const startTime = new Date();
    const startMs = Date.now();

    try {
      await Promise.resolve(this.rawContext.policy?.beforeExecute?.(task));

      this.actor.setTask(task);
      const observation = await this.actor.observe();
      await this.waitIfSuspended();
      this.throwIfAborted();

      const action = await this.actor.think(observation);
      await this.waitIfSuspended();
      this.throwIfAborted();

      const execution = this.actor.act(action);
      const result = this.rawContext.config.timeout
        ? await this.withTimeout(execution, this.rawContext.config.timeout)
        : await execution;

      if (result.status !== "success") {
        throw new Error(result.error ?? "Cell execution failed");
      }

      const output = result.output;
      const endTime = new Date();
      const metrics: CellMetrics = {
        startTime,
        endTime,
        durationMs: endTime.getTime() - startMs,
        toolCallCount: this.toolCalls.length,
      };

      this.statusValue = "completed";
      await this.recordAudit("cell_end", { status: this.statusValue, taskId: task.id });
      await Promise.resolve(this.rawContext.policy?.afterExecute?.(task, { success: true, output }));

      return {
        success: true,
        output,
        stateChanges: [...this.stateChanges],
        toolCalls: [...this.toolCalls],
        metrics,
      };
    } catch (error) {
      const endTime = new Date();
      this.statusValue = "failed";
      await this.recordAudit("cell_error", {
        taskId: task.id,
        reason: (error as Error).message,
      });
      await Promise.resolve(
        this.rawContext.policy?.afterExecute?.(task, {
          success: false,
          output: { error: (error as Error).message },
        })
      );

      return {
        success: false,
        output: { error: (error as Error).message },
        stateChanges: [...this.stateChanges],
        toolCalls: [...this.toolCalls],
        metrics: {
          startTime,
          endTime,
          durationMs: endTime.getTime() - startMs,
          toolCallCount: this.toolCalls.length,
        },
      };
    }
  }

  async suspend(): Promise<void> {
    if (this.statusValue !== "running") {
      return;
    }
    this.statusValue = "suspended";
    this.suspendedWaiter = new Promise((resolve) => {
      this.suspendedResolver = resolve;
    });
  }

  async resume(): Promise<void> {
    if (this.statusValue !== "suspended") {
      return;
    }
    this.statusValue = "running";
    this.suspendedResolver?.();
    this.suspendedResolver = null;
    this.suspendedWaiter = null;
  }

  async abort(reason: string): Promise<void> {
    this.abortReason = reason;
    this.statusValue = "failed";
    this.suspendedResolver?.();
    this.suspendedResolver = null;
    this.suspendedWaiter = null;
  }

  private buildInstrumentedContext(task: Task): CellContext {
    return {
      ...this.rawContext,
      blackboard: this.wrapBlackboard(this.rawContext.blackboard),
      tools: this.wrapTools(this.rawContext.tools, task),
    };
  }

  private wrapBlackboard(accessor: StateAccessor): StateAccessor {
    return {
      read: (path: string) => accessor.read(path),
      write: (path: string, value: unknown) => {
        const oldValue = accessor.read(path);
        accessor.write(path, value);
        this.stateChanges.push({
          path,
          oldValue,
          newValue: value,
          timestamp: new Date(),
        });
      },
    };
  }

  private wrapTools(tools: ToolSet, task: Task): ToolSet {
    return {
      invoke: async (toolName: string, params: unknown) => {
        if (
          this.rawContext.config.maxToolCalls !== undefined &&
          this.toolCalls.length >= this.rawContext.config.maxToolCalls
        ) {
          throw new Error(`Tool call limit exceeded: ${this.rawContext.config.maxToolCalls}`);
        }

        await Promise.resolve(
          this.rawContext.policy?.beforeToolCall?.({
            cellId: this.id,
            toolName,
            params,
            task,
          })
        );

        const toolCallId = randomUUID();
        const startedAt = new Date();
        const start = Date.now();

        try {
          const result = await tools.invoke(toolName, params);
          const durationMs = Date.now() - start;
          const endedAt = new Date();

          this.toolCalls.push({
            id: toolCallId,
            toolName,
            params,
            status: "success",
            result,
            startedAt,
            endedAt,
            durationMs,
          });

          await this.recordAudit("tool_call", {
            cellId: this.id,
            toolCallId,
            toolName,
            durationMs,
            status: "success",
          });
          await this.recordAudit("tool_result", {
            cellId: this.id,
            toolCallId,
            toolName,
            durationMs,
          });

          await Promise.resolve(
            this.rawContext.policy?.afterToolCall?.({
              cellId: this.id,
              toolName,
              params,
              task,
              durationMs,
              result,
            })
          );

          return result;
        } catch (error) {
          const durationMs = Date.now() - start;
          const endedAt = new Date();
          const normalizedError = error instanceof Error ? error : new Error(String(error));

          this.toolCalls.push({
            id: toolCallId,
            toolName,
            params,
            status: "error",
            error: normalizedError.message,
            startedAt,
            endedAt,
            durationMs,
          });

          await this.recordAudit("tool_call", {
            cellId: this.id,
            toolCallId,
            toolName,
            durationMs,
            status: "error",
          });
          await this.recordAudit("tool_error", {
            cellId: this.id,
            toolCallId,
            toolName,
            durationMs,
            error: normalizedError.message,
          });

          await Promise.resolve(
            this.rawContext.policy?.afterToolCall?.({
              cellId: this.id,
              toolName,
              params,
              task,
              durationMs,
              error: normalizedError,
            })
          );

          throw normalizedError;
        }
      },
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Execution timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }

  private async waitIfSuspended(): Promise<void> {
    if (this.suspendedWaiter) {
      await this.suspendedWaiter;
    }
  }

  private throwIfAborted(): void {
    if (this.abortReason) {
      throw new Error(`Execution aborted: ${this.abortReason}`);
    }
  }

  private async recordAudit(eventType: string, data: Record<string, unknown>): Promise<void> {
    await Promise.resolve(this.rawContext.audit.record(eventType, data));
  }
}

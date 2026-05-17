import { ActorRuntime, ActorStopTimeoutError } from "./actor/runtime/ActorRuntime.js";
import { DefaultExecutionCell } from "./ExecutionCell.js";
import type { CellContext } from "./CellContext.js";
import type { CellConfig, CellId, CellResult, CellStatus, Task } from "./types.js";

export type CellDispatchStrategy = "fifo" | "priority";

export interface CellRegistrationOptions {
  id?: CellId;
  config?: CellConfig;
  context?: CellContext;
  runTask?: (task: Task, context: CellContext) => Promise<unknown>;
}

export interface CellManagerTaskOptions {
  priority?: number;
}

export interface CellManagerConfig {
  maxConcurrentExecutions?: number;
  maxQueuedExecutions?: number;
  dispatchStrategy?: CellDispatchStrategy;
  defaultCellConfig?: CellConfig;
  createCellContext: (cellId: CellId, config: CellConfig) => CellContext;
  createCell?: (options: {
    id: CellId;
    context: CellContext;
    config: CellConfig;
    runTask?: (task: Task, context: CellContext) => Promise<unknown>;
  }) => {
    readonly id: CellId;
    readonly status: CellStatus;
    execute(task: Task): Promise<CellResult>;
    suspend(): Promise<void>;
    resume(): Promise<void>;
    abort(reason: string): Promise<void>;
  };
}

export interface CellSnapshot {
  id: CellId;
  status: CellStatus;
  config: CellConfig;
}

interface QueueItem {
  cellId: CellId;
  task: Task;
  priority: number;
  enqueuedAt: number;
  resolve: (value: CellResult) => void;
  reject: (reason?: unknown) => void;
}

const DEFAULT_MAX_CONCURRENT_EXECUTIONS = 4;
const DEFAULT_MAX_QUEUED_EXECUTIONS = 200;
const DEFAULT_DISPATCH_STRATEGY: CellDispatchStrategy = "fifo";

export class CellManager {
  private readonly cells = new Map<
    CellId,
    {
      cell: {
        readonly id: CellId;
        readonly status: CellStatus;
        execute(task: Task): Promise<CellResult>;
        suspend(): Promise<void>;
        resume(): Promise<void>;
        abort(reason: string): Promise<void>;
      };
      config: CellConfig;
    }
  >();

  private readonly queue: QueueItem[] = [];
  private readonly inFlight = new Set<Promise<void>>();

  private readonly maxConcurrentExecutions: number;
  private readonly maxQueuedExecutions: number;
  private readonly dispatchStrategy: CellDispatchStrategy;
  private readonly defaultCellConfig: CellConfig;

  constructor(private readonly config: CellManagerConfig) {
    this.maxConcurrentExecutions =
      config.maxConcurrentExecutions ?? DEFAULT_MAX_CONCURRENT_EXECUTIONS;
    this.maxQueuedExecutions = config.maxQueuedExecutions ?? DEFAULT_MAX_QUEUED_EXECUTIONS;
    this.dispatchStrategy = config.dispatchStrategy ?? DEFAULT_DISPATCH_STRATEGY;
    this.defaultCellConfig = config.defaultCellConfig ?? {};

    this.validateConfig();
  }

  createCell(options: CellRegistrationOptions = {}): CellId {
    const cellId = options.id ?? crypto.randomUUID();

    if (this.cells.has(cellId)) {
      throw new Error(`Cell already exists: ${cellId}`);
    }

    const resolvedConfig = {
      ...this.defaultCellConfig,
      ...(options.config ?? {}),
    };

    const resolvedContext = options.context ?? this.config.createCellContext(cellId, resolvedConfig);

    const cell =
      this.config.createCell?.({
        id: cellId,
        context: resolvedContext,
        config: resolvedConfig,
        runTask: options.runTask,
      }) ??
      new DefaultExecutionCell({
        id: cellId,
        context: resolvedContext,
        runTask: options.runTask,
      });

    this.cells.set(cellId, {
      cell,
      config: resolvedConfig,
    });

    return cellId;
  }

  getCell(id: CellId) {
    return this.cells.get(id)?.cell;
  }

  getCellSnapshot(id: CellId): CellSnapshot | undefined {
    const entry = this.cells.get(id);
    if (!entry) {
      return undefined;
    }

    return {
      id,
      status: entry.cell.status,
      config: { ...entry.config },
    };
  }

  listCells(): CellSnapshot[] {
    return Array.from(this.cells.entries()).map(([id, entry]) => ({
      id,
      status: entry.cell.status,
      config: { ...entry.config },
    }));
  }

  async execute(cellId: CellId, task: Task, options: CellManagerTaskOptions = {}): Promise<CellResult> {
    if (!this.cells.has(cellId)) {
      throw new Error(`Cell not found: ${cellId}`);
    }

    if (this.queue.length >= this.maxQueuedExecutions) {
      throw new Error(`CellManager queue is full: ${this.maxQueuedExecutions}`);
    }

    return new Promise<CellResult>((resolve, reject) => {
      this.queue.push({
        cellId,
        task,
        priority: options.priority ?? task.priority ?? 0,
        enqueuedAt: Date.now(),
        resolve,
        reject,
      });

      this.processQueue();
    });
  }

  async suspendCell(id: CellId): Promise<void> {
    const cell = this.requireCell(id);
    await cell.suspend();
  }

  async resumeCell(id: CellId): Promise<void> {
    const cell = this.requireCell(id);
    await cell.resume();
    this.processQueue();
  }

  async stopCell(id: CellId, reason = "Cell stopped by manager"): Promise<void> {
    const cell = this.requireCell(id);
    await cell.abort(reason);
    this.cells.delete(id);
    this.rejectQueuedTasksForCell(id, reason);
  }

  async stopAll(reason = "CellManager stopped"): Promise<void> {
    const stopTasks = Array.from(this.cells.keys()).map((cellId) => this.stopCell(cellId, reason));
    await Promise.allSettled(stopTasks);
  }

  getQueueSize(): number {
    return this.queue.length;
  }

  getRunningCount(): number {
    return this.inFlight.size;
  }

  getStatus(): { totalCells: number; running: number; queued: number } {
    return {
      totalCells: this.cells.size,
      running: this.inFlight.size,
      queued: this.queue.length,
    };
  }

  private processQueue(): void {
    while (this.inFlight.size < this.maxConcurrentExecutions && this.queue.length > 0) {
      const next = this.pickNext();
      if (!next) {
        return;
      }

      const execution = this.runQueueItem(next)
        .catch((error) => {
          next.reject(error);
        })
        .finally(() => {
          this.inFlight.delete(execution);
          this.processQueue();
        });

      this.inFlight.add(execution);
    }
  }

  private pickNext(): QueueItem | undefined {
    if (this.queue.length === 0) {
      return undefined;
    }

    if (this.dispatchStrategy === "priority") {
      const selectedIndex = this.queue.reduce((bestIndex, current, index) => {
        const selected = this.queue[bestIndex]!;
        if (current.priority > selected.priority) return index;
        if (current.priority === selected.priority && current.enqueuedAt < selected.enqueuedAt) {
          return index;
        }
        return bestIndex;
      }, 0);

      return this.queue.splice(selectedIndex, 1)[0];
    }

    return this.queue.shift();
  }

  private async runQueueItem(item: QueueItem): Promise<void> {
    const cell = this.requireCell(item.cellId);
    const result = await cell.execute(item.task);
    item.resolve(result);
  }

  private requireCell(id: CellId) {
    const entry = this.cells.get(id);
    if (!entry) {
      throw new Error(`Cell not found: ${id}`);
    }
    return entry.cell;
  }

  private rejectQueuedTasksForCell(id: CellId, reason: string): void {
    const partitioned = this.queue.reduce<{ retained: QueueItem[]; rejected: QueueItem[] }>(
      (state, item) =>
        item.cellId === id
          ? { ...state, rejected: [...state.rejected, item] }
          : { ...state, retained: [...state.retained, item] },
      { retained: [], rejected: [] }
    );
    this.queue.splice(0, this.queue.length, ...partitioned.retained);
    partitioned.rejected.forEach((item) => item.reject(new Error(`Execution aborted: ${reason}`)));
  }

  private validateConfig(): void {
    if (this.maxConcurrentExecutions <= 0) {
      throw new Error("maxConcurrentExecutions must be positive");
    }

    if (this.maxQueuedExecutions <= 0) {
      throw new Error("maxQueuedExecutions must be positive");
    }

    if (this.dispatchStrategy !== "fifo" && this.dispatchStrategy !== "priority") {
      throw new Error(`Unsupported dispatch strategy: ${this.dispatchStrategy}`);
    }
  }
}

export { ActorRuntime, ActorStopTimeoutError };
export * from "./actor/runtime/ActorRuntime.js";

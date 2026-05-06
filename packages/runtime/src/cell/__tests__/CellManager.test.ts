import { describe, expect, it, vi } from "vitest";
import { CellManager } from "../CellManager.js";
import type { CellContext } from "../CellContext.js";
import type { Task } from "../types.js";

function createContext(cellId: string): CellContext {
  const state = new Map<string, unknown>();

  return {
    cellId,
    blackboard: {
      read: (path: string) => state.get(path),
      write: (path: string, value: unknown) => {
        state.set(path, value);
      },
    },
    tools: {
      invoke: async (toolName: string, params: unknown) => ({ toolName, params }),
    },
    audit: {
      record: () => {},
    },
    config: {},
  };
}

function createTask(id: string, waitMs: number): Task {
  return {
    id,
    type: "test",
    description: `task-${id}`,
    input: { waitMs },
    priority: 0,
  };
}

function deferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("CellManager", () => {
  it("creates and retrieves cells", () => {
    const manager = new CellManager({
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellId = manager.createCell({ id: "cell-a" });
    const snapshot = manager.getCellSnapshot(cellId);

    expect(snapshot?.id).toBe("cell-a");
    expect(snapshot?.status).toBe("idle");
    expect(manager.listCells()).toHaveLength(1);
  });

  it("runs tasks in parallel up to maxConcurrentExecutions", async () => {
    const started: string[] = [];
    let running = 0;
    let maxRunning = 0;

    const manager = new CellManager({
      maxConcurrentExecutions: 2,
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellA = manager.createCell({
      id: "cell-a",
      runTask: async (task) => {
        started.push(task.id);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 40));
        running -= 1;
        return { id: task.id };
      },
    });

    const cellB = manager.createCell({
      id: "cell-b",
      runTask: async (task) => {
        started.push(task.id);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 40));
        running -= 1;
        return { id: task.id };
      },
    });

    const cellC = manager.createCell({
      id: "cell-c",
      runTask: async (task) => {
        started.push(task.id);
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 40));
        running -= 1;
        return { id: task.id };
      },
    });

    await Promise.all([
      manager.execute(cellA, createTask("a", 40)),
      manager.execute(cellB, createTask("b", 40)),
      manager.execute(cellC, createTask("c", 40)),
    ]);

    expect(maxRunning).toBe(2);
    expect(started[0]).toBe("a");
    expect(started[1]).toBe("b");
    expect(started[2]).toBe("c");
  });

  it("supports priority dispatch strategy", async () => {
    const order: string[] = [];

    const manager = new CellManager({
      maxConcurrentExecutions: 1,
      dispatchStrategy: "priority",
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellA = manager.createCell({
      id: "cell-a",
      runTask: async (task) => {
        order.push(task.id);
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { id: task.id };
      },
    });

    const first = manager.execute(cellA, createTask("seed", 25), { priority: 0 });
    const second = manager.execute(cellA, createTask("low", 10), { priority: 1 });
    const third = manager.execute(cellA, createTask("high", 10), { priority: 100 });

    await Promise.all([first, second, third]);

    expect(order).toEqual(["seed", "high", "low"]);
  });

  it("rejects requests when queue capacity is exceeded", async () => {
    const manager = new CellManager({
      maxConcurrentExecutions: 1,
      maxQueuedExecutions: 1,
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellId = manager.createCell({
      id: "cell-a",
      runTask: async () => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { ok: true };
      },
    });

    const first = manager.execute(cellId, createTask("a", 40));
    const second = manager.execute(cellId, createTask("b", 40));

    await expect(manager.execute(cellId, createTask("c", 40))).rejects.toThrow(
      "CellManager queue is full"
    );

    await Promise.all([first, second]);
  });

  it("stops a cell and removes it from manager", async () => {
    const manager = new CellManager({
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellId = manager.createCell({ id: "cell-a" });
    await manager.stopCell(cellId, "done");

    expect(manager.getCell(cellId)).toBeUndefined();
    expect(manager.listCells()).toHaveLength(0);
  });

  it("validates manager config and reports missing cells", async () => {
    expect(
      () =>
        new CellManager({
          maxConcurrentExecutions: 0,
          createCellContext: (cellId) => createContext(cellId),
        }),
    ).toThrow("maxConcurrentExecutions must be positive");
    expect(
      () =>
        new CellManager({
          maxQueuedExecutions: 0,
          createCellContext: (cellId) => createContext(cellId),
        }),
    ).toThrow("maxQueuedExecutions must be positive");
    expect(
      () =>
        new CellManager({
          dispatchStrategy: "lifo" as unknown as "fifo",
          createCellContext: (cellId) => createContext(cellId),
        }),
    ).toThrow("Unsupported dispatch strategy: lifo");

    const manager = new CellManager({
      createCellContext: (cellId) => createContext(cellId),
    });

    expect(manager.getCell("missing")).toBeUndefined();
    expect(manager.getCellSnapshot("missing")).toBeUndefined();
    await expect(manager.execute("missing", createTask("missing", 0))).rejects.toThrow("Cell not found: missing");
    await expect(manager.suspendCell("missing")).rejects.toThrow("Cell not found: missing");
    await expect(manager.resumeCell("missing")).rejects.toThrow("Cell not found: missing");
    await expect(manager.stopCell("missing")).rejects.toThrow("Cell not found: missing");
  });

  it("rejects duplicate cells and snapshots cloned config", () => {
    const manager = new CellManager({
      defaultCellConfig: { timeout: 100, maxToolCalls: 3 },
      createCellContext: (cellId) => createContext(cellId),
    });

    const cellId = manager.createCell({ id: "cell-a", config: { timeout: 50 } });

    expect(() => manager.createCell({ id: cellId })).toThrow("Cell already exists: cell-a");

    const snapshot = manager.getCellSnapshot(cellId);
    expect(snapshot?.config).toEqual({ timeout: 50, maxToolCalls: 3 });
    snapshot!.config.timeout = 999;
    expect(manager.getCellSnapshot(cellId)?.config.timeout).toBe(50);
  });

  it("rejects queued work when a cell is stopped", async () => {
    const release = deferred();
    const manager = new CellManager({
      maxConcurrentExecutions: 1,
      createCellContext: (cellId) => createContext(cellId),
    });
    const cellId = manager.createCell({
      id: "cell-a",
      runTask: async () => {
        await release.promise;
        return { ok: true };
      },
    });

    const first = manager.execute(cellId, createTask("first", 0));
    const queued = manager.execute(cellId, createTask("queued", 0));

    expect(manager.getStatus()).toMatchObject({ totalCells: 1, queued: 1 });
    await manager.stopCell(cellId, "shutdown");
    release.resolve();

    await expect(queued).rejects.toThrow("Execution aborted: shutdown");
    await expect(first).resolves.toMatchObject({
      success: false,
      output: { error: "Execution aborted: shutdown" },
    });
    expect(manager.getStatus()).toEqual({ totalCells: 0, running: 0, queued: 0 });
  });

  it("rejects queue items when a custom cell throws", async () => {
    const manager = new CellManager({
      maxConcurrentExecutions: 1,
      createCellContext: (cellId) => createContext(cellId),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async () => {
          throw new Error("cell exploded");
        },
        suspend: vi.fn(),
        resume: vi.fn(),
        abort: vi.fn(),
      }),
    });
    const cellId = manager.createCell({ id: "cell-a" });

    await expect(manager.execute(cellId, createTask("boom", 0))).rejects.toThrow("cell exploded");
    expect(manager.getRunningCount()).toBe(0);
  });

  it("delegates suspend, resume, stopAll, and custom cell creation", async () => {
    const suspend = vi.fn();
    const resume = vi.fn();
    const abort = vi.fn();
    const manager = new CellManager({
      createCellContext: (cellId) => createContext(cellId),
      createCell: ({ id }) => ({
        id,
        status: "idle",
        execute: async (task) => ({
          success: true,
          output: task.id,
          stateChanges: [],
          toolCalls: [],
          metrics: {
            startTime: new Date(),
            endTime: new Date(),
            durationMs: 0,
            toolCallCount: 0,
          },
        }),
        suspend,
        resume,
        abort,
      }),
    });

    const cellA = manager.createCell({ id: "cell-a" });
    const cellB = manager.createCell({ id: "cell-b" });

    await manager.suspendCell(cellA);
    await manager.resumeCell(cellA);
    await expect(manager.execute(cellB, createTask("custom", 0))).resolves.toMatchObject({
      success: true,
      output: "custom",
    });
    await manager.stopAll("stop all");

    expect(suspend).toHaveBeenCalledOnce();
    expect(resume).toHaveBeenCalledOnce();
    expect(abort).toHaveBeenCalledTimes(2);
    expect(manager.listCells()).toHaveLength(0);
  });
});

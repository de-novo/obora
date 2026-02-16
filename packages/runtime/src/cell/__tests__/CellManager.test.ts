import { describe, expect, it } from "vitest";
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
});

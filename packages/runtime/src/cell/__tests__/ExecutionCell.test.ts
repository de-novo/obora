import { describe, expect, it, vi } from "vitest";
import { DefaultExecutionCell } from "../ExecutionCell.js";
import type { CellContext } from "../CellContext.js";
import type { Task } from "../types.js";

function createContext(overrides?: Partial<CellContext>): CellContext {
  const state = new Map<string, unknown>();

  const ctx: CellContext = {
    cellId: "cell-test",
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

  return {
    ...ctx,
    ...overrides,
  };
}

function createTask(input: unknown = { message: "ok" }): Task {
  return {
    id: "task-1",
    type: "test",
    description: "test task",
    input,
    priority: 1,
  };
}

describe("DefaultExecutionCell", () => {
  it("starts with idle status", () => {
    const cell = new DefaultExecutionCell({
      id: "cell-1",
      context: createContext(),
    });

    expect(cell.status).toBe("idle");
  });

  it("transitions running to completed on execute success", async () => {
    let observedStatus: string | null = null;
    const cell = new DefaultExecutionCell({
      id: "cell-2",
      context: createContext(),
      runTask: async () => {
        observedStatus = cell.status;
        return { done: true };
      },
    });

    const result = await cell.execute(createTask());

    expect(observedStatus).toBe("running");
    expect(cell.status).toBe("completed");
    expect(result.success).toBe(true);
  });

  it("transitions to failed on execute failure", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-3",
      context: createContext(),
      runTask: async () => {
        throw new Error("boom");
      },
    });

    const result = await cell.execute(createTask());

    expect(cell.status).toBe("failed");
    expect(result.success).toBe(false);
  });

  it("supports suspend and resume", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-4",
      context: createContext(),
      runTask: async (_task, context) => {
        await context.tools.invoke("slow-tool", { value: 1 });
        return { ok: true };
      },
    });

    const runPromise = cell.execute(createTask({ tool: "slow-tool", params: { value: 1 } }));

    await cell.suspend();
    expect(cell.status).toBe("suspended");

    await cell.resume();
    expect(cell.status).toBe("running");

    const result = await runPromise;
    expect(result.success).toBe(true);
    expect(cell.status).toBe("completed");
  });

  it("aborts immediately", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-5",
      context: createContext(),
      runTask: async () => {
        await new Promise((resolve) => setTimeout(resolve, 30));
        return { ok: true };
      },
    });

    const runPromise = cell.execute(createTask());
    await cell.abort("stop now");

    const result = await runPromise;

    expect(cell.status).toBe("failed");
    expect(result.success).toBe(false);
  });

  it("records tool calls automatically", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-6",
      context: createContext(),
      runTask: async (_task, context) => {
        return context.tools.invoke("echo", { hello: "world" });
      },
    });

    const result = await cell.execute(createTask());

    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("echo");
    expect(result.metrics.toolCallCount).toBe(1);
  });

  it("tracks metrics timestamps and duration", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-7",
      context: createContext(),
      runTask: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { done: true };
      },
    });

    const result = await cell.execute(createTask());

    expect(result.metrics.startTime).toBeInstanceOf(Date);
    expect(result.metrics.endTime).toBeInstanceOf(Date);
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.metrics.endTime.getTime()).toBeGreaterThanOrEqual(result.metrics.startTime.getTime());
  });

  it("invokes policy hooks around execution and tool calls", async () => {
    const beforeExecute = vi.fn();
    const afterExecute = vi.fn();
    const beforeToolCall = vi.fn();
    const afterToolCall = vi.fn();

    const cell = new DefaultExecutionCell({
      id: "cell-8",
      context: createContext({
        policy: {
          beforeExecute,
          afterExecute,
          beforeToolCall,
          afterToolCall,
        },
      }),
      runTask: async (_task, context) => {
        return context.tools.invoke("echo", { foo: "bar" });
      },
    });

    const result = await cell.execute(createTask());

    expect(result.success).toBe(true);
    expect(beforeExecute).toHaveBeenCalledTimes(1);
    expect(afterExecute).toHaveBeenCalledTimes(1);
    expect(beforeToolCall).toHaveBeenCalledTimes(1);
    expect(afterToolCall).toHaveBeenCalledTimes(1);
  });

  it("tracks failed tool call records", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-9",
      context: createContext({
        tools: {
          invoke: async () => {
            throw new Error("tool failed");
          },
        },
      }),
      runTask: async (_task, context) => context.tools.invoke("fail-tool", { a: 1 }),
    });

    const result = await cell.execute(createTask());

    expect(result.success).toBe(false);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("fail-tool");
    expect(result.toolCalls[0].status).toBe("error");
    expect(result.toolCalls[0].error).toBe("tool failed");
  });
});

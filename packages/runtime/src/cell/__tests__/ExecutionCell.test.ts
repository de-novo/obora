import { describe, expect, it, vi } from "vitest";
import { DefaultExecutionCell } from "../ExecutionCell.js";
import type { IBlackboard } from "../actor/types/blackboard.js";
import { createActorId } from "../actor/types/actor.js";
import type { IMessageBus, Message } from "../actor/types/message.js";
import { createMessageId, MessageType } from "../actor/types/message.js";
import type { CellContext } from "../CellContext.js";
import type { Task } from "../types.js";

function createContext(overrides?: Partial<CellContext> & { state?: Map<string, unknown> }): CellContext {
  const { state: providedState, ...contextOverrides } = overrides ?? {};
  const state = new Map<string, unknown>();
  const resolvedState = providedState ?? state;

  const ctx: CellContext = {
    cellId: "cell-test",
    blackboard: {
      read: (path: string) => resolvedState.get(path),
      write: (path: string, value: unknown) => {
        resolvedState.set(path, value);
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
    ...contextOverrides,
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

interface ExecutionCellInternals {
  actor: {
    id: ReturnType<typeof createActorId>;
    board: IBlackboard;
    messageBus: IMessageBus;
  };
}

function getInternals(cell: DefaultExecutionCell): ExecutionCellInternals {
  return cell as unknown as ExecutionCellInternals;
}

function createMessage(to: ReturnType<typeof createActorId>): Message {
  return {
    id: createMessageId(`msg-${crypto.randomUUID()}`),
    type: MessageType.PING,
    from: createActorId("analyst"),
    to,
    payload: { ok: true },
    timestamp: new Date(),
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

  it("uses the default runner for plain inputs and tool inputs", async () => {
    const auditEvents: Array<{ eventType: string; data: Record<string, unknown> }> = [];
    const cell = new DefaultExecutionCell({
      id: "cell-10",
      context: createContext({
        audit: {
          record: (eventType, data) => {
            auditEvents.push({ eventType, data });
          },
        },
      }),
    });

    const plainResult = await cell.execute(createTask({ value: "plain" }));
    const toolResult = await cell.execute(createTask({ tool: "echo", params: { value: "tool" } }));

    expect(plainResult).toMatchObject({
      success: true,
      output: { value: "plain" },
      toolCalls: [],
    });
    expect(toolResult.success).toBe(true);
    expect(toolResult.output).toEqual({ toolName: "echo", params: { value: "tool" } });
    expect(toolResult.toolCalls).toHaveLength(1);
    expect(auditEvents.map((event) => event.eventType)).toEqual([
      "cell_end",
      "tool_call",
      "tool_result",
      "cell_end",
    ]);
  });

  it("tracks blackboard writes as state changes", async () => {
    const state = new Map<string, unknown>([["draft.title", "old"]]);
    const cell = new DefaultExecutionCell({
      id: "cell-11",
      context: createContext({ state }),
      runTask: async (_task, context) => {
        context.blackboard.write("draft.title", "new");
        context.blackboard.write("draft.status", "ready");
        return context.blackboard.read("draft.title");
      },
    });

    const result = await cell.execute(createTask());

    expect(result.success).toBe(true);
    expect(result.output).toBe("new");
    expect(result.stateChanges).toHaveLength(2);
    expect(result.stateChanges[0]).toMatchObject({
      path: "draft.title",
      oldValue: "old",
      newValue: "new",
    });
    expect(result.stateChanges[1]).toMatchObject({
      path: "draft.status",
      oldValue: undefined,
      newValue: "ready",
    });
  });

  it("rejects overlapping executions and treats idle suspend or resume as no-ops", async () => {
    let releaseTask!: () => void;
    const cell = new DefaultExecutionCell({
      id: "cell-12",
      context: createContext(),
      runTask: async () => {
        await new Promise<void>((resolve) => {
          releaseTask = resolve;
        });
        return { done: true };
      },
    });

    await cell.suspend();
    await cell.resume();
    expect(cell.status).toBe("idle");

    const running = cell.execute(createTask());
    await expect(cell.execute(createTask({ id: "second" }))).rejects.toThrow("Cell cell-12 is already running");

    releaseTask();
    await expect(running).resolves.toMatchObject({ success: true });
  });

  it("enforces tool call limits before invoking tools", async () => {
    const invoke = vi.fn(async (toolName: string, params: unknown) => ({ toolName, params }));
    const afterExecute = vi.fn();
    const afterToolCall = vi.fn();
    const cell = new DefaultExecutionCell({
      id: "cell-13",
      context: createContext({
        config: { maxToolCalls: 1 },
        tools: { invoke },
        policy: { afterExecute, afterToolCall },
      }),
      runTask: async (_task, context) => {
        await context.tools.invoke("first", { ok: true });
        return context.tools.invoke("second", { ok: false });
      },
    });

    const result = await cell.execute(createTask());

    expect(result.success).toBe(false);
    expect(result.output).toEqual({ error: "Tool call limit exceeded: 1" });
    expect(result.toolCalls).toHaveLength(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(afterToolCall).toHaveBeenCalledTimes(1);
    expect(afterExecute).toHaveBeenCalledWith(expect.anything(), {
      success: false,
      output: { error: "Tool call limit exceeded: 1" },
    });
  });

  it("normalizes non-Error tool failures", async () => {
    const afterToolCall = vi.fn();
    const cell = new DefaultExecutionCell({
      id: "cell-14",
      context: createContext({
        tools: {
          invoke: async () => {
            throw "plain failure";
          },
        },
        policy: { afterToolCall },
      }),
      runTask: async (_task, context) => context.tools.invoke("plain-fail", {}),
    });

    const result = await cell.execute(createTask());

    expect(result.success).toBe(false);
    expect(result.output).toEqual({ error: "plain failure" });
    expect(result.toolCalls[0]).toMatchObject({
      toolName: "plain-fail",
      status: "error",
      error: "plain failure",
    });
    expect(afterToolCall).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(Error) }));
  });

  it("reports policy and timeout failures through failed execution results", async () => {
    const afterExecute = vi.fn();
    const policyFailureCell = new DefaultExecutionCell({
      id: "cell-15",
      context: createContext({
        policy: {
          beforeExecute: () => {
            throw new Error("policy denied");
          },
          afterExecute,
        },
      }),
    });

    await expect(policyFailureCell.execute(createTask())).resolves.toMatchObject({
      success: false,
      output: { error: "policy denied" },
    });
    expect(afterExecute).toHaveBeenCalledWith(expect.anything(), {
      success: false,
      output: { error: "policy denied" },
    });

    const timeoutCell = new DefaultExecutionCell({
      id: "cell-16",
      context: createContext({ config: { timeout: 1 } }),
      runTask: async () => new Promise(() => {}),
    });

    await expect(timeoutCell.execute(createTask())).resolves.toMatchObject({
      success: false,
      output: { error: "Execution timed out after 1ms" },
    });
    expect(timeoutCell.status).toBe("failed");
  });

  it("exposes a no-op message bus that is safe for actor lifecycle hooks", async () => {
    const cell = new DefaultExecutionCell({
      id: "cell-bus",
      context: createContext(),
    });
    const { actor } = getInternals(cell);
    const message = createMessage(actor.id);
    const messageWithoutTo: Omit<Message, "to"> = {
      id: message.id,
      type: message.type,
      from: message.from,
      payload: message.payload,
      timestamp: message.timestamp,
    };

    actor.messageBus.send(message);
    actor.messageBus.sendTo(actor.id, messageWithoutTo);
    actor.messageBus.broadcast(messageWithoutTo);
    actor.messageBus.receive(() => {
      throw new Error("no-op bus should not invoke receive handlers");
    });
    actor.messageBus.clearQueue(actor.id);

    const unsubscribe = actor.messageBus.subscribe(MessageType.PING, () => {
      throw new Error("no-op bus should not invoke subscribers");
    });

    expect(unsubscribe()).toBeUndefined();
    expect(actor.messageBus.getQueueSize(actor.id)).toBe(0);
    expect(actor.messageBus.filter(() => true)).toEqual([]);
    await expect(actor.messageBus.request(message)).rejects.toThrow(
      "NoOpMessageBus does not support request"
    );
  });

  it("adapts cell state access through the actor blackboard surface", () => {
    const state = new Map<string, unknown>([["draft.title", "old"]]);
    const cell = new DefaultExecutionCell({
      id: "cell-board",
      context: createContext({ state }),
    });
    const { board } = getInternals(cell).actor;

    expect(board.version).toBe(0);
    expect(board.read("missing.path")).toBeUndefined();

    board.write("draft.title", "new");
    board.write("draft.status", "ready");

    expect(board.version).toBe(2);
    expect(board.read("draft.title")).toBe("new");
    expect(board.keys()).toEqual(["draft.title", "draft.status"]);
    expect(board.find("status")).toEqual(["draft.status"]);

    board.delete("draft.title");
    expect(board.read("draft.title")).toBe("new");
  });
});

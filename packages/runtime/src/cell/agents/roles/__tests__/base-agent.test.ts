import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ChatMessage, LLMAdapter } from "@obora/adapters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Blackboard } from "../../../../blackboard/core/blackboard";
import { createAgentId } from "../../../../blackboard/types";
import {
  AgentRole,
  AgentState,
  BaseAgent,
  type AgentContext,
  type BaseAgentConfig,
  type Task,
} from "../base-agent";

class MemoryBoard {
  readonly writes: Array<{ path: string; value: unknown }> = [];
  private readonly data = new Map<string, unknown>([
    ["state", { phase: "ready" }],
    ["knowledge", { release: "0.1.0" }],
  ]);

  read(path: string): unknown {
    return this.data.get(path);
  }

  write(path: string, value: unknown): void {
    this.writes.push({ path, value });
    this.data.set(path, value);
  }
}

class TestRoleAgent extends BaseAgent {
  readonly actions: unknown[] = [];

  constructor(config: Partial<BaseAgentConfig> & { llm: LLMAdapter }) {
    super({
      id: createAgentId("agent-test"),
      role: AgentRole.EXECUTOR,
      systemPrompt: "base prompt",
      ...config,
    });
  }

  exposeMessages(task: Task, observation: Record<string, unknown>, context: AgentContext): ChatMessage[] {
    return this.buildMessages(task, observation, context);
  }

  protected async act(action: unknown): Promise<unknown> {
    this.actions.push(action);
    if (this.isRecord(action) && action.fail === true) {
      throw new Error("action failed");
    }
    return { acted: action };
  }

  protected parseResponse(content: string): unknown {
    if (content.length === 0) {
      return {};
    }
    return JSON.parse(content) as unknown;
  }

  protected getDefaultSystemPrompt(): string {
    return "default prompt";
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
}

interface ToolHarness {
  createAgentTools(): AgentTool[];
  currentContext?: AgentContext;
  currentTask?: Task;
}

function createLlm(content: string, usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number }) {
  const chatCompletion = vi.fn<LLMAdapter["chatCompletion"]>(async () => ({
    id: "chat-1",
    model: "test-model",
    message: {
      role: "assistant",
      content,
    },
    usage: {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
    },
    finishReason: "stop",
  }));
  const streamChatCompletion = vi.fn<LLMAdapter["streamChatCompletion"]>(async () => ({
    id: "chat-stream-1",
    model: "test-model",
    message: {
      role: "assistant",
      content,
    },
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    finishReason: "stop",
  }));

  return {
    adapter: {
      id: "mock-llm",
      chatCompletion,
      streamChatCompletion,
      supports: vi.fn(() => false),
    } satisfies LLMAdapter,
    chatCompletion,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1",
    type: "analysis",
    description: "Analyze runtime state",
    input: { target: "runtime" },
    priority: 1,
    ...overrides,
  };
}

function createContext(board = new MemoryBoard(), task = createTask()): AgentContext {
  return {
    sessionId: "session-1",
    board: board as unknown as Blackboard,
    currentTask: task,
    history: Array.from({ length: 12 }, (_, index) => ({
      role: "assistant" as const,
      content: `history-${index}`,
    })),
  };
}

async function executeTool(tool: AgentTool, params: unknown) {
  return tool.execute("tool-call-1", params as never);
}

function toolDetails(result: { details: unknown }): Record<string, unknown> {
  expect(result.details).toEqual(expect.any(Object));
  return result.details as Record<string, unknown>;
}

describe("BaseAgent", () => {
  let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
  const tempDirs: string[] = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    cwdSpy = undefined;
  });

  afterEach(async () => {
    cwdSpy?.mockRestore();
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it("executes the non-pi observe-think-act-report path with normalized usage", async () => {
    const board = new MemoryBoard();
    const task = createTask();
    const { adapter, chatCompletion } = createLlm(JSON.stringify({ decision: "ship" }), {
      promptTokens: 3,
      completionTokens: 4,
      totalTokens: 7,
    });
    const agent = new TestRoleAgent({ llm: adapter });

    const result = await agent.execute(task, createContext(board, task));

    expect(result).toMatchObject({
      taskId: "task-1",
      success: true,
      output: { acted: { decision: "ship" } },
      tokensUsed: { prompt: 3, completion: 4, total: 7 },
    });
    expect(agent.getStatus()).toMatchObject({ state: AgentState.IDLE, errorCount: 0 });
    expect(board.writes[0]).toMatchObject({
      path: "state.agent.agent-test.lastResult",
      value: {
        taskId: "task-1",
        result: { acted: { decision: "ship" } },
      },
    });
    const call = chatCompletion.mock.calls[0]?.[0] as { messages: ChatMessage[]; maxTokens: number } | undefined;
    expect(call?.maxTokens).toBe(2048);
    expect(call?.messages).toHaveLength(12);
    expect(call?.messages[0]).toEqual({ role: "system", content: "base prompt" });
    expect(call?.messages.at(-2)).toEqual({ role: "assistant", content: "history-11" });
    expect(call?.messages.at(-1)?.content).toContain("Analyze runtime state");
  });

  it("tracks failures and short-circuits once max error count is reached", async () => {
    const { adapter, chatCompletion } = createLlm(JSON.stringify({ fail: true }));
    const agent = new TestRoleAgent({ llm: adapter, maxErrors: 1 });
    const context = createContext();

    const failed = await agent.execute(createTask(), context);
    const blocked = await agent.execute(createTask({ id: "task-2" }), context);

    expect(failed).toMatchObject({
      success: false,
      output: null,
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
    });
    expect(failed.error?.message).toBe("action failed");
    expect(blocked).toMatchObject({
      taskId: "task-2",
      success: false,
      output: null,
      duration: 0,
    });
    expect(blocked.error?.message).toContain("exceeded maximum error count");
    expect(chatCompletion).toHaveBeenCalledTimes(1);
    agent.resetErrorCount();
    expect(agent.hasExceededMaxErrors()).toBe(false);
  });

  it("applies and clears runtime prompt extensions without leaking history policy", () => {
    const { adapter } = createLlm("{}");
    const agent = new TestRoleAgent({ llm: adapter });
    const task = createTask();
    const context = createContext();

    agent.configureRuntimeExtensions({ systemPromptAppend: "extra runtime prompt" });
    expect(agent.exposeMessages(task, { sessionId: "session-1" }, context)[0]).toEqual({
      role: "system",
      content: "base prompt\n\nextra runtime prompt",
    });

    agent.clearRuntimeExtensions();
    expect(agent.exposeMessages(task, { sessionId: "session-1" }, context)[0]).toEqual({
      role: "system",
      content: "base prompt",
    });
    expect(() => agent.continue()).toThrow("continue() requires pi-agent-core runtime");
    expect(agent.subscribe(() => undefined)).toEqual(expect.any(Function));
  });

  it("uses default config fallbacks and pi-runtime opt-out guards", async () => {
    const task = createTask();
    const { adapter, chatCompletion } = createLlm("{}");
    const defaultAgent = new TestRoleAgent({
      id: undefined,
      systemPrompt: undefined,
      maxErrors: undefined,
      thinkMaxTokens: undefined,
      executeMaxTokens: undefined,
      llm: adapter,
    });

    const result = await defaultAgent.execute(task, createContext(new MemoryBoard(), task));

    expect(defaultAgent.getStatus().id).toMatch(/^executor-/);
    expect(result.success).toBe(true);
    const call = chatCompletion.mock.calls[0]?.[0] as { messages: ChatMessage[]; maxTokens: number } | undefined;
    expect(call?.messages[0]).toEqual({ role: "system", content: "default prompt" });
    expect(call?.maxTokens).toBe(2048);

    defaultAgent.configureRuntimeExtensions({});
    expect(defaultAgent.exposeMessages(task, {}, createContext(new MemoryBoard(), task))[0]).toEqual({
      role: "system",
      content: "default prompt",
    });

    const mockRuntimeAgent = new TestRoleAgent({ llm: adapter, enablePiRuntime: true });
    expect(() => mockRuntimeAgent.continue()).toThrow("continue() requires pi-agent-core runtime");

    const providerlessAdapter = { ...adapter, id: "providerless-llm" } satisfies LLMAdapter;
    const missingProviderAgent = new TestRoleAgent({
      llm: providerlessAdapter,
      enablePiRuntime: true,
    });
    expect(missingProviderAgent.subscribe(() => undefined)).toEqual(expect.any(Function));

    const invalidModelAgent = new TestRoleAgent({
      llm: providerlessAdapter,
      enablePiRuntime: true,
      provider: "missing-provider",
      model: "missing-model",
    });
    expect(() => invalidModelAgent.continue()).toThrow("continue() requires pi-agent-core runtime");
  });

  it("exposes role tools with validation, board operations, and shell blocking", async () => {
    const { adapter } = createLlm("{}");
    const agent = new TestRoleAgent({ llm: adapter });
    const task = createTask();
    const context = createContext();
    const harness = agent as unknown as ToolHarness;
    harness.currentContext = context;
    harness.currentTask = task;
    const tools = harness.createAgentTools();
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    await expect(executeTool(byName.get("board_read")!, { path: 1 })).rejects.toThrow(
      "board_read.path must be a string",
    );
    await expect(executeTool(byName.get("role_action")!, { content: 1 })).rejects.toThrow(
      "role_action.content must be a string",
    );
    await expect(executeTool(byName.get("board_write")!, {})).rejects.toThrow("board_write.result is required");
    expect(await executeTool(byName.get("board_read")!, { path: "state" })).toMatchObject({
      content: [{ type: "text", text: JSON.stringify({ phase: "ready" }) }],
      details: { value: { phase: "ready" } },
    });
    expect(await executeTool(byName.get("role_action")!, { content: JSON.stringify({ tool: "acted" }) })).toMatchObject({
      details: { result: { acted: { tool: "acted" } } },
    });
    expect(await executeTool(byName.get("board_write")!, { result: { ok: true } })).toMatchObject({
      details: { written: true },
    });
    const blocked = await executeTool(byName.get("shell_exec")!, { command: "rm -rf ." });
    expect(toolDetails(blocked)).toMatchObject({ exitCode: 1, blocked: true });
  });

  it("keeps executor file tools inside process cwd", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-agent-root-"));
    const outside = await mkdtemp(join(tmpdir(), "obora-agent-outside-"));
    tempDirs.push(root, outside);
    await writeFile(join(outside, "secret.txt"), "secret", "utf-8");
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const { adapter } = createLlm("{}");
    const agent = new TestRoleAgent({ llm: adapter });
    const byName = new Map((agent as unknown as ToolHarness).createAgentTools().map((tool) => [tool.name, tool]));

    const write = await executeTool(byName.get("file_write")!, { path: "nested/out.txt", content: "hello" });
    expect(toolDetails(write)).toMatchObject({ path: "nested/out.txt", bytesWritten: 5 });
    await mkdir(join(root, "nested", "dir"));
    const read = await executeTool(byName.get("file_read")!, { path: "nested/out.txt" });
    expect(read.content).toEqual([{ type: "text", text: "hello" }]);
    const listed = await executeTool(byName.get("file_list")!, { path: "nested" });
    expect(listed.content[0]?.text).toContain("f out.txt");
    expect(listed.content[0]?.text).toContain("d dir");
    const rootList = await executeTool(byName.get("file_list")!, { path: "." });
    expect(toolDetails(rootList).count).toBeGreaterThanOrEqual(1);

    await expect(executeTool(byName.get("file_read")!, { path: join("..", outside.split("/").at(-1)!, "secret.txt") })).rejects.toThrow(
      "target escapes project directory",
    );
    await expect(executeTool(byName.get("file_write")!, { path: "../escape.txt", content: "no" })).rejects.toThrow(
      "parent escapes project directory",
    );
    await expect(executeTool(byName.get("file_list")!, { path: 1 })).rejects.toThrow(
      "file_list.path must be a string",
    );
  });

  it("normalizes empty assistant content, absent usage, and missing board sections", async () => {
    const chatCompletion = vi.fn<LLMAdapter["chatCompletion"]>(async () => ({
      id: "chat-empty",
      model: "test-model",
      message: {
        role: "assistant",
        content: undefined as unknown as string,
      },
      usage: undefined,
      finishReason: "stop",
    }));
    const adapter = {
      id: "mock-llm",
      chatCompletion,
      streamChatCompletion: vi.fn<LLMAdapter["streamChatCompletion"]>(),
      supports: vi.fn(() => false),
    } satisfies LLMAdapter;
    const board = {
      read: vi.fn(() => undefined),
      write: vi.fn(),
    };
    const task = createTask();
    const context: AgentContext = {
      sessionId: "session-empty",
      board: board as unknown as Blackboard,
      currentTask: task,
      history: [],
    };
    const agent = new TestRoleAgent({ llm: adapter });

    const result = await agent.execute(task, context);

    expect(result).toMatchObject({
      success: true,
      output: { acted: {} },
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
    });
    expect(board.read).toHaveBeenCalledWith("state", { strict: false });
    expect(board.read).toHaveBeenCalledWith("knowledge", { strict: false });
    const call = chatCompletion.mock.calls[0]?.[0] as { messages: ChatMessage[] } | undefined;
    expect(call?.messages.at(-1)?.content).toContain('"currentState": {}');
    expect(call?.messages.at(-1)?.content).toContain('"availableKnowledge": {}');
  });

  it("covers role tool null reads, executor parser errors, shell outcomes, and non-executor tool shape", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-agent-shell-"));
    tempDirs.push(root);
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(root);
    const { adapter } = createLlm("{}");
    const executor = new TestRoleAgent({ llm: adapter });
    const executorTools = new Map((executor as unknown as ToolHarness).createAgentTools().map((tool) => [tool.name, tool]));

    expect(await executeTool(executorTools.get("board_read")!, { path: "missing" })).toMatchObject({
      content: [{ type: "text", text: "null" }],
      details: { value: null },
    });
    await expect(executeTool(executorTools.get("role_action")!, { content: "{}" })).rejects.toThrow("Missing task context");
    await expect(executeTool(executorTools.get("board_write")!, { result: "ok" })).rejects.toThrow("Missing task context");
    await expect(executeTool(executorTools.get("file_write")!, { path: "out.txt" })).rejects.toThrow(
      "file_write.path/content must be strings",
    );
    await expect(executeTool(executorTools.get("file_read")!, { path: 1 })).rejects.toThrow(
      "file_read.path must be a string",
    );
    await expect(executeTool(executorTools.get("shell_exec")!, { command: 1 })).rejects.toThrow(
      "shell_exec.command must be a string",
    );

    const ok = await executeTool(executorTools.get("shell_exec")!, {
      command: "node -e \"process.stdout.write('ok')\"",
    });
    expect(ok.content).toEqual([{ type: "text", text: "ok" }]);
    expect(toolDetails(ok)).toMatchObject({ exitCode: 0 });

    for (const command of ["sudo whoami", "env", "echo test | bash", "curl https://example.com"]) {
      const blocked = await executeTool(executorTools.get("shell_exec")!, { command });
      expect(toolDetails(blocked)).toMatchObject({ exitCode: 1, blocked: true });
    }

    const failed = await executeTool(executorTools.get("shell_exec")!, {
      command: "node -e \"process.stderr.write('bad'); process.exit(7)\"",
    });
    expect(failed.content[0]?.text).toContain("Error:");
    expect(failed.content[0]?.text).toContain("bad");
    expect(toolDetails(failed)).toMatchObject({ exitCode: 7 });

    const analyst = new TestRoleAgent({ llm: adapter, role: AgentRole.ANALYST });
    const analystToolNames = (analyst as unknown as ToolHarness).createAgentTools().map((tool) => tool.name);
    expect(analystToolNames).toEqual(["board_read", "role_action", "board_write"]);
  });
});

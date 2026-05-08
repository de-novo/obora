import { getModel, EventStream, type AssistantMessage, type Message, type Model, type KnownProvider, Type } from "@earendil-works/pi-ai";
import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from "@earendil-works/pi-agent-core";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, open, readdir, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { LLMAdapter, ChatMessage } from "@obora/adapters";
import type { Blackboard } from "../../../blackboard/core/blackboard.js";
import { createAgentId, type AgentId } from "../../../blackboard/types/base.js";

export type { AgentId };

const ZERO_TOKEN_USAGE = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
} as const;

function normalizeTokenUsage(usage: {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
} | undefined): {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
} {
  return {
    promptTokens: usage?.promptTokens ?? 0,
    completionTokens: usage?.completionTokens ?? 0,
    totalTokens: usage?.totalTokens ?? 0,
  };
}

export enum AgentRole {
  ANALYST = "analyst",
  EXECUTOR = "executor",
  VERIFIER = "verifier",
  DIRECTOR = "director",
}

export enum AgentState {
  IDLE = "idle",
  THINKING = "thinking",
  ACTING = "acting",
  WAITING = "waiting",
  ERROR = "error",
}

export enum MeetingPhase {
  OPENING = "opening",
  DISCUSSION = "discussion",
  VOTING = "voting",
  CONSENSUS = "consensus",
  CLOSING = "closing",
  ESCALATION = "escalation",
}

export interface AgentStatus {
  id: AgentId;
  role: AgentRole;
  state: AgentState;
  lastActivity: Date;
  currentTask?: string;
  errorCount: number;
}

export interface AgentContext {
  sessionId: string;
  board: Blackboard;
  currentTask?: Task;
  history: ChatMessage[];
  signal?: AbortSignal;
}

export interface Task {
  id: string;
  type: string;
  description: string;
  input: Record<string, unknown>;
  priority: number;
  deadline?: Date;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  output: unknown;
  error?: Error;
  duration: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface RuntimeExtensions {
  tools?: AgentTool[];
  systemPromptAppend?: string;
}

interface BoardReadParams {
  path: string;
}

interface RoleActionParams {
  content: string;
}

interface BoardWriteParams {
  result: unknown;
}

interface FileWriteParams {
  path: string;
  content: string;
}

interface FileReadParams {
  path: string;
}

interface FileListParams {
  path: string;
}

interface ShellExecParams {
  command: string;
}

export abstract class BaseAgent {
  readonly id: AgentId;
  readonly role: AgentRole;
  protected state: AgentState = AgentState.IDLE;
  protected llm: LLMAdapter;
  protected systemPrompt: string;
  protected runtimeTools: AgentTool[] = [];
  protected runtimeSystemPromptAppend = "";
  protected errorCount: number = 0;
  protected maxErrors: number = 3;
  protected thinkMaxTokens: number;
  protected executeMaxTokens: number;

  private readonly BLOCKED_PATTERNS: RegExp[] = [
    // Destructive file operations
    /(?:^|\s)rm\s+-[a-z\-\s]*r[a-z\-\s]*f[a-z\-\s]*\s+(?:--no-preserve-root\s+)?(?:\/|~|\.)/i,
    /(?:^|\s)rm\s+--no-preserve-root\s+-[a-z\-\s]*r[a-z\-\s]*f[a-z\-\s]*\s+(?:\/|~|\.)/i,
    /(?:^|\s)rm\s+(?:-[a-zA-Z]+\s+)+(?:\/|~|\.)/i,
    /(?:^|\s)rm\s+(?:--[a-zA-Z-]+\s+)*(?:\/|~|\.)/i,
    // Pipe to shell execution
    /\|\s*(?:sh|bash|zsh|ksh|dash)(?:\s|$)/i,
    // Shell wrapper execution (sh -c, bash -c, etc.)
    /(?:^|\s)(?:sh|bash|zsh|ksh|dash)\s+-[a-z]*c\s+/i,
    // Command substitution with dangerous commands
    /\$\([^)]*(?:rm|curl|wget|chmod|sudo|mkfs|dd)[^)]*\)/i,
    // Backtick command substitution with dangerous commands
    /`[^`]*(?:rm|curl|wget|chmod|sudo|mkfs|dd)[^`]*`/i,
    // Base64 decode to shell
    /base64\s+(?:-d|--decode)\s*\|\s*(?:sh|bash|zsh)/i,
    // Dangerous permissions
    /(?:^|\s)chmod\s+(?:777|a\+rwx)(?:\s|$)/i,
    // Privilege escalation
    /(?:^|\s)sudo(?:\s|$)/i,
    // Filesystem destruction
    /(?:^|\s)mkfs(?:\.|\s|$)/i,
    /(?:^|\s)dd\s+(?:if|of)=/i,
    />\s*\/dev\/sd[a-z](?:\d+)?/i,
    // Fork bomb
    /:\(\)\{:\|:&\};:/,
    // Standalone network I/O commands
    /^\s*curl(?:\s|$)/i,
    /^\s*wget(?:\s|$)/i,
    // Environment variable dump (exact match only)
    /^(?:env|printenv)$/i,
  ];

  private coreAgent?: Agent;
  private unsubscribe?: () => void;
  private currentContext?: AgentContext;
  private currentTask?: Task;
  private latestUsage = { prompt: 0, completion: 0, total: 0 };

  constructor(config: BaseAgentConfig) {
    this.id = config.id ?? createAgentId(`${config.role}-${Date.now()}`);
    this.role = config.role;
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt ?? this.getDefaultSystemPrompt();
    this.maxErrors = config.maxErrors ?? 3;
    this.thinkMaxTokens = config.thinkMaxTokens ?? 2048;
    this.executeMaxTokens = config.executeMaxTokens ?? 8192;

    this.coreAgent = this.createPiAgent(config);
  }

  async execute(task: Task, context: AgentContext): Promise<TaskResult> {
    if (this.hasExceededMaxErrors()) {
      this.state = AgentState.ERROR;
      return {
        taskId: task.id,
        success: false,
        output: null,
        error: new Error(`Agent ${this.id} has exceeded maximum error count (${this.maxErrors})`),
        duration: 0,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    }

    const startTime = Date.now();
    this.currentContext = context;
    this.currentTask = task;
    this.latestUsage = { prompt: 0, completion: 0, total: 0 };
    this.state = AgentState.THINKING;

    try {
      const observation = await this.observe(context);
      let output: unknown;

      if (this.coreAgent) {
        output = await this.executeWithPiAgent(task, observation, context);
      } else {
        const { action, usage } = await this.think(task, observation, context);
        this.state = AgentState.ACTING;
        output = await this.act(action, context);
        await this.report(task, output, context);
        this.latestUsage = {
          prompt: usage.promptTokens,
          completion: usage.completionTokens,
          total: usage.totalTokens,
        };
      }

      this.state = AgentState.IDLE;
      this.errorCount = 0;
      return {
        taskId: task.id,
        success: true,
        output,
        duration: Date.now() - startTime,
        tokensUsed: this.latestUsage,
      };
    } catch (error) {
      this.state = AgentState.ERROR;
      this.errorCount++;
      return {
        taskId: task.id,
        success: false,
        output: null,
        error: error as Error,
        duration: Date.now() - startTime,
        tokensUsed: { prompt: 0, completion: 0, total: 0 },
      };
    } finally {
      this.currentContext = undefined;
      this.currentTask = undefined;
    }
  }

  continue(): Promise<void> {
    if (!this.coreAgent) {
      throw new Error("continue() requires pi-agent-core runtime");
    }
    return this.coreAgent.continue();
  }

  subscribe(listener: (event: AgentEvent) => void): () => void {
    if (!this.coreAgent) {
      return () => {};
    }
    return this.coreAgent.subscribe(listener);
  }

  protected async observe(context: AgentContext): Promise<Record<string, unknown>> {
    const state = (context.board.read("state", { strict: false }) as Record<string, unknown>) ?? {};
    const knowledge =
      (context.board.read("knowledge", { strict: false }) as Record<string, unknown>) ?? {};

    return {
      currentState: state,
      availableKnowledge: knowledge,
      currentTask: context.currentTask,
      sessionId: context.sessionId,
    };
  }

  protected async think(
    task: Task,
    observation: Record<string, unknown>,
    context: AgentContext
  ): Promise<{
    action: unknown;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  }> {
    const messages = this.buildMessages(task, observation, context);

    const result = await this.llm.chatCompletion!({
      messages,
      temperature: 0.7,
      maxTokens: this.thinkMaxTokens,
    });

    return {
      action: this.parseResponse(result.message.content ?? "", task),
      usage: normalizeTokenUsage(result.usage),
    };
  }

  protected abstract act(action: unknown, context: AgentContext): Promise<unknown>;

  protected async report(task: Task, result: unknown, context: AgentContext): Promise<void> {
    context.board.write(`state.agent.${this.id}.lastResult`, {
      taskId: task.id,
      timestamp: new Date(),
      result,
    });
  }

  protected buildMessages(
    task: Task,
    observation: Record<string, unknown>,
    context: AgentContext
  ): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: "system", content: this.getEffectiveSystemPrompt() }];
    messages.push(...context.history.slice(-10));
    messages.push({ role: "user", content: this.formatTaskAndObservation(task, observation) });
    return messages;
  }

  protected formatTaskAndObservation(task: Task, observation: Record<string, unknown>): string {
    return `
Current Task:
- ID: ${task.id}
- Type: ${task.type}
- Description: ${task.description}
- Input: ${JSON.stringify(task.input, null, 2)}

Current Context:
- Session ID: ${observation.sessionId}
- Available: ${JSON.stringify(observation, null, 2)}

Use board_read to inspect context, then perform role_action, and finish with board_write report.
`.trim();
  }

  protected abstract parseResponse(content: string, task: Task): unknown;
  protected abstract getDefaultSystemPrompt(): string;

  configureRuntimeExtensions(extensions: RuntimeExtensions): void {
    this.runtimeTools = extensions.tools ?? [];
    this.runtimeSystemPromptAppend = extensions.systemPromptAppend ?? "";
    const state = this.coreAgent?.state as { systemPrompt?: string; tools?: AgentTool[] } | undefined;
    if (state) {
      state.systemPrompt = this.getEffectiveSystemPrompt();
      state.tools = this.createAgentTools();
    }
  }

  clearRuntimeExtensions(): void {
    this.configureRuntimeExtensions({ tools: [], systemPromptAppend: "" });
  }

  private getEffectiveSystemPrompt(): string {
    if (!this.runtimeSystemPromptAppend) {
      return this.systemPrompt;
    }
    return `${this.systemPrompt}\n\n${this.runtimeSystemPromptAppend}`;
  }

  getStatus(): AgentStatus {
    return {
      id: this.id,
      role: this.role,
      state: this.state,
      lastActivity: new Date(),
      currentTask: undefined,
      errorCount: this.errorCount,
    };
  }

  resetErrorCount(): void {
    this.errorCount = 0;
  }

  hasExceededMaxErrors(): boolean {
    return this.errorCount >= this.maxErrors;
  }

  private createPiAgent(config: BaseAgentConfig): Agent | undefined {
    if (!config.enablePiRuntime) {
      return undefined;
    }

    if (config.llm.id === "mock-llm") {
      return undefined;
    }

    if (!config.provider || !config.model) {
      return undefined;
    }

    try {
      const model = getModel(config.provider as KnownProvider, config.model as never) as Model<any> | undefined;
      if (!model) {
        return undefined;
      }
      const agent = new Agent({
        initialState: {
          model,
          systemPrompt: this.getEffectiveSystemPrompt(),
          thinkingLevel: config.thinkingLevel ?? "medium",
          tools: this.createAgentTools(),
        },
        streamFn: this.createStreamFn(),
        sessionId: config.sessionId,
      });
      return agent;
    } catch {
      return undefined;
    }
  }

  /**
   * Defines tools available to the LLM via pi-agent-core's tool-calling mechanism.
   * These tools are registered with the Agent at creation time and executed
   * by pi-agent-core when the LLM issues tool calls through the API.
   *
   * Security:
   * - file_write/file_read/file_list: Path validated with fs.realpathSync (symlink-safe)
   * - shell_exec: Denylist blocks dangerous command patterns
   */
  private createAgentTools(): AgentTool[] {
    const baseTools: AgentTool[] = [
      {
        name: "board_read",
        label: "Read blackboard context",
        description: "Read a path from workflow blackboard",
        parameters: Type.Object({ path: Type.String() }),
        execute: async (_id, params: unknown) => {
          const parsedParams = this.parseBoardReadParams(params);
          const value = this.currentContext?.board.read(parsedParams.path, { strict: false });
          return {
            content: [{ type: "text", text: JSON.stringify(value ?? null) }],
            details: { value: value ?? null },
          };
        },
      },
      {
        name: "role_action",
        label: "Execute role-specific action",
        description: "Execute the role specific act() with parsed result",
        parameters: Type.Object({ content: Type.String() }),
        execute: async (_id, params: unknown) => {
          if (!this.currentContext || !this.currentTask) throw new Error("Missing task context");
          const parsedParams = this.parseRoleActionParams(params);
          const parsed = this.parseResponse(parsedParams.content, this.currentTask);
          this.state = AgentState.ACTING;
          const result = await this.act(parsed, this.currentContext);
          return {
            content: [{ type: "text", text: JSON.stringify(result) }],
            details: { result },
          };
        },
      },
      {
        name: "board_write",
        label: "Write agent report",
        description: "Write task execution report to blackboard",
        parameters: Type.Object({ result: Type.Any() }),
        execute: async (_id, params: unknown) => {
          if (!this.currentContext || !this.currentTask) throw new Error("Missing task context");
          const parsedParams = this.parseBoardWriteParams(params);
          await this.report(this.currentTask, parsedParams.result, this.currentContext);
          return {
            content: [{ type: "text", text: "ok" }],
            details: { written: true },
          };
        },
      },
    ];

    const roleTools = this.role === AgentRole.EXECUTOR ? this.createExecutorTools() : [];
    return [...baseTools, ...roleTools, ...this.runtimeTools];
  }

  private createExecutorTools(): AgentTool[] {
    return [
      {
        name: "file_write",
        label: "Write file to project",
        description: "Create or overwrite a file in the project directory. Use for generating source code, configs, etc.",
        parameters: Type.Object({
          path: Type.String({ description: "Relative path from project root" }),
          content: Type.String({ description: "File content to write" }),
        }),
        execute: async (_id, params: unknown) => {
          const parsedParams = this.parseFileWriteParams(params);
          const filePath = this.resolveAndValidatePath(parsedParams.path, { allowNonExistentTarget: true });
          await mkdir(dirname(filePath), { recursive: true });
          await writeFile(filePath, parsedParams.content, "utf-8");

          const writtenRealPath = realpathSync(filePath);
          const projectRoot = realpathSync(process.cwd());
          if (!writtenRealPath.startsWith(projectRoot + sep) && writtenRealPath !== projectRoot) {
            await Promise.allSettled([
              unlink(filePath),
              writtenRealPath === filePath ? Promise.resolve() : unlink(writtenRealPath),
            ]);
            throw new Error("Security: file was written outside project boundary (TOCTOU detected)");
          }

          return {
            content: [{ type: "text", text: `Written: ${parsedParams.path}` }],
            details: { path: parsedParams.path, bytesWritten: parsedParams.content.length },
          };
        },
      },
      {
        name: "file_read",
        label: "Read file from project",
        description: "Read a file from the project directory",
        parameters: Type.Object({
          path: Type.String({ description: "Relative path from project root" }),
        }),
        execute: async (_id, params: unknown) => {
          const parsedParams = this.parseFileReadParams(params);
          const filePath = this.resolveAndValidatePath(parsedParams.path);

          const fileHandle = await open(filePath, "r");
          try {
            const projectRoot = realpathSync(process.cwd());
            const openedFdStat = await fileHandle.stat();
            const postOpenRealPath = realpathSync(filePath);
            if (!postOpenRealPath.startsWith(projectRoot + sep) && postOpenRealPath !== projectRoot) {
              throw new Error("Security: file read escaped project boundary (TOCTOU detected)");
            }

            const postOpenPathStat = await stat(postOpenRealPath);
            if (openedFdStat.dev !== postOpenPathStat.dev || openedFdStat.ino !== postOpenPathStat.ino) {
              throw new Error("Security: file changed during open/read boundary validation (TOCTOU detected)");
            }

            const content = await fileHandle.readFile({ encoding: "utf-8" });
            return {
              content: [{ type: "text", text: content }],
              details: { path: parsedParams.path, bytesRead: content.length },
            };
          } finally {
            await fileHandle.close();
          }
        },
      },
      {
        name: "file_list",
        label: "List directory contents",
        description: "List files and directories at a path",
        parameters: Type.Object({
          path: Type.String({ description: "Relative directory path from project root" }),
        }),
        execute: async (_id, params: unknown) => {
          const parsedParams = this.parseFileListParams(params);
          const dirPath = this.resolveAndValidatePath(parsedParams.path);
          const entries = await readdir(dirPath, { withFileTypes: true });
          const list = entries.map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`).join("\n");
          return {
            content: [{ type: "text", text: list }],
            details: { count: entries.length },
          };
        },
      },
      {
        name: "shell_exec",
        label: "Execute shell command",
        description: "Run a shell command in the project directory. Use for npm init, test runs, etc.",
        parameters: Type.Object({
          command: Type.String({ description: "Shell command to execute" }),
        }),
        execute: async (_id, params: unknown) => {
          const parsedParams = this.parseShellExecParams(params);
          if (this.isBlockedShellCommand(parsedParams.command)) {
            return {
              content: [{ type: "text", text: "Error: Blocked by security policy (dangerous command pattern detected)." }],
              details: { exitCode: 1, blocked: true },
            };
          }

          const { exec } = await import("node:child_process");
          const execAsync = promisify(exec);
          const projectRoot = realpathSync(process.cwd());
          try {
            const { stdout, stderr } = await execAsync(parsedParams.command, {
              cwd: projectRoot,
              timeout: 30000,
              maxBuffer: 1024 * 1024,
            });
            const output = [stdout, stderr].filter(Boolean).join("\n---stderr---\n");
            return {
              content: [{ type: "text", text: output.slice(0, 4000) }],
              details: { exitCode: 0 },
            };
          } catch (e: unknown) {
            const error = e as { message?: string; stdout?: string; stderr?: string; code?: number };
            const output = [
              `Error: ${error.message ?? "Execution failed"}`,
              error.stdout,
              error.stderr,
            ]
              .filter(Boolean)
              .join("\n---stderr---\n");
            return {
              content: [{ type: "text", text: output.slice(0, 4000) }],
              details: { exitCode: error.code ?? 1 },
            };
          }
        },
      },
    ];
  }


  /**
   * Creates a stream function bridge for pi-agent-core's Agent runtime.
   *
   * ARCHITECTURE NOTE - Tool-Calling Loop:
   * The tool execution loop is fully delegated to pi-agent-core's Agent class.
   * This streamFn is called by pi-agent-core on each LLM turn. When the LLM
   * returns tool_calls (stopReason: "toolUse"), pi-agent-core automatically:
   *   1. Executes the matching tool from createAgentTools()
   *   2. Appends the tool result as a "tool" message
   *   3. Calls this streamFn again with the updated message history
   *   4. Repeats until the LLM returns stopReason: "stop"
   *
   * obora-kit does NOT implement its own tool loop — pi-agent-core handles it.
   */
  private createStreamFn() {
    return async (model: Model<any>, context: { systemPrompt?: string; messages: Message[] }) => {
      const stream = new EventStream<any, AssistantMessage>((e) => e.type === "done" || e.type === "error", (e) => e.message ?? e.error);
      queueMicrotask(async () => {
        try {
          const tools = this.createAgentTools().map((tool) => ({
            type: "function" as const,
            function: {
              name: tool.name,
              description: tool.description,
              parameters: (tool.parameters ?? { type: "object", properties: {} }) as Record<string, unknown>,
            },
          }));

          const res = await this.llm.chatCompletion!({
            messages: [
              ...(context.systemPrompt ? [{ role: "system", content: context.systemPrompt } as const] : []),
              ...context.messages.map((m): ChatMessage => {
                if (m.role === "user") {
                  return { role: "user", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
                }
                if (m.role === "assistant") {
                  const calls = m.content
                    .filter((c) => c.type === "toolCall")
                    .map((c) => ({
                      id: c.id,
                      type: "function" as const,
                      function: {
                        name: c.name,
                        arguments: JSON.stringify(c.arguments ?? {}),
                      },
                    }));
                  return {
                    role: "assistant",
                    content: m.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
                    toolCalls: calls.length > 0 ? calls : undefined,
                  };
                }
                return {
                  role: "tool",
                  toolCallId: m.toolCallId,
                  content: m.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"),
                };
              }),
            ],
            tools,
            toolChoice: "auto",
            temperature: 0.7,
            maxTokens: this.executeMaxTokens,
          });

          const usage = normalizeTokenUsage(res.usage);

          this.latestUsage = {
            prompt: usage.promptTokens,
            completion: usage.completionTokens,
            total: usage.totalTokens,
          };

          const textContent = res.message.content?.trim();
          const toolCallContent = (res.message.toolCalls ?? []).map((tc: { id?: string; function: { name?: string; arguments?: string } }) => {
            const args = (() => {
              try {
                return JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
              } catch {
                return { _raw: tc.function.arguments };
              }
            })();
            return {
              type: "toolCall" as const,
              id: tc.id ?? `tool-${Date.now()}`,
              name: tc.function.name ?? "unknown_tool",
              arguments: args,
            };
          });

          const contentParts = [
            ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
            ...toolCallContent,
          ];

          const assistant: AssistantMessage = {
            role: "assistant",
            content: contentParts.length > 0 ? contentParts : [{ type: "text", text: "" }],
            api: "openai-completions",
            provider: this.llm.id,
            model: res.model ?? "unknown",
            usage: {
              input: usage.promptTokens,
              output: usage.completionTokens,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: usage.totalTokens,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: res.finishReason === "tool_calls" ? "toolUse" : "stop",
            timestamp: Date.now(),
          };

          stream.push({ type: "start", partial: assistant });
          stream.push({ type: "done", reason: assistant.stopReason === "toolUse" ? "toolUse" : "stop", message: assistant });
          stream.end(assistant);
        } catch (error) {
          const errMessage: AssistantMessage = {
            role: "assistant",
            content: [{ type: "text", text: (error as Error).message }],
            api: "openai-completions",
            provider: this.llm.id,
            model: "unknown",
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: "error",
            errorMessage: (error as Error).message,
            timestamp: Date.now(),
          };
          stream.push({ type: "error", reason: "error", error: errMessage });
          stream.end(errMessage);
        }
      });
      return stream;
    };
  }

  /**
   * Delegates task execution to pi-agent-core's Agent runtime.
   * The Agent.prompt() call triggers the full tool-calling loop internally.
   * See createStreamFn() for the tool loop architecture.
   */
  private async executeWithPiAgent(
    task: Task,
    observation: Record<string, unknown>,
    context: AgentContext
  ): Promise<unknown> {
    const prompt = this.formatTaskAndObservation(task, observation);
    const unsubscribe = this.coreAgent!.subscribe(() => {});
    this.unsubscribe?.();
    this.unsubscribe = unsubscribe;

    await this.coreAgent!.prompt(prompt);

    const messages = this.coreAgent!.state.messages;
    const lastAssistant = [...messages]
      .reverse()
      .find((m): m is AssistantMessage => (m as { role?: string }).role === "assistant") as AssistantMessage | undefined;

    const text = lastAssistant?.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("\n") ?? "";

    const parsed = this.parseResponse(text, task);
    await this.report(task, parsed, context);
    return parsed;
  }

  private parseBoardReadParams(params: unknown): BoardReadParams {
    if (!this.isRecord(params) || typeof params.path !== "string") {
      throw new Error("Invalid params: board_read.path must be a string");
    }
    return { path: params.path };
  }

  private parseRoleActionParams(params: unknown): RoleActionParams {
    if (!this.isRecord(params) || typeof params.content !== "string") {
      throw new Error("Invalid params: role_action.content must be a string");
    }
    return { content: params.content };
  }

  private parseBoardWriteParams(params: unknown): BoardWriteParams {
    if (!this.isRecord(params) || !("result" in params)) {
      throw new Error("Invalid params: board_write.result is required");
    }
    return { result: params.result };
  }

  private parseFileWriteParams(params: unknown): FileWriteParams {
    if (!this.isRecord(params) || typeof params.path !== "string" || typeof params.content !== "string") {
      throw new Error("Invalid params: file_write.path/content must be strings");
    }
    return { path: params.path, content: params.content };
  }

  private parseFileReadParams(params: unknown): FileReadParams {
    if (!this.isRecord(params) || typeof params.path !== "string") {
      throw new Error("Invalid params: file_read.path must be a string");
    }
    return { path: params.path };
  }

  private parseFileListParams(params: unknown): FileListParams {
    if (!this.isRecord(params) || typeof params.path !== "string") {
      throw new Error("Invalid params: file_list.path must be a string");
    }
    return { path: params.path };
  }

  private parseShellExecParams(params: unknown): ShellExecParams {
    if (!this.isRecord(params) || typeof params.command !== "string") {
      throw new Error("Invalid params: shell_exec.command must be a string");
    }
    return { command: params.command };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private resolveAndValidatePath(relativePath: string, options?: { allowNonExistentTarget?: boolean }): string {
    const projectRoot = realpathSync(process.cwd());
    const resolvedPath = resolve(projectRoot, relativePath);

    if (!options?.allowNonExistentTarget || existsSync(resolvedPath)) {
      const realTargetPath = realpathSync(resolvedPath);
      if (!(realTargetPath === projectRoot || realTargetPath.startsWith(`${projectRoot}/`))) {
        throw new Error("Path validation failed: target escapes project directory");
      }
      return realTargetPath;
    }

    let nearestExistingAncestor = dirname(resolvedPath);

    while (!existsSync(nearestExistingAncestor)) {
      const nextAncestor = dirname(nearestExistingAncestor);
      if (nextAncestor === nearestExistingAncestor) {
        throw new Error("Path validation failed: no existing parent directory found");
      }
      nearestExistingAncestor = nextAncestor;
    }

    let realAncestorPath: string;
    try {
      realAncestorPath = realpathSync(nearestExistingAncestor);
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "ENOENT") {
        throw new Error("Path validation failed: parent directory disappeared during validation", {
          cause: error,
        });
      }
      throw error;
    }

    if (!(realAncestorPath === projectRoot || realAncestorPath.startsWith(`${projectRoot}/`))) {
      throw new Error("Path validation failed: parent escapes project directory");
    }

    return resolvedPath;
  }

  private isBlockedShellCommand(command: string): boolean {
    const trimmed = command.trim();
    const segments = command
      .split(/(?:;|&&|\|\||\|)/)
      .map((segment) => segment.trim())
      .filter(Boolean);

    return (
      this.BLOCKED_PATTERNS.some((pattern) => pattern.test(trimmed)) ||
      segments.some((segment) => this.BLOCKED_PATTERNS.some((pattern) => pattern.test(segment)))
    );
  }

}


export interface BaseAgentConfig {
  id?: AgentId;
  role: AgentRole;
  llm: LLMAdapter;
  systemPrompt?: string;
  maxErrors?: number;
  provider?: string;
  model?: string;
  sessionId?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
  enablePiRuntime?: boolean;
  thinkMaxTokens?: number;
  executeMaxTokens?: number;
}

// 역할별 입출력 타입 정의 (스펙 14-ai-agents.md와 일치)
// ============================================

/**
 * Analyst 입력 타입
 */
export interface AnalystInput {
  type: "analysis";
  content: string;
  goal?: string;
  constraints?: string[];
  resources?: string[];
  previousPlans?: Plan[];
  context?: Record<string, unknown>;
}

/**
 * Analyst 출력 타입
 */
export interface AnalystOutput {
  type: "analysis";
  content: string;
  summary: string;
  keyFindings: string[];
  recommendations: string[];
  confidence: number;
  reasoning: string;
  sources?: string[];
}

/**
 * Executor 입력 타입
 */
export interface ExecutorInput {
  type: "execution";
  content: string;
  taskDescription: string;
  inputs?: Record<string, unknown>;
  expectedOutput?: string;
  tools?: string[];
  context?: Record<string, unknown>;
}

/**
 * Executor 출력 타입
 */
export interface ExecutorOutput {
  type: "execution";
  content: string;
  action: string;
  tool?: string;
  parameters: Record<string, unknown>;
  steps: string[];
  expectedOutcome: string;
}

/**
 * Verifier 입력 타입
 */
export interface VerifierInput {
  type: "verification";
  content: string;
  artifact: Artifact;
  criteria?: string[];
  requirements?: string[];
  context?: Record<string, unknown>;
}

/**
 * Verifier 출력 타입
 */
export interface VerifierOutput {
  type: "verification";
  content: string;
  passed: boolean;
  score: number; // 0-100
  checks: VerificationCheck[];
  findings: Finding[];
  suggestions: string[];
}

/**
 * Director 입력 타입
 */
export interface DirectorInput {
  type: "coordination";
  content: string;
  agenda: string;
  participants: string[];
  currentOpinions?: string[];
  conflict?: Conflict;
  context?: Record<string, unknown>;
}

/**
 * Director 출력 타입 (스펙 14-ai-agents.md와 일치)
 */
export interface DirectorOutput {
  type: "coordination";
  content: string;
  agenda: string;
  participants: string[];
  steps: CoordinationStep[];
  timeline: string[];
  expectedOutcome: string;
  // 스펙에 없는 필드:
  // - phase: 테스트용 추가 필드, 구현에서는 불필요
  // - action: 테스트용 추가 필드, 구현에서는 불필요
}

/**
 * 검증 체크 항목
 */
export interface VerificationCheck {
  name: string;
  description: string;
  status: "passed" | "failed" | "skipped";
  evidence: string;
}

/**
 * 발견된 이슈
 */
export interface Finding {
  id: string;
  type: "error" | "warning" | "info";
  description: string;
  location?: string;
  severity: "low" | "medium" | "high" | "critical";
}

/**
 * 조율 단계
 */
export interface CoordinationStep {
  step: number;
  description: string;
  assignee?: string;
  dependencies: string[];
  estimatedDuration?: string;
}

/**
 * 갈등 정보
 */
export interface Conflict {
  id: string;
  topic: string;
  parties: string[];
  positions: Record<string, string>;
  severity: "minor" | "moderate" | "major";
}

/**
 * 아티팩트
 */
export interface Artifact {
  id: string;
  type: "code" | "document" | "data" | "plan" | "review";
  name: string;
  content: string | Record<string, unknown>;
}

/**
 * Plan 타입 (AnalystInput에서 참조)
 */
export interface Plan {
  id: string;
  description: string;
  steps: string[];
  status: "draft" | "approved" | "completed";
}

import { getModel, EventStream, type AssistantMessage, type Message, type Model, type KnownProvider, Type } from "@mariozechner/pi-ai";
import { Agent, type AgentEvent, type AgentMessage, type AgentTool } from "@mariozechner/pi-agent-core";
import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { LLMAdapter, ChatMessage } from "../llm/adapter";
import type { Blackboard } from "@obora-kit/blackboard";
import type { AgentId } from "../types";

export type { AgentId };

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

  private coreAgent?: Agent;
  private unsubscribe?: () => void;
  private currentContext?: AgentContext;
  private currentTask?: Task;
  private latestUsage = { prompt: 0, completion: 0, total: 0 };

  constructor(config: BaseAgentConfig) {
    this.id = config.id ?? `${config.role}-${Date.now()}`;
    this.role = config.role;
    this.llm = config.llm;
    this.systemPrompt = config.systemPrompt ?? this.getDefaultSystemPrompt();
    this.maxErrors = config.maxErrors ?? 3;

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

    const result = await this.llm.chatCompletion({
      messages,
      temperature: 0.7,
      maxTokens: 8192,
    });

    return {
      action: this.parseResponse(result.message.content ?? "", task),
      usage: result.usage,
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

  private createAgentTools(): AgentTool[] {
    return [
      {
        name: "board_read",
        label: "Read blackboard context",
        description: "Read a path from workflow blackboard",
        parameters: Type.Object({ path: Type.String() }),
        execute: async (_id, params: any) => {
          const value = this.currentContext?.board.read(String(params?.path ?? ""), { strict: false });
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
        execute: async (_id, params: any) => {
          if (!this.currentContext || !this.currentTask) throw new Error("Missing task context");
          const parsed = this.parseResponse(String(params?.content ?? ""), this.currentTask);
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
        execute: async (_id, params: any) => {
          if (!this.currentContext || !this.currentTask) throw new Error("Missing task context");
          await this.report(this.currentTask, params?.result, this.currentContext);
          return {
            content: [{ type: "text", text: "ok" }],
            details: { written: true },
          };
        },
      },
      {
        name: "file_write",
        label: "Write file to project",
        description: "Create or overwrite a file in the project directory. Use for generating source code, configs, etc.",
        parameters: Type.Object({
          path: Type.String({ description: "Relative path from project root" }),
          content: Type.String({ description: "File content to write" }),
        }),
        execute: async (_id, params: any) => {
          const projectRoot = process.cwd();
          const filePath = resolve(join(projectRoot, String(params?.path ?? "")));
          if (!(filePath === projectRoot || filePath.startsWith(`${projectRoot}/`))) {
            throw new Error("Cannot write outside project directory");
          }
          await mkdir(dirname(filePath), { recursive: true });
          const content = String(params?.content ?? "");
          await writeFile(filePath, content, "utf-8");
          return {
            content: [{ type: "text", text: `Written: ${params.path}` }],
            details: { path: params.path, bytesWritten: content.length },
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
        execute: async (_id, params: any) => {
          const projectRoot = process.cwd();
          const filePath = resolve(join(projectRoot, String(params?.path ?? "")));
          if (!(filePath === projectRoot || filePath.startsWith(`${projectRoot}/`))) {
            throw new Error("Cannot read outside project directory");
          }
          const content = await readFile(filePath, "utf-8");
          return {
            content: [{ type: "text", text: content }],
            details: { path: params.path, bytesRead: content.length },
          };
        },
      },
      {
        name: "file_list",
        label: "List directory contents",
        description: "List files and directories at a path",
        parameters: Type.Object({
          path: Type.String({ description: "Relative directory path from project root" }),
        }),
        execute: async (_id, params: any) => {
          const projectRoot = process.cwd();
          const dirPath = resolve(join(projectRoot, String(params?.path ?? ".")));
          if (!(dirPath === projectRoot || dirPath.startsWith(`${projectRoot}/`))) {
            throw new Error("Cannot list outside project directory");
          }
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
        execute: async (_id, params: any) => {
          const { execSync } = await import("node:child_process");
          const projectRoot = process.cwd();
          try {
            const output = execSync(String(params?.command ?? "echo ok"), {
              cwd: projectRoot,
              timeout: 30000,
              maxBuffer: 1024 * 1024,
              encoding: "utf-8",
            });
            return {
              content: [{ type: "text", text: output.slice(0, 4000) }],
              details: { exitCode: 0 },
            };
          } catch (e: any) {
            return {
              content: [{ type: "text", text: `Error: ${e.message}\n${e.stdout || ""}`.slice(0, 4000) }],
              details: { exitCode: e.status ?? 1 },
            };
          }
        },
      },
      ...this.runtimeTools,
    ];
  }

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

          const res = await this.llm.chatCompletion({
            messages: [
              ...(context.systemPrompt ? [{ role: "system", content: context.systemPrompt } as const] : []),
              ...context.messages.map((m): ChatMessage => {
                if (m.role === "user") {
                  return { role: "user", content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) };
                }
                if (m.role === "assistant") {
                  return {
                    role: "assistant",
                    content: m.content.filter((c) => c.type === "text").map((c) => c.text).join(""),
                    toolCalls: m.content
                      .filter((c): c is { type: "toolCall"; id: string; name: string; arguments?: Record<string, unknown> } => c.type === "toolCall")
                      .map((c) => ({
                        id: c.id,
                        type: "function" as const,
                        function: {
                          name: c.name,
                          arguments: JSON.stringify(c.arguments ?? {}),
                        },
                      })),
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
            maxTokens: 8192,
          });

          this.latestUsage = {
            prompt: res.usage.promptTokens,
            completion: res.usage.completionTokens,
            total: res.usage.totalTokens,
          };

          const assistant: AssistantMessage = {
            role: "assistant",
            content: res.message.toolCalls && res.message.toolCalls.length > 0
              ? res.message.toolCalls.map((tc) => ({
                  type: "toolCall" as const,
                  id: tc.id,
                  name: tc.function.name,
                  arguments: JSON.parse(tc.function.arguments || "{}"),
                }))
              : [{ type: "text", text: res.message.content ?? "" }],
            api: "openai-completions",
            provider: this.llm.id,
            model: res.model,
            usage: {
              input: res.usage.promptTokens,
              output: res.usage.completionTokens,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: res.usage.totalTokens,
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

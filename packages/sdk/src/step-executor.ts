import type { ChatMessage, ChatCompletionResult, ToolCall, ToolDefinition } from "@obora/adapters";
import type { AgentFactory } from "./runtime.js";
import type { WorkflowStep } from "./workflow.js";
import {
  getValidationStepConfig,
  normalizeValidationResult,
  type RepairContext,
} from "./validation-repair.js";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/**
 * Minimal LLM adapter interface for StepExecutor.
 * Compatible with the full LLMAdapter from @obora/adapters.
 */
export interface LLMAdapterLike {
  chatCompletion(params: {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    tools?: ToolDefinition[];
    toolChoice?: "auto" | "none" | "required" | { type: "function"; name: string };
  }): Promise<{
    model?: string;
    message: { role: "assistant"; content: string | null; toolCalls?: ToolCall[] };
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
  }>;
}

export interface StepContext {
  previousOutputs: Record<string, unknown>;
  signal?: AbortSignal;
  repairContext?: RepairContext;
}

export interface StepResult {
  output: unknown;
  raw?: unknown;
  votes?: Array<{ participant: string; vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES"; response: string }>;
}

/**
 * A handler that pairs a tool definition with its execution logic.
 * Pass instances via StepExecutorConfig.tools to inject custom tools.
 */
export interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

export const BUILTIN_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "file_write",
      description: "Create or overwrite a file in the project directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
          content: { type: "string", description: "File content" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_read",
      description: "Read a file from the project directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative path from project root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "file_list",
      description: "List files and directories at a path in the project directory",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Relative directory path from project root" },
        },
        required: ["path"],
      },
    },
  },
];

const DEFAULT_MAX_TOOL_ROUNDS = 128;

const OBR_GLOBAL_SYSTEM_PROMPT_LINES = [
  "You are an Obora workflow execution agent.",
  "",
  "[Obora Architecture Context]",
  "- Obora executes deterministic step pipelines with explicit dependencies.",
  "- Each step must produce artifacts that are directly usable by the next step.",
  "- Tool-call first: use structured tool calls (file_write/file_read/file_list) instead of claiming work in prose.",
  "- Prior artifacts are mandatory context. Resolve inconsistencies explicitly.",
  "- If review/consensus fails, improve the artifact using concrete issues and retry within policy limits.",
  "",
  "[Non-negotiable Rules]",
  "- Stay inside the requested project domain.",
  "- No placeholders in final artifacts (e.g., YYYY-XX-XX, TBD).",
  "- Keep outputs concise, verifiable, and implementation-ready.",
];


export interface StepExecutorConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
  resolveAgentLLM?: (
    agentName?: string,
  ) =>
    | Promise<{ adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number } | undefined>
    | { adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number }
    | undefined;
  onEvent?: (event: "llm_request" | "llm_response" | "consensus_vote" | "consensus_result", data: unknown) => Promise<void> | void;
  /**
   * Custom tool handlers to inject into the executor.
   * By default, built-in tools (file_write, file_read, file_list) are merged with these.
   * Use disableBuiltinTools to suppress the built-ins entirely.
   */
  tools?: ToolHandler[];
  /**
   * When true, only the custom tools provided via `tools` are available.
   * Built-in file tools are disabled.
   */
  disableBuiltinTools?: boolean;
  /**
   * Maximum number of tool-call rounds (LLM ↔ tool exchanges) per step.
   * Steps can override this via `config.maxToolRounds`.
   * Default: 128.
   */
  maxToolRounds?: number;
  /**
   * Per-tool call count limits.
   * Key = tool name, value = max allowed calls.
   * Tools not listed here are unlimited.
   * Steps can override this via `config.toolLimits`.
   *
   * Example: `{ run_validation: 1, fetch_url: 10 }`
   *
   * Built-in file tools (file_read, file_write, file_list) are unlimited
   * by default unless explicitly limited here.
   */
  toolLimits?: Record<string, number>;
}

function normalizeAgentInfo(factory?: AgentFactory): { role?: string; description?: string } {
  if (!factory) return {};
  const instance = factory();
  if (!instance || typeof instance !== "object") return {};
  const value = instance as Record<string, unknown>;
  return {
    role: typeof value.role === "string" ? value.role : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
  };
}

function parseVote(text: string): "APPROVE" | "REJECT" | "REQUEST_CHANGES" {
  const normalized = text.toUpperCase();
  if (normalized.includes("REQUEST_CHANGES")) return "REQUEST_CHANGES";
  if (normalized.includes("REJECT")) return "REJECT";
  if (normalized.includes("APPROVE")) return "APPROVE";
  return "REQUEST_CHANGES";
}

/**
 * Build a Map of name → ToolHandler for the builtin file tools.
 * Kept as a factory so each StepExecutor gets its own bound handlers.
 */
function createBuiltinToolHandlers(resolveProjectPath: (path: string, opts?: { allowNonExistentTarget?: boolean }) => string): Map<string, ToolHandler> {
  const handlers = new Map<string, ToolHandler>();

  handlers.set("file_write", {
    definition: BUILTIN_TOOLS[0]!,
    execute: async (args) => {
      if (typeof args.path !== "string" || typeof args.content !== "string") {
        return "Error: file_write requires string path and content";
      }
      const filePath = resolveProjectPath(args.path, { allowNonExistentTarget: true });
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, args.content, "utf-8");
      return `Written: ${args.path}`;
    },
  });

  handlers.set("file_read", {
    definition: BUILTIN_TOOLS[1]!,
    execute: async (args) => {
      if (typeof args.path !== "string") {
        return "Error: file_read requires string path";
      }
      const filePath = resolveProjectPath(args.path);
      return await readFile(filePath, "utf-8");
    },
  });

  handlers.set("file_list", {
    definition: BUILTIN_TOOLS[2]!,
    execute: async (args) => {
      if (typeof args.path !== "string") {
        return "Error: file_list requires string path";
      }
      const dirPath = resolveProjectPath(args.path);
      const entries = await readdir(dirPath, { withFileTypes: true });
      return entries.map((entry) => `${entry.isDirectory() ? "d" : "f"} ${entry.name}`).join("\n");
    },
  });

  return handlers;
}

export class StepExecutor {
  private readonly toolRegistry: Map<string, ToolHandler>;

  constructor(
    private readonly llmAdapter: LLMAdapterLike,
    private readonly agents: Map<string, AgentFactory>,
    private readonly config: StepExecutorConfig = {},
  ) {
    this.toolRegistry = this.buildToolRegistry();
  }

  private buildToolRegistry(): Map<string, ToolHandler> {
    const registry = new Map<string, ToolHandler>();

    if (!this.config.disableBuiltinTools) {
      const builtins = createBuiltinToolHandlers(this.resolveProjectPath.bind(this));
      for (const [name, handler] of builtins) {
        registry.set(name, handler);
      }
    }

    if (this.config.tools) {
      for (const handler of this.config.tools) {
        registry.set(handler.definition.function.name, handler);
      }
    }

    return registry;
  }

  private getActiveToolDefinitions(): ToolDefinition[] {
    return Array.from(this.toolRegistry.values()).map((h) => h.definition);
  }

  async executeStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    if (step.pattern === "consensus" || step.pattern === "peer-review") {
      return this.executeConsensusStep(step, context);
    }

    const response = await this.requestForStep(step, context, step.agent);
    return {
      output: this.parseStructuredStepOutput(step, response.message.content ?? ""),
      raw: response,
    };
  }

  private async executeConsensusStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    const participants = Array.isArray(step.participants) ? step.participants : [];
    if (participants.length === 0) {
      throw new Error(`Consensus step '${step.name}' requires participants`);
    }

    const runConsensus = async (_timeoutSignal: AbortSignal): Promise<StepResult> => {
      const votes: Array<{ participant: string; vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES"; response: string }> = [];
      const consensusSignal = this.combineAbortSignals(context.signal, _timeoutSignal);

      try {
        for (const participant of participants) {
          const response = await this.requestForStep(
            step,
            {
              ...context,
              ...(consensusSignal?.signal ? { signal: consensusSignal.signal } : { signal: _timeoutSignal }),
            },
            participant,
          );
          const responseText = response.message.content ?? "";
          const vote = parseVote(responseText);
          votes.push({ participant, vote, response: responseText });
          await this.config.onEvent?.("consensus_vote", { stepName: step.name, participant, vote, response: responseText });
        }
      } finally {
        consensusSignal?.cleanup();
      }

      const approveCount = votes.filter((v) => v.vote === "APPROVE").length;
      const quorumRule = this.getConsensusQuorumRule(step, votes.length);
      const pass = approveCount >= quorumRule.requiredApprovals;
      await this.config.onEvent?.("consensus_result", {
        stepName: step.name,
        pass,
        approveCount,
        requiredApprovals: quorumRule.requiredApprovals,
        totalVotes: votes.length,
        votes,
      });

      if (!pass) {
        throw new Error(
          `Consensus failed for step '${step.name}' (${approveCount}/${votes.length} approvals, requires ${quorumRule.description})`,
        );
      }

      return {
        output: votes.map((v) => `[${v.participant}] ${v.vote}: ${v.response}`).join("\n\n"),
        votes,
      };
    };

    const perRequestTimeoutMs = this.getStepTimeoutMs(step);
    const consensusTimeoutMs = this.getConsensusTimeoutMs(step, participants.length, perRequestTimeoutMs);

    return this.withTimeout(runConsensus, consensusTimeoutMs, `Consensus timed out for step '${step.name}' after ${consensusTimeoutMs}ms`);
  }

  private async requestForStep(step: WorkflowStep, context: StepContext, agentName?: string) {
    const task = this.extractTask(step);
    const systemPrompt = this.buildSystemPrompt(agentName ?? step.agent);
    const userPrompt = this.buildUserPrompt(step, task, context);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    await this.config.onEvent?.("llm_request", { stepName: step.name, agent: agentName ?? step.agent, messages });

    const timeoutMs = this.getStepTimeoutMs(step);
    const requestSignal = this.combineSignals(context.signal, timeoutMs, step.name);
    const resolved = await this.config.resolveAgentLLM?.(agentName ?? step.agent);
    const adapter = resolved?.adapter ?? this.llmAdapter;

    const activeTools = this.getActiveToolDefinitions();

    const startedAt = Date.now();
    try {
      let response: Awaited<ReturnType<LLMAdapterLike["chatCompletion"]>> | undefined;
      const maxToolRounds = this.getMaxToolRounds(step);
      const toolLimits = this.getToolLimits(step);
      const toolCallCounts = new Map<string, number>();

      for (let round = 0; round < maxToolRounds; round++) {
        response = await adapter.chatCompletion({
          model: resolved?.model ?? this.config.model,
          temperature: resolved?.temperature ?? this.config.temperature,
          maxTokens: resolved?.maxTokens ?? this.config.maxTokens,
          messages,
          tools: activeTools,
          toolChoice: "auto",
          ...(requestSignal?.signal ? { signal: requestSignal.signal } : {}),
        });

        await this.config.onEvent?.("llm_response", {
          stepName: step.name,
          agent: agentName ?? step.agent,
          model: response.model ?? resolved?.model ?? this.config.model,
          content: response.message.content,
          usage: response.usage,
          latencyMs: Date.now() - startedAt,
        });

        const toolCalls = response.message.toolCalls ?? [];
        if (toolCalls.length === 0) {
          return response;
        }

        messages.push({
          role: "assistant",
          content: response.message.content ?? "",
          toolCalls,
        });

        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const currentCount = (toolCallCounts.get(toolName) ?? 0) + 1;
          toolCallCounts.set(toolName, currentCount);

          const limit = toolLimits.get(toolName);
          if (limit !== undefined && currentCount > limit) {
            messages.push({
              role: "tool",
              toolCallId: toolCall.id,
              content: `Error: Tool '${toolName}' call limit exceeded (${limit} calls allowed, attempt ${currentCount}). Do not call this tool again.`,
            });
            continue;
          }

          const toolResult = await this.executeToolCall(toolCall);
          messages.push({
            role: "tool",
            toolCallId: toolCall.id,
            content: toolResult,
          });
        }
      }

      throw new Error(`Tool-call iteration limit (${maxToolRounds}) exceeded for step '${step.name}'`);
    } finally {
      requestSignal?.cleanup();
    }
  }

  private async executeToolCall(toolCall: ToolCall): Promise<string> {
    const args = this.parseToolArgs(toolCall.function.arguments);
    const handler = this.toolRegistry.get(toolCall.function.name);

    if (!handler) {
      return `Error: Unsupported tool '${toolCall.function.name}'`;
    }

    try {
      return await handler.execute(args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }
  }

  private parseToolArgs(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private resolveProjectPath(relativePath: string, options?: { allowNonExistentTarget?: boolean }): string {
    const projectRoot = realpathSync(process.cwd());
    const resolvedPath = resolve(projectRoot, relativePath);

    if (!options?.allowNonExistentTarget || existsSync(resolvedPath)) {
      const realTarget = realpathSync(resolvedPath);
      if (realTarget === projectRoot || realTarget.startsWith(`${projectRoot}${sep}`)) {
        return realTarget;
      }
      throw new Error("Path validation failed: target escapes project directory");
    }

    let nearestExistingAncestor = dirname(resolvedPath);
    while (!existsSync(nearestExistingAncestor)) {
      const parent = dirname(nearestExistingAncestor);
      if (parent === nearestExistingAncestor) {
        throw new Error("Path validation failed: no existing parent directory found");
      }
      nearestExistingAncestor = parent;
    }

    const realAncestor = realpathSync(nearestExistingAncestor);
    if (realAncestor === projectRoot || realAncestor.startsWith(`${projectRoot}${sep}`)) {
      return resolvedPath;
    }

    throw new Error("Path validation failed: parent escapes project directory");
  }

  private combineSignals(
    signal: AbortSignal | undefined,
    timeoutMs: number,
    stepName: string,
  ): { signal: AbortSignal; cleanup: () => void } | undefined {
    const shouldUseTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    let timeoutController: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (shouldUseTimeout) {
      timeoutController = new AbortController();
      timeout = setTimeout(() => {
        timeoutController?.abort(new Error(`LLM request timed out for step '${stepName}' after ${timeoutMs}ms`));
      }, timeoutMs);
    }

    const combined = this.combineAbortSignals(signal, timeoutController?.signal);

    if (!combined) {
      return undefined;
    }

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      if (timeout) {
        clearTimeout(timeout);
        timeout = undefined;
      }
      combined.cleanup();
    };

    return {
      signal: combined.signal,
      cleanup,
    };
  }

  private async withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => {
      timeoutController.abort(new Error(timeoutMessage));
    }, timeoutMs);

    try {
      return await Promise.race([
        task(timeoutController.signal),
        new Promise<never>((_, reject) => {
          timeoutController.signal.addEventListener(
            "abort",
            () => {
              reject(timeoutController.signal.reason ?? new Error(timeoutMessage));
            },
            { once: true },
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (!timeoutController.signal.aborted) {
        timeoutController.abort(new Error("Timeout guard cleaned up"));
      }
    }
  }

  private getToolLimits(step: WorkflowStep): Map<string, number> {
    const limits = new Map<string, number>();

    if (this.config.toolLimits) {
      for (const [name, limit] of Object.entries(this.config.toolLimits)) {
        if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
          limits.set(name, Math.floor(limit));
        }
      }
    }

    const config = (step.config ?? {}) as Record<string, unknown>;
    const stepToolLimits = config.toolLimits;
    if (stepToolLimits && typeof stepToolLimits === "object" && !Array.isArray(stepToolLimits)) {
      for (const [name, limit] of Object.entries(stepToolLimits as Record<string, unknown>)) {
        if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
          limits.set(name, Math.floor(limit));
        }
      }
    }

    return limits;
  }

  private getMaxToolRounds(step: WorkflowStep): number {
    const config = (step.config ?? {}) as Record<string, unknown>;
    const raw = config.maxToolRounds;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return Math.floor(raw);
    }
    return this.config.maxToolRounds ?? DEFAULT_MAX_TOOL_ROUNDS;
  }

  private getStepTimeoutMs(step: WorkflowStep): number {
    const config = (step.config ?? {}) as Record<string, unknown>;
    const raw = config.llmTimeoutMs ?? config.timeoutMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return 30_000;
  }

  private getConsensusTimeoutMs(
    step: WorkflowStep,
    participantCount: number,
    perRequestTimeoutMs: number,
  ): number {
    const config = (step.config ?? {}) as Record<string, unknown>;

    const topLevelTimeoutMs = config.consensusTimeoutMs;
    if (typeof topLevelTimeoutMs === "number" && Number.isFinite(topLevelTimeoutMs) && topLevelTimeoutMs > 0) {
      return topLevelTimeoutMs;
    }

    const consensusConfig =
      config.consensus && typeof config.consensus === "object"
        ? (config.consensus as Record<string, unknown>)
        : undefined;

    const nestedTimeoutMs = consensusConfig?.timeoutMs;
    if (typeof nestedTimeoutMs === "number" && Number.isFinite(nestedTimeoutMs) && nestedTimeoutMs > 0) {
      return nestedTimeoutMs;
    }

    const nestedTimeoutSec = consensusConfig?.timeout;
    if (typeof nestedTimeoutSec === "number" && Number.isFinite(nestedTimeoutSec) && nestedTimeoutSec > 0) {
      return nestedTimeoutSec * 1_000;
    }

    return perRequestTimeoutMs * participantCount * 2;
  }

  private getConsensusQuorumRule(
    step: WorkflowStep,
    totalVotes: number,
  ): { requiredApprovals: number; description: string } {
    const config = step.config;
    const rawQuorum = config && typeof config === "object" ? (config as Record<string, unknown>).quorum : undefined;

    if (typeof rawQuorum === "number" && Number.isFinite(rawQuorum) && rawQuorum > 0) {
      if (rawQuorum <= 1) {
        const requiredApprovals = Math.min(totalVotes, Math.max(1, Math.ceil(totalVotes * rawQuorum)));
        return {
          requiredApprovals,
          description: `${requiredApprovals}/${totalVotes} approvals (quorum=${rawQuorum})`,
        };
      }

      const requiredApprovals = Math.min(totalVotes, Math.max(1, Math.ceil(rawQuorum)));
      return {
        requiredApprovals,
        description: `${requiredApprovals}/${totalVotes} approvals (quorum=${rawQuorum})`,
      };
    }

    const requiredApprovals = Math.floor(totalVotes / 2) + 1;
    return {
      requiredApprovals,
      description: `${requiredApprovals}/${totalVotes} approvals; requires strict majority (>50%)`,
    };
  }

  private combineAbortSignals(
    ...signals: Array<AbortSignal | undefined>
  ): { signal: AbortSignal; cleanup: () => void } | undefined {
    const activeSignals = signals.filter((value): value is AbortSignal => value !== undefined);
    if (activeSignals.length === 0) {
      return undefined;
    }

    if (activeSignals.length === 1) {
      const signal = activeSignals[0];
      if (signal === undefined) return undefined;
      return {
        signal,
        cleanup: () => undefined,
      };
    }

    const controller = new AbortController();
    const removers: Array<() => void> = [];
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      for (const remove of removers) {
        remove();
      }
      removers.length = 0;
    };

    for (const source of activeSignals) {
      if (source.aborted) {
        cleanup();
        controller.abort(source.reason ?? new Error("Execution aborted"));
        return { signal: controller.signal, cleanup };
      }

      const onAbort = () => {
        cleanup();
        controller.abort(source.reason ?? new Error("Execution aborted"));
      };
      source.addEventListener("abort", onAbort, { once: true });
      removers.push(() => source.removeEventListener("abort", onAbort));
    }

    controller.signal.addEventListener("abort", cleanup, { once: true });

    return {
      signal: controller.signal,
      cleanup,
    };
  }

  private buildSystemPrompt(agentName?: string): string {
    const identity = (() => {
      if (!agentName) {
        return "You are a helpful AI assistant executing workflow steps.";
      }

      const info = normalizeAgentInfo(this.agents.get(agentName));
      const role = info.role ?? agentName;
      const description = info.description ?? "";
      return `You are ${role}.${description ? ` ${description}` : ""}`.trim();
    })();

    const now = new Date();
    const currentDateLine = `Current date (ISO): ${now.toISOString().slice(0, 10)}`;

    return [...OBR_GLOBAL_SYSTEM_PROMPT_LINES, currentDateLine, "", identity].join("\n").trim();
  }

  private buildUserPrompt(step: WorkflowStep, task: string, context: StepContext): string {
    const dependencyContext = (step.depends_on ?? [])
      .map((name) => ({ step: name, output: context.previousOutputs[name] }))
      .filter((entry) => entry.output !== undefined);

    const shouldIncludeRepairContext = Boolean(
      context.repairContext &&
      (context.repairContext.mode === "repair" || context.repairContext.latestValidation),
    );

    const repairContextLines = shouldIncludeRepairContext && context.repairContext
      ? [
          "",
          "Repair context:",
          `Mode: ${context.repairContext.mode}`,
          `Attempt: ${context.repairContext.attempt}`,
          context.repairContext.latestValidation
            ? `Latest validation result:\n${JSON.stringify(context.repairContext.latestValidation, null, 2)}`
            : "Latest validation result: none",
          context.repairContext.previousValidationResults && context.repairContext.previousValidationResults.length > 0
            ? `Previous validation history:\n${JSON.stringify(context.repairContext.previousValidationResults, null, 2)}`
            : undefined,
        ]
      : [];

    return [
      `Step: ${step.name}`,
      step.description ? `Description: ${step.description}` : undefined,
      "",
      "Task:",
      task,
      ...repairContextLines,
      "",
      dependencyContext.length > 0 ? `Previous outputs:\n${JSON.stringify(dependencyContext, null, 2)}` : "Previous outputs: none",
    ]
      .filter(Boolean)
      .join("\n");
  }

  private parseStructuredStepOutput(step: WorkflowStep, rawContent: string): unknown {
    const validationConfig = getValidationStepConfig(step.config);
    if (!validationConfig?.enabled) {
      return rawContent;
    }

    const parsed = this.tryParseStructuredContent(rawContent);
    const normalized = normalizeValidationResult(parsed);
    if (normalized) {
      return normalized;
    }

    if (validationConfig.emit_structured_result) {
      throw new Error(`Validation step '${step.name}' is configured for structured output but did not return a valid ValidationResult JSON payload`);
    }

    return rawContent;
  }

  private tryParseStructuredContent(rawContent: string): unknown {
    const trimmed = rawContent.trim();
    const normalized = trimmed.startsWith("```")
      ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")
      : trimmed;

    try {
      return JSON.parse(normalized);
    } catch {
      return undefined;
    }
  }

  private extractTask(step: WorkflowStep): string {
    const input = step.input;
    if (input && typeof input === "object") {
      const task = (input as Record<string, unknown>).task;
      if (typeof task === "string") {
        return task;
      }
    }

    if (step.description) {
      return step.description;
    }

    return `Execute workflow step '${step.name}'`;
  }
}

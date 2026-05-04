import type { ChatMessage, ToolCall, ToolDefinition } from "@obora/adapters";
import type { AgentFactory, LLMAdapterLike, ToolHandler } from "./runtime-types.js";
import type { WorkflowStep } from "./workflow.js";
import {
  getValidationStepConfig,
  normalizeValidationResult,
} from "./validation-repair.js";
import type {
  StepContext,
  StepResult,
  StepExecutorConfig,
} from "./step-executor-types.js";

export type { StepContext, StepResult, StepExecutorConfig } from "./step-executor-types.js";
export type { LLMAdapterLike } from "./runtime-types.js";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, normalize, resolve, sep } from "node:path";
import { findSchemaMismatchReason, loadMinimalJsonSchema } from "./schema-output.js";
import type { StepExecutionStrategy } from "./execution/strategies/types.js";
import { defaultStrategy } from "./execution/strategies/default-strategy.js";
import { consensusStrategy } from "./execution/strategies/consensus-strategy.js";
import { peerReviewStrategy } from "./execution/strategies/peer-review-strategy.js";
import { judgeStrategy } from "./execution/strategies/judge-strategy.js";

/**
 * A handler that pairs a tool definition with its execution logic.
 * Pass instances via StepExecutorConfig.tools to inject custom tools.
 */
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



/**
 * Build a Map of name → ToolHandler for the builtin file tools.
 * Kept as a factory so each StepExecutor gets its own bound handlers.
 */
function createBuiltinToolHandlers(
  resolveProjectPath: (path: string, opts?: { allowNonExistentTarget?: boolean }) => string
): Map<string, ToolHandler> {
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
  private readonly strategies: Map<string, StepExecutionStrategy>;

  constructor(
    private readonly llmAdapter: LLMAdapterLike,
    private readonly agents: Map<string, AgentFactory>,
    readonly config: StepExecutorConfig = {}
  ) {
    this.toolRegistry = this.buildToolRegistry();
    this.strategies = new Map<string, StepExecutionStrategy>([
      [consensusStrategy.pattern, consensusStrategy],
      [peerReviewStrategy.pattern, peerReviewStrategy],
      [judgeStrategy.pattern, judgeStrategy],
    ]);
  }

  private getProjectRoot(): string {
    return realpathSync(this.config.projectRoot ?? process.cwd());
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
    // Pattern-matched strategies
    if (step.pattern && this.strategies.has(step.pattern)) {
      const strategy = this.strategies.get(step.pattern)!;
      return strategy.execute(step, context, this);
    }

    // Judge mode is config-driven, not pattern-driven
    const judgeConfig = (step.config ?? {}) as Record<string, unknown>;
    if (
      judgeConfig.judge &&
      typeof judgeConfig.judge === "object" &&
      (judgeConfig.judge as Record<string, unknown>).enabled === true
    ) {
      return judgeStrategy.execute(step, context, this);
    }

    return defaultStrategy.execute(step, context, this);
  }




  /** @internal */
  async persistStepOutput(step: WorkflowStep, output: unknown): Promise<void> {
    const outputConfig = step.output;
    const outputPath = outputConfig && typeof outputConfig === "object" && typeof outputConfig.path === "string"
      ? outputConfig.path
      : undefined;

    if (!outputPath) return;

    const resolvedOutputPath = this.resolveProjectPath(outputPath, { allowNonExistentTarget: true });
    await mkdir(dirname(resolvedOutputPath), { recursive: true });

    const content = typeof output === "string"
      ? output.endsWith("\n") ? output : `${output}\n`
      : JSON.stringify(output, null, 2) + "\n";

    await writeFile(resolvedOutputPath, content, "utf-8");
  }

  /** @internal */
  parseStepOutputContract(step: WorkflowStep, parsedOutput: unknown): unknown {
    const output = step.output;
    const schemaPath = output && typeof output === "object" && typeof output.schema === "string"
      ? output.schema
      : undefined;

    if (!schemaPath) {
      return parsedOutput;
    }

    const resolvedSchemaPath = this.resolveProjectPath(schemaPath);
    if (!existsSync(resolvedSchemaPath)) {
      throw new Error(
        `[SCHEMA_1002] Missing schema file: ${schemaPath}
` +
          `Reason: step '${step.name}' declared output.schema but the file was not found
` +
          `Fix: create the schema file or correct output.schema path`
      );
    }

    let candidate = parsedOutput;
    if (typeof candidate === "string") {
      candidate = this.tryParseStructuredContent(candidate);
      if (candidate === undefined) {
        throw new Error(
          `[SCHEMA_1001] Invalid structured output for step '${step.name}'
` +
            `Reason: output.schema requires valid JSON output, but the model response was not parseable JSON
` +
            `Fix: instruct the model to return JSON only that matches the declared output contract`
        );
      }
    }

    const schema = loadMinimalJsonSchema(resolvedSchemaPath);
    const mismatchReason = findSchemaMismatchReason(candidate, schema);
    if (mismatchReason) {
      throw new Error(
        `[SCHEMA_1003] Output contract mismatch for step '${step.name}'
` +
          `Reason: ${mismatchReason}
` +
          `Fix: return JSON that matches the declared schema at ${schemaPath}`
      );
    }

    return candidate;
  }

  /** @internal */
  async requestForStep(step: WorkflowStep, context: StepContext, agentName?: string) {
    const task = this.extractTask(step);
    const systemPrompt = this.buildSystemPrompt(agentName ?? step.agent);
    const userPrompt = this.buildUserPrompt(step, task, context);

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    await this.config.onEvent?.("llm_request", {
      stepName: step.name,
      agent: agentName ?? step.agent,
      messages,
    });

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

      throw new Error(
        `Tool-call iteration limit (${maxToolRounds}) exceeded for step '${step.name}'`
      );
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

  /** @internal */
  resolveProjectPath(
    relativePath: string,
    options?: { allowNonExistentTarget?: boolean }
  ): string {
    const projectRoot = this.getProjectRoot();
    const resolvedPath = resolve(projectRoot, relativePath);

    // Always validate that the resolved path stays within project root
    const normalizedResolved = normalize(resolvedPath);
    const normalizedRoot = normalize(projectRoot);
    if (
      normalizedResolved !== normalizedRoot &&
      !normalizedResolved.startsWith(`${normalizedRoot}${sep}`)
    ) {
      throw new Error("Path validation failed: target escapes project directory");
    }

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
    stepName: string
  ): { signal: AbortSignal; cleanup: () => void } | undefined {
    const shouldUseTimeout = Number.isFinite(timeoutMs) && timeoutMs > 0;
    let timeoutController: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    if (shouldUseTimeout) {
      timeoutController = new AbortController();
      timeout = setTimeout(() => {
        timeoutController?.abort(
          new Error(`LLM request timed out for step '${stepName}' after ${timeoutMs}ms`)
        );
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

  /** @internal */
  async withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
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
            { once: true }
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

  /** @internal */
  getStepTimeoutMs(step: WorkflowStep): number {
    const config = (step.config ?? {}) as Record<string, unknown>;
    const raw = config.llmTimeoutMs ?? config.timeoutMs;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }

    return 30_000;
  }

  /** @internal */
  getConsensusTimeoutMs(
    step: WorkflowStep,
    participantCount: number,
    perRequestTimeoutMs: number
  ): number {
    const config = (step.config ?? {}) as Record<string, unknown>;

    const topLevelTimeoutMs = config.consensusTimeoutMs;
    if (
      typeof topLevelTimeoutMs === "number" &&
      Number.isFinite(topLevelTimeoutMs) &&
      topLevelTimeoutMs > 0
    ) {
      return topLevelTimeoutMs;
    }

    const consensusConfig =
      config.consensus && typeof config.consensus === "object"
        ? (config.consensus as Record<string, unknown>)
        : undefined;

    const nestedTimeoutMs = consensusConfig?.timeoutMs;
    if (
      typeof nestedTimeoutMs === "number" &&
      Number.isFinite(nestedTimeoutMs) &&
      nestedTimeoutMs > 0
    ) {
      return nestedTimeoutMs;
    }

    const nestedTimeoutSec = consensusConfig?.timeout;
    if (
      typeof nestedTimeoutSec === "number" &&
      Number.isFinite(nestedTimeoutSec) &&
      nestedTimeoutSec > 0
    ) {
      return nestedTimeoutSec * 1_000;
    }

    return perRequestTimeoutMs * participantCount * 2;
  }

  /** @internal */
  getConsensusQuorumRule(
    step: WorkflowStep,
    totalVotes: number
  ): { requiredApprovals: number; description: string } {
    const config = step.config;
    const rawQuorum =
      config && typeof config === "object" ? (config as Record<string, unknown>).quorum : undefined;

    if (typeof rawQuorum === "number" && Number.isFinite(rawQuorum) && rawQuorum > 0) {
      if (rawQuorum <= 1) {
        const requiredApprovals = Math.min(
          totalVotes,
          Math.max(1, Math.ceil(totalVotes * rawQuorum))
        );
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

  /** @internal */
  combineAbortSignals(
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
    const sharedMemoryContext = context.previousOutputs.__shared_memory__;

    const shouldIncludeRepairContext = Boolean(
      context.repairContext &&
      (context.repairContext.mode === "repair" || context.repairContext.latestValidation)
    );

    const repairContextLines =
      shouldIncludeRepairContext && context.repairContext
        ? [
            "",
            "Repair context:",
            `Mode: ${context.repairContext.mode}`,
            `Attempt: ${context.repairContext.attempt}`,
            context.repairContext.validationStep
              ? `Validation step: ${context.repairContext.validationStep}`
              : undefined,
            typeof context.repairContext.repeatedSignatureCount === "number"
              ? `Repeated signature count: ${context.repairContext.repeatedSignatureCount}`
              : undefined,
            typeof context.repairContext.maxNoProgressIterations === "number"
              ? `No-progress ceiling: ${context.repairContext.maxNoProgressIterations}`
              : undefined,
            typeof context.repairContext.repeatedCriticalIssueCeiling === "number"
              ? `Repeated critical issue ceiling: ${context.repairContext.repeatedCriticalIssueCeiling}`
              : undefined,
            context.repairContext.latestValidation
              ? `Latest validation result:\n${JSON.stringify(context.repairContext.latestValidation, null, 2)}`
              : "Latest validation result: none",
            context.repairContext.previousValidationResults &&
            context.repairContext.previousValidationResults.length > 0
              ? `Previous validation history:\n${JSON.stringify(context.repairContext.previousValidationResults, null, 2)}`
              : undefined,
            context.repairContext.reflectorHint
              ? `\nReflector analysis: ${context.repairContext.reflectorHint}`
              : undefined,
          ]
        : [];

    const hookOutputLines =
      context.hookOutputs && Object.keys(context.hookOutputs).length > 0
        ? ["", "Hook outputs:", JSON.stringify(context.hookOutputs, null, 2)]
        : [];

    return [
      `Step: ${step.name}`,
      step.description ? `Description: ${step.description}` : undefined,
      "",
      "Task:",
      task,
      ...repairContextLines,
      ...hookOutputLines,
      "",
      dependencyContext.length > 0
        ? `Previous outputs:\n${JSON.stringify(dependencyContext, null, 2)}`
        : "Previous outputs: none",
      sharedMemoryContext
        ? `\nShared memory context:\n${JSON.stringify(sharedMemoryContext, null, 2)}`
        : undefined,
    ]
      .filter(Boolean)
      .join("\n");
  }

  /** @internal */
  parseStructuredStepOutput(step: WorkflowStep, rawContent: string): unknown {
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
      throw new Error(
        `Validation step '${step.name}' is configured for structured output but did not return a valid ValidationResult JSON payload`
      );
    }

    return rawContent;
  }

  /** @internal */
  tryParseStructuredContent(rawContent: string): unknown {
    const trimmed = rawContent.trim();

    const direct = this.tryParseJson(trimmed);
    if (direct !== undefined) return direct;

    const fencedMatches = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
    for (const match of fencedMatches) {
      const candidate = match[1]?.trim();
      const parsed = candidate ? this.tryParseJson(candidate) : undefined;
      if (parsed !== undefined) return parsed;
    }

    const embedded = this.extractEmbeddedJson(trimmed);
    if (embedded) {
      const parsed = this.tryParseJson(embedded);
      if (parsed !== undefined) return parsed;
    }

    return undefined;
  }

  private tryParseJson(candidate: string): unknown {
    try {
      return JSON.parse(candidate);
    } catch {
      return undefined;
    }
  }

  private extractEmbeddedJson(text: string): string | undefined {
    const start = [...text].findIndex((char) => char === "{" || char === "[");
    if (start < 0) return undefined;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i]!;

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (char === "\\") {
          escaped = true;
          continue;
        }
        if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        stack.push("}");
        continue;
      }
      if (char === "[") {
        stack.push("]");
        continue;
      }
      if ((char === "}" || char === "]") && stack.at(-1) === char) {
        stack.pop();
        if (stack.length === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return undefined;
  }

  /** @internal */
  extractTask(step: WorkflowStep): string {
    const input = step.input;
    if (input && typeof input === "object") {
      const task = (input as Record<string, unknown>).task;
      if (typeof task === "string") {
        return this.applyBindings(task, input as Record<string, unknown>);
      }
    }

    if (step.description) {
      return step.description;
    }

    return `Execute workflow step '${step.name}'`;
  }

  private applyBindings(task: string, input: Record<string, unknown>): string {
    const bindings = input.bindings;
    if (!bindings || typeof bindings !== "object") {
      return task;
    }

    let rendered = task;
    for (const [name, rawBinding] of Object.entries(bindings as Record<string, unknown>)) {
      if (!rawBinding || typeof rawBinding !== "object") continue;
      const binding = rawBinding as Record<string, unknown>;
      const pathValue = binding.path;
      if (typeof pathValue !== "string") continue;
      const kind = typeof binding.kind === "string" ? binding.kind : "text";
      const required = binding.required !== false;
      const content = this.loadBindingContent(pathValue, kind, required, name);
      rendered = rendered.replaceAll(`{{${name}}}`, content);
    }
    return rendered;
  }

  private loadBindingContent(pathValue: string, kind: string, required: boolean, name: string): string {
    const filePath = this.resolveProjectPath(pathValue);
    try {
      const raw = readFileSync(filePath, "utf-8");
      if (kind === "json") {
        const parsed = JSON.parse(raw) as unknown;
        return JSON.stringify(parsed, null, 2);
      }
      return raw;
    } catch (error) {
      if (!required) return "";
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `[BIND_1001] Missing input artifact: ${pathValue}
` +
          `Reason: the declared binding '${name}' could not be resolved (${message})
` +
          `Fix: create the input artifact before execution or correct the binding path`
      );
    }
  }
}

import type { ChatMessage, ToolCall, ToolDefinition } from "@obora/adapters";
import type { AgentFactory, LLMAdapterLike, ToolHandler, ExecutionTrace } from "./runtime-types.js";
import type { WorkflowStep } from "./workflow.js";
import { validateTraceSync } from "./execution/trace-validation.js";
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


function normalizeAgentInfo(factory?: AgentFactory): { role?: string; description?: string; prompt?: string } {
  if (!factory) return {};
  const instance = factory();
  if (!instance || typeof instance !== "object") return {};
  const value = instance as Record<string, unknown>;
  return {
    role: typeof value.role === "string" ? value.role : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    prompt: typeof value.prompt === "string" ? value.prompt : undefined,
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
      builtins.forEach((handler, name) => {
        registry.set(name, handler);
      });
    }

    if (this.config.tools) {
      this.config.tools.forEach((handler) => {
        registry.set(handler.definition.function.name, handler);
      });
    }

    return registry;
  }

  private getActiveToolDefinitions(): ToolDefinition[] {
    return Array.from(this.toolRegistry.values()).map((h) => h.definition);
  }

  async executeStep(step: WorkflowStep, context: StepContext): Promise<StepResult> {
    const result =
      step.pattern && this.strategies.has(step.pattern)
        ? await this.strategies.get(step.pattern)!.execute(step, context, this)
        : (step.config ?? {}).judge &&
            typeof (step.config ?? {}).judge === "object" &&
            ((step.config ?? {}).judge as Record<string, unknown>).enabled === true
          ? await judgeStrategy.execute(step, context, this)
          : await defaultStrategy.execute(step, context, this);

    const traceEnabled =
      step.config?.execution_traces?.enabled ??
      context.traceConfig?.enabled ??
      true;

    if (traceEnabled && !result.trace) {
      (result as StepResult).trace = this.buildExecutionTrace(step, context, result);
    }

    if (traceEnabled && result.trace) {
      await this.enrichTrace(result.trace, step, result, context);
      this.validateTrace(step, result.trace, context);
    }

    return result;
  }

  private buildExecutionTrace(
    step: WorkflowStep,
    context: StepContext,
    result: StepResult
  ): ExecutionTrace {
    const now = new Date();
    const agentName = step.agent ?? "unknown";
    const agentInfo = normalizeAgentInfo(this.agents.get(agentName));
    const toolsUsed = this.extractToolsUsed(result);
    const fileMods = this.extractFileModifications(result);
    const { issues, workarounds } = this.extractIssuesAndWorkarounds(context);
    const constraints = this.extractConstraints(step);

    return {
      step: step.name,
      agent: agentName,
      timestamp: now.toISOString(),
      version: "1.0",

      task_summary: this.extractTask(step),
      methodology: this.inferMethodology(step),
      tools_used: toolsUsed,

      key_decisions: [],
      decision_rationale: "",
      alternatives_considered: [],

      assumptions: [],
      constraints,
      risks_identified: [],

      inputs_processed: this.extractInputsProcessed(context),
      dependencies_used: (step.depends_on ?? []).map((dep) => ({
        step: dep,
        purpose: `Input from upstream step '${dep}'`,
      })),

      output_summary: this.summarizeOutput(result.output),
      output_format: this.detectOutputFormat(result.output),
      artifacts_created: this.extractArtifacts(step, result, fileMods),

      issues_encountered: issues,
      workarounds_applied: workarounds,
      confidence_level: this.inferConfidenceLevel(step, context),
      known_limitations: [],

      implications_for_next: this.inferImplications(step, result),
      recommended_next: [],
      open_questions: [],
      context_for_successors: this.buildContextForSuccessors(step, result, agentInfo, fileMods),
    };
  }

  private validateTrace(
    step: WorkflowStep,
    trace: ExecutionTrace | undefined,
    context: StepContext
  ): void {
    const mode =
      step.config?.execution_traces?.validation ??
      context.traceConfig?.validation ??
      this.config.traceValidation ??
      "strict";
    if (mode === "off" || !trace) return;

    const validation = validateTraceSync(trace as unknown as Record<string, unknown>, step.name);
    if (validation.success) return;

    const issueSummary = validation.error.issues.map((i) => `${i.path}: ${i.message}`).join("; ");
    const message = `Execution trace validation failed for step '${step.name}': ${issueSummary}`;

    if (mode === "strict") {
      throw new Error(`[TRACE_1001] ${message}`);
    }

    this.config.logger?.warn?.(`[trace-validation] ${message}`);
  }

  private async enrichTrace(
    trace: ExecutionTrace,
    step: WorkflowStep,
    result: StepResult,
    context: StepContext
  ): Promise<void> {
    const mode =
      step.config?.execution_traces?.enrichment ??
      context.traceConfig?.enrichment ??
      this.config.traceEnrichment ??
      "none";
    if (mode === "none") return;

    if (mode === "heuristic") {
      const enriched = this.enrichTraceHeuristically(trace, result);
      trace.key_decisions = enriched.key_decisions;
      trace.assumptions = enriched.assumptions;
      trace.risks_identified = enriched.risks_identified;
      return;
    }

    if (mode === "llm") {
      const enriched = await this.enrichTraceWithLLM(trace, step, result);
      trace.key_decisions = enriched.key_decisions;
      trace.assumptions = enriched.assumptions;
      trace.risks_identified = enriched.risks_identified;
    }
  }

  private enrichTraceHeuristically(
    trace: ExecutionTrace,
    result: StepResult
  ): { key_decisions: string[]; assumptions: string[]; risks_identified: string[] } {
    const text = typeof result.output === "string" ? result.output : JSON.stringify(result.output);
    const sentences = text.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 0);

    const decisionPatterns = [
      /(?:decided|chose|opted|selected|determined) (?:to|for|that) (.+)/i,
      /(?:will|shall) (.+)/i,
      /(?:using|implemented|applied|configured) (.+)/i,
    ];

    const assumptionPatterns = [
      /(?:assuming|assumed|given|provided|since|as|because) (?:that)? (.+)/i,
      /(?:if|when|where) (.+)/i,
      /(?:based on|relying on|depending on) (.+)/i,
    ];

    const riskPatterns = [
      /(?:risk|concern|warning|caution|issue|problem|limitation) (?:is|of|that|with) (.+)/i,
      /(?:may|might|could|potentially) (?:cause|lead|result|fail) (.+)/i,
      /(?:not|doesn'?t|won'?t|can'?t) (?:support|handle|work|guarantee) (.+)/i,
    ];

    const extractMatches = (patterns: RegExp[]) =>
      sentences
        .flatMap((sentence) =>
          patterns
            .map((pattern) => {
              const match = pattern.exec(sentence);
              return match ? (match[1] ?? "").trim() : undefined;
            })
            .filter((m): m is string => m !== undefined && m.length > 0)
        )
        .filter((value, index, self) => self.indexOf(value) === index);

    return {
      key_decisions: extractMatches(decisionPatterns),
      assumptions: extractMatches(assumptionPatterns),
      risks_identified: extractMatches(riskPatterns),
    };
  }

  private async enrichTraceWithLLM(
    trace: ExecutionTrace,
    step: WorkflowStep,
    result: StepResult
  ): Promise<{ key_decisions: string[]; assumptions: string[]; risks_identified: string[] }> {
    const prompt = `Analyze this workflow step execution and extract subjective insights.

Step: ${step.name}
Agent: ${step.agent ?? "unknown"}
Task: ${trace.task_summary}
Output: ${typeof result.output === "string" ? result.output : JSON.stringify(result.output)}

Extract the following as JSON arrays of short phrases (max 10 words each):
- key_decisions: What major choices did the agent make?
- assumptions: What did the agent assume to be true?
- risks_identified: What risks or limitations did the agent note?

Respond ONLY with valid JSON in this exact format:
{"key_decisions":["..."],"assumptions":["..."],"risks_identified":["..."]}`;

    try {
      const response = await this.llmAdapter.chatCompletion({
        model: this.config.model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        maxTokens: 500,
      });

      const content = response.message.content ?? "";
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { key_decisions: [], assumptions: [], risks_identified: [] };

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      return {
        key_decisions: Array.isArray(parsed.key_decisions)
          ? parsed.key_decisions.filter((d): d is string => typeof d === "string")
          : [],
        assumptions: Array.isArray(parsed.assumptions)
          ? parsed.assumptions.filter((a): a is string => typeof a === "string")
          : [],
        risks_identified: Array.isArray(parsed.risks_identified)
          ? parsed.risks_identified.filter((r): r is string => typeof r === "string")
          : [],
      };
    } catch (error) {
      this.config.logger?.warn?.(
        `[trace-enrichment] LLM enrichment failed for step '${step.name}':`,
        error
      );
      return { key_decisions: [], assumptions: [], risks_identified: [] };
    }
  }

  private inferMethodology(step: WorkflowStep): string {
    if (step.pattern) {
      return `Pattern-based execution: ${step.pattern}`;
    }
    if (step.tool) {
      return `Tool-assisted execution: ${step.tool}`;
    }
    return "Standard agent execution";
  }

  private extractToolsUsed(result: StepResult): string[] {
    const raw = result.raw as Record<string, unknown> | undefined;
    if (!raw) return [];
    const message = raw.message as Record<string, unknown> | undefined;
    if (!message) return [];
    const toolCalls = message.toolCalls as Array<{ function?: { name?: string } }> | undefined;
    if (!Array.isArray(toolCalls)) return [];

    const names = toolCalls
      .map((tc) => tc.function?.name)
      .filter((name): name is string => typeof name === "string");
    return [...new Set(names)];
  }

  private extractFileModifications(result: StepResult): Array<{ action: "create" | "modify"; path: string }> {
    const raw = result.raw as Record<string, unknown> | undefined;
    if (!raw) return [];
    const message = raw.message as Record<string, unknown> | undefined;
    if (!message) return [];
    const toolCalls = message.toolCalls as Array<{ function?: { name?: string; arguments?: string } }> | undefined;
    if (!Array.isArray(toolCalls)) return [];

    return toolCalls
      .filter((tc) => tc.function?.name === "file_write")
      .map((tc) => {
        const argsStr = tc.function?.arguments;
        if (typeof argsStr !== "string") return undefined;
        try {
          const args = JSON.parse(argsStr) as Record<string, unknown>;
          const path = typeof args.path === "string" ? args.path : undefined;
          return path ? { action: "create" as "create" | "modify", path } : undefined;
        } catch {
          return undefined;
        }
      })
      .filter((mod): mod is { action: "create" | "modify"; path: string } => mod !== undefined);
  }

  private extractInputsProcessed(context: StepContext): string[] {
    return Object.entries(context.previousOutputs).map(([key, value]) => {
      const summary = typeof value === "string"
        ? (value.length > 100 ? `${value.slice(0, 100)}...` : value)
        : JSON.stringify(value).slice(0, 100);
      return `${key}: ${summary}`;
    });
  }

  private extractConstraints(step: WorkflowStep): string[] {
    const cfg = step.config ?? {};
    const baseConstraints = [
      cfg.maxTokens ? `maxTokens: ${cfg.maxTokens}` : undefined,
      cfg.temperature !== undefined ? `temperature: ${cfg.temperature}` : undefined,
      cfg.timeout ? `timeout: ${cfg.timeout}ms` : undefined,
      cfg.maxToolRounds ? `maxToolRounds: ${cfg.maxToolRounds}` : undefined,
    ].filter((c): c is string => c !== undefined);

    const toolLimitConstraints = cfg.toolLimits && typeof cfg.toolLimits === "object"
      ? Object.entries(cfg.toolLimits).map(([tool, limit]) => `toolLimit[${tool}]: ${limit}`)
      : [];

    return [...baseConstraints, ...toolLimitConstraints];
  }

  private extractIssuesAndWorkarounds(context: StepContext): { issues: string[]; workarounds: string[] } {
    const repair = context.repairContext;
    if (!repair) return { issues: [], workarounds: [] };

    const issues = [
      repair.mode === "repair" ? `Repair attempt ${repair.attempt}` : undefined,
      repair.latestValidation && !repair.latestValidation.passed
        ? `Validation failed: ${repair.latestValidation.summary}`
        : undefined,
      ...(repair.latestValidation?.failedChecks ?? []).map(
        (check) => `- ${check.name}: ${check.message}`
      ),
    ].filter((i): i is string => i !== undefined);

    const workarounds = [
      (repair.repeatedSignatureCount ?? 0) > 0
        ? `Repeated signature detected ${repair.repeatedSignatureCount} times; attempting alternative approach`
        : undefined,
      repair.reflectorHint
        ? `Reflector hint applied: ${repair.reflectorHint}`
        : undefined,
      repair.forceTarget
        ? `Forced redirect to step: ${repair.forceTarget}`
        : undefined,
    ].filter((w): w is string => w !== undefined);

    return { issues, workarounds };
  }

  private inferConfidenceLevel(step: WorkflowStep, context: StepContext): "low" | "medium" | "high" {
    const repair = context.repairContext;
    const attempt = repair?.attempt ?? 0;
    const pattern = step.pattern;

    if (pattern === "consensus" || pattern === "judge") return "high";
    if (attempt > 2) return "low";
    if (attempt > 0 || pattern === "peer-review") return "medium";
    return "high";
  }

  private inferImplications(step: WorkflowStep, result: StepResult): string[] {
    const implications: string[] = [];
    if (step.output?.path) {
      implications.push(`Output artifact available at ${step.output.path}`);
    }
    if (step.output?.schema) {
      implications.push(`Output conforms to schema ${step.output.schema}`);
    }
    const raw = result.raw as Record<string, unknown> | undefined;
    const finishReason = raw?.finishReason as string | undefined;
    if (finishReason === "length") {
      implications.push("Output may be truncated due to token limit");
    }
    return implications;
  }

  private buildContextForSuccessors(
    step: WorkflowStep,
    result: StepResult,
    agentInfo: { role?: string; description?: string; prompt?: string },
    fileMods: Array<{ action: string; path: string }>
  ): string {
    const parts: string[] = [];
    parts.push(`Step '${step.name}' completed by ${step.agent ?? "unknown"}.`);
    if (agentInfo.role) parts.push(`Role: ${agentInfo.role}.`);

    const outputSummary = this.summarizeOutput(result.output);
    if (outputSummary && outputSummary !== "Structured output") {
      parts.push(`Output: ${outputSummary}`);
    }

    if (fileMods.length > 0) {
      const modList = fileMods.map((m) => m.path).join(", ");
      parts.push(`Files modified: ${modList}`);
    }

    const toolsUsed = this.extractToolsUsed(result);
    if (toolsUsed.length > 0) {
      parts.push(`Tools used: ${toolsUsed.join(", ")}`);
    }

    return parts.join(" ");
  }

  private summarizeOutput(output: unknown): string {
    if (typeof output === "string") {
      const maxLen = 200;
      return output.length > maxLen ? `${output.slice(0, maxLen)}...` : output;
    }
    return "Structured output";
  }

  private detectOutputFormat(output: unknown): string {
    if (typeof output === "string") {
      if (output.startsWith("{")) return "json";
      if (output.startsWith("#")) return "markdown";
      return "text";
    }
    return typeof output === "object" ? "structured" : "unknown";
  }

  private extractArtifacts(
    step: WorkflowStep,
    result: StepResult,
    fileMods?: Array<{ action: string; path: string }>
  ): string[] {
    const baseArtifacts = step.output?.path ? [step.output.path] : [];
    const modPaths = (fileMods ?? this.extractFileModifications(result)).map((mod) => mod.path);
    return [...new Set([...baseArtifacts, ...modPaths])];
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

    const candidate =
      typeof parsedOutput === "string"
        ? this.tryParseStructuredContent(parsedOutput)
        : parsedOutput;
    if (candidate === undefined) {
        throw new Error(
          `[SCHEMA_1001] Invalid structured output for step '${step.name}'
` +
            `Reason: output.schema requires valid JSON output, but the model response was not parseable JSON
` +
            `Fix: instruct the model to return JSON only that matches the declared output contract`
        );
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
      const maxToolRounds = this.getMaxToolRounds(step);
      const toolLimits = this.getToolLimits(step);
      const toolCallCounts = new Map<string, number>();
      const executeToolCalls = (toolCalls: ToolCall[]): Promise<void> =>
        toolCalls.reduce(
          async (previous, toolCall) => {
            await previous;
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
              return;
            }

            const toolResult = await this.executeToolCall(toolCall);
            messages.push({
              role: "tool",
              toolCallId: toolCall.id,
              content: toolResult,
            });
          },
          Promise.resolve()
        );
      const executeToolRound = async (
        round: number
      ): Promise<Awaited<ReturnType<LLMAdapterLike["chatCompletion"]>>> => {
        if (round >= maxToolRounds) {
          throw new Error(
            `Tool-call iteration limit (${maxToolRounds}) exceeded for step '${step.name}'`
          );
        }

        const response = await adapter.chatCompletion({
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

        await executeToolCalls(toolCalls);
        return executeToolRound(round + 1);
      };

      return await executeToolRound(0);
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

    const findNearestExistingAncestor = (candidate: string): string => {
      if (existsSync(candidate)) {
        return candidate;
      }
      const parent = dirname(candidate);
      if (parent === candidate) {
        throw new Error("Path validation failed: no existing parent directory found");
      }
      return findNearestExistingAncestor(parent);
    };

    const nearestExistingAncestor = findNearestExistingAncestor(dirname(resolvedPath));
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
    const timeoutController = shouldUseTimeout ? new AbortController() : undefined;
    const timeout =
      timeoutController !== undefined
        ? setTimeout(() => {
        timeoutController?.abort(
          new Error(`LLM request timed out for step '${stepName}' after ${timeoutMs}ms`)
        );
          }, timeoutMs)
        : undefined;

    const combined = this.combineAbortSignals(signal, timeoutController?.signal);

    if (!combined) {
      return undefined;
    }

    const cleanupState = { cleanedUp: false };
    const cleanup = () => {
      if (cleanupState.cleanedUp) {
        return;
      }
      cleanupState.cleanedUp = true;
      if (timeout) {
        clearTimeout(timeout);
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
      Object.entries(this.config.toolLimits).forEach(([name, limit]) => {
        if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
          limits.set(name, Math.floor(limit));
        }
      });
    }

    const config = (step.config ?? {}) as Record<string, unknown>;
    const stepToolLimits = config.toolLimits;
    if (stepToolLimits && typeof stepToolLimits === "object" && !Array.isArray(stepToolLimits)) {
      Object.entries(stepToolLimits as Record<string, unknown>).forEach(([name, limit]) => {
        if (typeof limit === "number" && Number.isFinite(limit) && limit >= 0) {
          limits.set(name, Math.floor(limit));
        }
      });
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
    const cleanupState = { cleanedUp: false };

    const cleanup = () => {
      if (cleanupState.cleanedUp) {
        return;
      }
      cleanupState.cleanedUp = true;
      removers.forEach((remove) => remove());
      removers.length = 0;
    };

    const abortedSignal = activeSignals.find((source) => source.aborted);
    if (abortedSignal) {
        cleanup();
      controller.abort(abortedSignal.reason ?? new Error("Execution aborted"));
        return { signal: controller.signal, cleanup };
    }

    activeSignals.forEach((source) => {
      const onAbort = () => {
        cleanup();
        controller.abort(source.reason ?? new Error("Execution aborted"));
      };
      source.addEventListener("abort", onAbort, { once: true });
      removers.push(() => source.removeEventListener("abort", onAbort));
    });

    controller.signal.addEventListener("abort", cleanup, { once: true });

    return {
      signal: controller.signal,
      cleanup,
    };
  }

  private buildSystemPrompt(agentName?: string): string {
    const info = agentName ? normalizeAgentInfo(this.agents.get(agentName)) : {};

    const identity = (() => {
      if (!agentName) {
        return "You are a helpful AI assistant executing workflow steps.";
      }

      const role = info.role ?? agentName;
      const description = info.description ?? "";
      return `You are ${role}.${description ? ` ${description}` : ""}`.trim();
    })();

    const agentPrompt = info.prompt;

    const now = new Date();
    const currentDateLine = `Current date (ISO): ${now.toISOString().slice(0, 10)}`;

    const parts: string[] = [
      ...OBR_GLOBAL_SYSTEM_PROMPT_LINES,
      currentDateLine,
    ];

    if (agentPrompt) {
      parts.push("", "[Agent Instructions]", agentPrompt);
    }

    parts.push("", identity);

    return parts.join("\n").trim();
  }

  private buildUserPrompt(step: WorkflowStep, task: string, context: StepContext): string {
    const dependencyContext = (step.depends_on ?? [])
      .map((name) => ({ step: name, output: context.previousOutputs[name] }))
      .filter((entry) => entry.output !== undefined);
    const sharedMemoryContext = context.previousOutputs.__shared_memory__;
    const traces = context.traces ?? {};

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

    const upstreamTraces = (step.depends_on ?? [])
      .map((name) => traces[name])
      .filter((trace): trace is ExecutionTrace => trace !== undefined);

    const maxHistorySteps = step.config?.execution_traces?.maxHistorySteps ?? context.traceConfig?.maxHistorySteps ?? 3;
    const compactedTraces = this.compactTraces(upstreamTraces, maxHistorySteps);

    const traceLines = compactedTraces.length > 0
      ? [
          "",
          "=== Execution History ===",
          ...upstreamTraces.flatMap((trace) => [
            `\n### ${trace.step} (${trace.agent})`,
            `**Task:** ${trace.task_summary}`,
            trace.methodology ? `**Methodology:** ${trace.methodology}` : undefined,
            trace.key_decisions.length > 0
              ? `**Key Decisions:**\n${trace.key_decisions.map((d) => `- ${d}`).join("\n")}`
              : undefined,
            trace.assumptions.length > 0
              ? `**Assumptions:**\n${trace.assumptions.map((a) => `- ${a}`).join("\n")}`
              : undefined,
            trace.constraints.length > 0
              ? `**Constraints:**\n${trace.constraints.map((c) => `- ${c}`).join("\n")}`
              : undefined,
            trace.context_for_successors
              ? `**Context:** ${trace.context_for_successors}`
              : undefined,
          ]),
        ]
      : [];

    return [
      `Step: ${step.name}`,
      step.description ? `Description: ${step.description}` : undefined,
      "",
      "Task:",
      task,
      ...repairContextLines,
      ...hookOutputLines,
      ...traceLines,
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

  private compactTraces(traces: ExecutionTrace[], maxCount: number): ExecutionTrace[] {
    if (traces.length <= maxCount) return traces;

    const scored = traces.map((trace) => ({
      trace,
      score:
        new Date(trace.timestamp).getTime() / 1_000_000_000 +
        (trace.issues_encountered.length > 0 ? 100 : 0) +
        (trace.artifacts_created.length > 0 ? 50 : 0) +
        (trace.key_decisions.length > 0 ? 30 : 0),
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxCount)
      .map((s) => s.trace);
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

    const fencedParsed = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)]
      .map((match) => {
        const candidate = match[1]?.trim();
        return candidate ? this.tryParseJson(candidate) : undefined;
      })
      .find((parsed) => parsed !== undefined);
    if (fencedParsed !== undefined) return fencedParsed;

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
    type ScanState = {
      index: number;
      stack: string[];
      inString: boolean;
      escaped: boolean;
    };
    const scan = ({ index, stack: currentStack, inString, escaped }: ScanState): string | undefined => {
      if (index >= text.length) {
        return undefined;
      }

      const char = text[index]!;

      if (inString && escaped) {
        return scan({ index: index + 1, stack: currentStack, inString, escaped: false });
      }

      if (inString && char === "\\") {
        return scan({ index: index + 1, stack: currentStack, inString, escaped: true });
      }

      if (inString && char === '"') {
        return scan({ index: index + 1, stack: currentStack, inString: false, escaped: false });
      }

      if (inString) {
        return scan({ index: index + 1, stack: currentStack, inString, escaped: false });
      }

      if (char === '"') {
        return scan({ index: index + 1, stack: currentStack, inString: true, escaped: false });
      }

      if (char === "{") {
        return scan({ index: index + 1, stack: [...currentStack, "}"], inString, escaped: false });
      }

      if (char === "[") {
        return scan({ index: index + 1, stack: [...currentStack, "]"], inString, escaped: false });
      }

      if ((char === "}" || char === "]") && currentStack.at(-1) === char) {
        const nextStack = currentStack.slice(0, -1);
        return nextStack.length === 0
          ? text.slice(start, index + 1)
          : scan({ index: index + 1, stack: nextStack, inString, escaped: false });
      }

      return scan({ index: index + 1, stack: currentStack, inString, escaped: false });
    };

    return scan({ index: start, stack, inString: false, escaped: false });
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

    return Object.entries(bindings as Record<string, unknown>).reduce((rendered, [name, rawBinding]) => {
      if (!rawBinding || typeof rawBinding !== "object") return rendered;
      const binding = rawBinding as Record<string, unknown>;
      const pathValue = binding.path;
      if (typeof pathValue !== "string") return rendered;
      const kind = typeof binding.kind === "string" ? binding.kind : "text";
      const required = binding.required !== false;
      const content = this.loadBindingContent(pathValue, kind, required, name);
      return rendered.replaceAll(`{{${name}}}`, content);
    }, task);
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
          `Fix: create the input artifact before execution or correct the binding path`,
        { cause: error }
      );
    }
  }
}

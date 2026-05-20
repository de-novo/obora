import type { ToolCall } from "@obora/adapters";
import type { WorkflowStep } from "../../workflow.js";
import type { StepContext, StepResult, StepExecutorConfig } from "../../step-executor-types.js";

/**
 * Shared services exposed to step execution strategies.
 * These are the stable primitives that strategies need from the executor engine.
 */
export interface StepExecutionServices {
  /** Make an LLM request for a step, including tool-call loops. */
  requestForStep(
    step: WorkflowStep,
    context: StepContext,
    agentName?: string
  ): Promise<{
    model?: string;
    message: {
      role: "assistant";
      content: string | null;
      toolCalls?: ToolCall[];
    };
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    };
    toolCalls?: ReadonlyArray<ToolCall>;
  }>;

  /** Persist step output to the configured path, if any. */
  persistStepOutput(step: WorkflowStep, output: unknown): Promise<void>;

  /** Validate parsed output against a declared JSON schema, if any. */
  parseStepOutputContract(step: WorkflowStep, parsedOutput: unknown): unknown;

  /** Parse raw LLM content through validation/normalization filters. */
  parseStructuredStepOutput(step: WorkflowStep, rawContent: string): unknown;

  /** Resolve a project-relative path with security validation. */
  resolveProjectPath(
    relativePath: string,
    opts?: { allowNonExistentTarget?: boolean }
  ): string;

  /** Run a task with an AbortSignal that fires after timeoutMs. */
  withTimeout<T>(
    task: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    timeoutMessage: string
  ): Promise<T>;

  /** Per-step LLM timeout in ms. */
  getStepTimeoutMs(step: WorkflowStep): number;

  /** Total timeout for consensus-style steps. */
  getConsensusTimeoutMs(
    step: WorkflowStep,
    participantCount: number,
    perRequestTimeoutMs: number
  ): number;

  /** Quorum rule for consensus steps. */
  getConsensusQuorumRule(
    step: WorkflowStep,
    totalVotes: number
  ): { requiredApprovals: number; description: string };

  /** Combine multiple AbortSignals into one. */
  combineAbortSignals(
    ...signals: Array<AbortSignal | undefined>
  ): { signal: AbortSignal; cleanup: () => void } | undefined;

  /** Extract the task string for a step. */
  extractTask(step: WorkflowStep): string;

  /** Try to parse JSON from raw LLM content (handles fences, embedded JSON). */
  tryParseStructuredContent(rawContent: string): unknown;

  /** Executor configuration. */
  readonly config: StepExecutorConfig;
}

/**
 * Strategy interface for executing a workflow step with a specific pattern.
 */
export interface StepExecutionStrategy {
  /** Unique pattern name this strategy handles (e.g. "consensus", "peer-review"). */
  readonly pattern: string;

  /**
   * Execute the step.
   * @param step — the workflow step definition
   * @param context — runtime context (previous outputs, signals, repair context)
   * @param services — shared executor services
   */
  execute(
    step: WorkflowStep,
    context: StepContext,
    services: StepExecutionServices
  ): Promise<StepResult>;
}

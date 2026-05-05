import type { RepairContext } from "./validation-repair.js";
import type { HookExecutionResult, WorkflowHookLifecycle } from "./hooks.js";
import type { LLMAdapterLike, ToolHandler } from "./runtime-types.js";

export interface StepContext<TPreviousOutputs extends Record<string, unknown> = Record<string, unknown>> {
  previousOutputs: TPreviousOutputs;
  signal?: AbortSignal;
  repairContext?: RepairContext;
  hookOutputs?: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>>;
}

export interface StepResult<TOutput = unknown> {
  output: TOutput;
  raw?: unknown;
  votes?: Array<{
    participant: string;
    vote: "APPROVE" | "REJECT" | "REQUEST_CHANGES";
    response: string;
  }>;
  scores?: Array<{
    reviewer: string;
    score: number;
    reasoning?: string;
  }>;
}

export interface StepExecutorConfig {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  verbose?: boolean;
  /** Project root directory for path resolution. Defaults to process.cwd(). */
  projectRoot?: string;
  resolveAgentLLM?: (
    agentName?: string
  ) =>
    | Promise<
        | { adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number }
        | undefined
      >
    | { adapter: LLMAdapterLike; model?: string; temperature?: number; maxTokens?: number }
    | undefined;
  onEvent?: (
    event:
      | "llm_request"
      | "llm_response"
      | "consensus_vote"
      | "consensus_result"
      | "peer_review_vote"
      | "peer_review_result",
    data: unknown
  ) => Promise<void> | void;
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

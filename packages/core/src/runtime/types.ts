/**
 * Runtime types for unified execution layer
 *
 * The runtime layer provides a unified execution context for all AI operations,
 * enabling consistent abort handling, session tracking, tracing, and budget management.
 */

import type { ProviderId, RunEvent, Usage } from '../llm/types'

// =============================================================================
// Trace Types
// =============================================================================

export type TraceEventType =
  | 'run_start'
  | 'run_end'
  | 'llm_start'
  | 'llm_end'
  | 'step_start'
  | 'step_end'
  | 'tool_start'
  | 'tool_end'
  | 'error'

export interface TraceEvent {
  type: TraceEventType
  timestamp: number
  spanId: string
  parentSpanId?: string
  name?: string
  data?: Record<string, unknown>
  error?: unknown
}

export interface TraceSink {
  /**
   * Log a trace event
   */
  log(event: TraceEvent): void

  /**
   * Flush any buffered events (optional)
   */
  flush?(): Promise<void>
}

// =============================================================================
// Budget Types
// =============================================================================

export interface Budget {
  /** Maximum total tokens (input + output) */
  maxTokens?: number
  /** Maximum cost in USD */
  maxCostUsd?: number
  /** Maximum duration in milliseconds */
  maxDurationMs?: number
}

export interface BudgetTracker {
  /** Current usage */
  readonly usage: BudgetUsage
  /** Check if budget is exceeded */
  isExceeded(): boolean
  /** Record token usage */
  recordTokens(usage: Usage, provider: ProviderId, model: string): void
  /** Record duration */
  recordDuration(durationMs: number): void
}

export interface BudgetUsage {
  totalTokens: number
  estimatedCostUsd: number
  durationMs: number
}

// =============================================================================
// Session Integration Types
// =============================================================================

/**
 * Minimal session interface for runtime integration
 * This allows the runtime to be used with or without the full session system
 */
export interface RuntimeSession {
  readonly id: string
  /**
   * Record LLM usage for cost tracking
   */
  recordUsage(usage: {
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    totalTokens: number
    costUsd?: number
  }): void
}

// =============================================================================
// Run Context
// =============================================================================

export interface RunContext {
  /** Abort signal for cancellation */
  readonly abort: AbortSignal

  /** Optional session for usage tracking */
  readonly session?: RuntimeSession

  /** Optional trace sink for observability */
  readonly trace?: TraceSink

  /** Optional budget constraints */
  readonly budget?: BudgetTracker

  /** Metadata passed through the execution */
  readonly metadata: Record<string, unknown>
}

export interface RunContextOptions {
  /** External abort signal to link */
  signal?: AbortSignal
  /** Session for usage tracking */
  session?: RuntimeSession
  /** Trace sink for observability */
  trace?: TraceSink
  /** Budget constraints */
  budget?: Budget
  /** Metadata to pass through execution */
  metadata?: Record<string, unknown>
}

// =============================================================================
// Runnable Interface
// =============================================================================

/**
 * A composable unit of execution
 *
 * @template I - Input type
 * @template O - Output type
 */
export interface Runnable<I, O> {
  /**
   * Execute the runnable with the given context and input
   */
  run(ctx: RunContext, input: I): RunHandle<O>
}

/**
 * Handle to a running execution
 *
 * @template O - Output type
 */
export interface RunHandle<O> {
  /**
   * Stream of execution events
   */
  events(): AsyncIterable<RunEvent>

  /**
   * Final result (resolves when execution completes)
   */
  result(): Promise<O>

  /**
   * Cancel the execution
   */
  cancel?(reason?: string): void
}

// =============================================================================
// Executor Types
// =============================================================================

export interface ExecutorConfig {
  /** Default timeout in milliseconds */
  defaultTimeoutMs?: number
  /** Enable automatic retry on transient errors */
  enableRetry?: boolean
  /** Maximum retry attempts */
  maxRetries?: number
  /** Retry delay in milliseconds */
  retryDelayMs?: number
}

/**
 * Result of an executor run with metadata
 */
export interface ExecutorResult<O> {
  /** The output value */
  output: O
  /** Execution metadata */
  metadata: ExecutorResultMetadata
}

export interface ExecutorResultMetadata {
  /** Duration in milliseconds */
  durationMs: number
  /** Token usage */
  usage?: Usage
  /** Provider used */
  provider?: ProviderId
  /** Model used */
  model?: string
  /** Number of retry attempts */
  retryCount?: number
}

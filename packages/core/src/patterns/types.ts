import type { ChatModel, ChatResponse, ProviderId, RunEvent } from '../llm/types'
import type { RunContext, TraceContext } from '../runtime/types'

export type EventOrdering = 'causal' | 'arrival' | 'undefined'
export type CancellationPropagation = 'immediate' | 'graceful' | 'best-effort'

export interface ErrorAttribution {
  agentId?: string
  modelId?: string
  provider?: ProviderId
  roundIndex?: number
  phase?: string
}

export interface StreamingProtocol {
  eventOrdering: EventOrdering
  cancellationPropagation: CancellationPropagation
  supportsReplay: boolean
}

export const DEFAULT_STREAMING_PROTOCOL: StreamingProtocol = {
  eventOrdering: 'arrival',
  cancellationPropagation: 'best-effort',
  supportsReplay: false,
}

export const PATTERN_STREAMING_PROTOCOLS: Record<string, StreamingProtocol> = {
  sequential: {
    eventOrdering: 'causal',
    cancellationPropagation: 'immediate',
    supportsReplay: false,
  },
  parallel: {
    eventOrdering: 'arrival',
    cancellationPropagation: 'best-effort',
    supportsReplay: false,
  },
  debate: {
    eventOrdering: 'causal',
    cancellationPropagation: 'graceful',
    supportsReplay: false,
  },
  ensemble: {
    eventOrdering: 'arrival',
    cancellationPropagation: 'best-effort',
    supportsReplay: false,
  },
  crosscheck: {
    eventOrdering: 'arrival',
    cancellationPropagation: 'graceful',
    supportsReplay: false,
  },
}

export interface PatternConfig {
  name?: string
  description?: string
}

export interface EventTrace {
  traceId: string
  spanId: string
  parentSpanId?: string
  path: string[]
  timestamp: number
}

export type BasePatternEvent =
  | Exclude<RunEvent, { type: 'error' }>
  | { type: 'error'; error: unknown; attribution?: ErrorAttribution }
  | { type: 'agent_start'; agentId: string; agentName?: string }
  | { type: 'agent_end'; agentId: string; durationMs: number }
  | { type: 'phase_start'; phase: string }
  | { type: 'phase_end'; phase: string; durationMs: number }

export type PatternEvent = BasePatternEvent & { trace?: EventTrace }

export function withTrace<T extends object>(event: T, traceCtx: TraceContext): T & { trace: EventTrace } {
  return {
    ...event,
    trace: {
      traceId: traceCtx.traceId,
      spanId: traceCtx.spanId,
      parentSpanId: traceCtx.parentSpanId,
      path: traceCtx.path,
      timestamp: Date.now(),
    },
  }
}

export interface PatternRunHandle<O> {
  events(): AsyncIterable<PatternEvent>
  result(): Promise<O>
  cancel?(reason?: string): void
}

export interface Pattern<I, O> {
  readonly name: string
  run(ctx: RunContext, input: I): PatternRunHandle<O>
}

export interface AgentConfig {
  id: string
  name?: string
  model: ChatModel
  systemPrompt?: string
}

export interface CrossCheckConfig extends PatternConfig {
  agents: AgentConfig[]
  judge: AgentConfig
  judgePromptTemplate?: string
}

export interface CrossCheckInput {
  prompt: string
  context?: string
}

export interface CrossCheckResult {
  finalAnswer: string
  agentResponses: Array<{
    agentId: string
    response: ChatResponse
    durationMs: number
  }>
  judgeResponse: ChatResponse
  agreement: number
  totalDurationMs: number
}

export type AggregationStrategy = 'first' | 'longest' | 'shortest' | 'concat' | 'custom'

export interface EnsembleConfig extends PatternConfig {
  agents: AgentConfig[]
  aggregation?: AggregationStrategy
  customAggregator?: (responses: ChatResponse[]) => string
}

export interface EnsembleInput {
  prompt: string
  context?: string
}

export interface EnsembleResult {
  finalAnswer: string
  agentResponses: Array<{
    agentId: string
    response: ChatResponse
    durationMs: number
  }>
  aggregationStrategy: AggregationStrategy
  totalDurationMs: number
}

export interface SequentialConfig extends PatternConfig {
  agents: AgentConfig[]
  passContext?: boolean
}

export interface SequentialInput {
  prompt: string
  context?: string
}

export interface SequentialResult {
  finalAnswer: string
  steps: Array<{
    agentId: string
    input: string
    response: ChatResponse
    durationMs: number
  }>
  totalDurationMs: number
}

export interface ParallelConfig extends PatternConfig {
  agents: AgentConfig[]
}

export interface ParallelInput {
  prompt: string
  context?: string
}

export interface ParallelResult {
  responses: Array<{
    agentId: string
    response: ChatResponse
    durationMs: number
    success: boolean
    error?: string
  }>
  totalDurationMs: number
}

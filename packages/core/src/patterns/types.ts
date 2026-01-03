import type { ChatModel, ChatResponse, RunEvent } from '../llm/types'
import type { RunContext } from '../runtime/types'

export interface PatternConfig {
  name?: string
  description?: string
}

export type PatternEvent =
  | RunEvent
  | { type: 'agent_start'; agentId: string; agentName?: string }
  | { type: 'agent_end'; agentId: string; durationMs: number }
  | { type: 'phase_start'; phase: string }
  | { type: 'phase_end'; phase: string; durationMs: number }

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

/**
 * Debate Engine Types
 */

import type { Tool } from 'ai'

export type DebatePhase = 'initial' | 'rebuttal' | 'revised' | 'consensus'

export type DebateMode = 'strong' | 'weak'

export interface ToolCall {
  toolName: string
  args: Record<string, unknown>
  result: unknown
}

export interface DebateRound {
  phase: DebatePhase
  speaker: string
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
}

export interface PositionChange {
  participant: string
  from: string
  to: string
  reason: string
  phase: DebatePhase
}

export interface DebateResult {
  topic: string
  mode: DebateMode
  rounds: DebateRound[]
  consensus: string
  positionChanges: PositionChange[]
  unresolvedDisagreements: string[]
  metadata: {
    startTime: number
    endTime: number
    totalDurationMs: number
    participantCount: number
  }
}

export interface DebateEngineConfig {
  mode: DebateMode
  maxRounds?: number
  timeout?: number
  /** Tools to enable during rebuttal phase for fact-checking */
  tools?: Record<string, Tool>
  /** Which phases should have tools enabled (default: ['rebuttal']) */
  toolPhases?: DebatePhase[]
}

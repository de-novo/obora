/**
 * Debate Engine Types
 */

export type DebatePhase = 'initial' | 'rebuttal' | 'revised' | 'consensus'

export type DebateMode = 'strong' | 'weak'

export interface DebateRound {
  phase: DebatePhase
  speaker: string
  content: string
  timestamp: number
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
}

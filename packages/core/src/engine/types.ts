import type { Tool } from 'ai'

export type {
  DebateMode,
  DebatePhase,
  DebateResult,
  DebateRound,
  PositionChange,
  SkillsConfig,
} from '../patterns/debate'

export interface ToolCall {
  toolName: string
  args: Record<string, unknown>
  result: unknown
}

export interface DebateEngineConfig {
  mode: 'strong' | 'weak'
  maxRounds?: number
  timeout?: number
  tools?: Record<string, Tool>
  toolPhases?: Array<'initial' | 'rebuttal' | 'revised' | 'consensus'>
  useNativeWebSearch?: boolean
  skills?: {
    global?: string[]
    participants?: Record<string, string[]>
  }
  skillsPath?: string
}

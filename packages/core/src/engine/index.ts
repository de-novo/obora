/**
 * Engine Module
 *
 * Core debate engine and related types.
 * Now supports streaming responses via Vercel AI SDK.
 */

export {
  DebateEngine,
  type DebateOptions,
  type DebateParticipant,
  type DebateStreamEvent,
  type StreamingDebateOptions,
  type StreamingParticipant,
} from './DebateEngine'

export type {
  DebateEngineConfig,
  DebateMode,
  DebatePhase,
  DebateResult,
  DebateRound,
  PositionChange,
  SkillsConfig,
  ToolCall,
} from './types'

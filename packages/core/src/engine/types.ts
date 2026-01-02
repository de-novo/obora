/**
 * Debate Engine Types
 *
 * Core type definitions for the multi-AI debate system.
 *
 * @packageDocumentation
 * @module engine/types
 */

import type { Tool } from 'ai'

/**
 * Phases of a debate session.
 *
 * - `initial`: Each AI presents their initial position
 * - `rebuttal`: AIs critique each other's positions (strong mode only)
 * - `revised`: AIs revise their positions based on rebuttals (strong mode only)
 * - `consensus`: Orchestrator summarizes agreements and disagreements
 */
export type DebatePhase = 'initial' | 'rebuttal' | 'revised' | 'consensus'

/**
 * Debate mode determines the depth of discussion.
 *
 * - `strong`: Full debate with rebuttals and position revision (4 phases)
 * - `weak`: Simple round without critical review (2 phases: initial + consensus)
 */
export type DebateMode = 'strong' | 'weak'

/**
 * Record of a tool invocation during debate.
 *
 * @example
 * ```typescript
 * const toolCall: ToolCall = {
 *   toolName: 'webSearch',
 *   args: { query: 'Railway SOC2 certification' },
 *   result: { results: [...] }
 * }
 * ```
 */
export interface ToolCall {
  /** Name of the tool that was called */
  toolName: string
  /** Arguments passed to the tool */
  args: Record<string, unknown>
  /** Result returned by the tool */
  result: unknown
}

/**
 * A single round in the debate, representing one AI's contribution.
 *
 * @example
 * ```typescript
 * const round: DebateRound = {
 *   phase: 'initial',
 *   speaker: 'claude',
 *   content: 'I recommend Option A because...',
 *   timestamp: Date.now()
 * }
 * ```
 */
export interface DebateRound {
  /** Which phase this round belongs to */
  phase: DebatePhase
  /** Name of the AI participant */
  speaker: string
  /** The AI's response content */
  content: string
  /** Unix timestamp when the round was recorded */
  timestamp: number
  /** Tools called during this round (if any) */
  toolCalls?: ToolCall[]
}

/**
 * Records when an AI changes their position during debate.
 *
 * Position changes are a key metric for evaluating debate effectiveness.
 * A debate where no positions change may indicate either strong initial
 * positions or insufficient critique depth.
 *
 * @example
 * ```typescript
 * const change: PositionChange = {
 *   participant: 'openai',
 *   from: 'Recommend Option A',
 *   to: 'Revised to Option B with guardrails',
 *   reason: 'Accepted Claude\'s rebuttal about scaling concerns',
 *   phase: 'revised'
 * }
 * ```
 */
export interface PositionChange {
  /** Name of the AI that changed position */
  participant: string
  /** Original position (from initial phase) */
  from: string
  /** New position (from revised phase) */
  to: string
  /** Why the position changed */
  reason: string
  /** Phase where the change was detected */
  phase: DebatePhase
}

/**
 * Complete result of a debate session.
 *
 * Contains the full transcript, analysis, and metadata.
 *
 * @example
 * ```typescript
 * const result = await engine.run({ topic, participants, orchestrator })
 * console.log(result.consensus)
 * console.log(`Position changes: ${result.positionChanges.length}`)
 * console.log(`Duration: ${result.metadata.totalDurationMs}ms`)
 * ```
 */
export interface DebateResult {
  /** The original debate topic */
  topic: string
  /** Mode used for this debate */
  mode: DebateMode
  /** All rounds in chronological order */
  rounds: DebateRound[]
  /** Final consensus summary from orchestrator */
  consensus: string
  /** Detected position changes during debate */
  positionChanges: PositionChange[]
  /** Points where participants still disagree */
  unresolvedDisagreements: string[]
  /** Timing and participation metadata */
  metadata: {
    /** Unix timestamp when debate started */
    startTime: number
    /** Unix timestamp when debate ended */
    endTime: number
    /** Total duration in milliseconds */
    totalDurationMs: number
    /** Number of AI participants */
    participantCount: number
  }
}

/**
 * Configuration options for the DebateEngine.
 *
 * @example
 * ```typescript
 * const config: DebateEngineConfig = {
 *   mode: 'strong',
 *   maxRounds: 10,
 *   timeout: 300000, // 5 minutes
 *   tools: { webSearch: createWebSearchTool({ ... }) },
 *   toolPhases: ['rebuttal']
 * }
 * ```
 *
 * @example Using native WebSearch
 * ```typescript
 * // Configure providers with enabledTools
 * const claude = new ClaudeProvider({ enabledTools: ['WebSearch'] })
 * const openai = new OpenAIProvider({ enabledTools: ['WebSearch'] })
 *
 * const engine = new DebateEngine({
 *   mode: 'strong',
 *   useNativeWebSearch: true // Uses provider's built-in WebSearch
 * })
 * ```
 */
export interface DebateEngineConfig {
  /** Debate mode: 'strong' (with rebuttals) or 'weak' (simple) */
  mode: DebateMode
  /** Maximum number of rounds per phase (default: 10) */
  maxRounds?: number
  /** Timeout in milliseconds (default: 300000 = 5 minutes) */
  timeout?: number
  /** Tools to enable for fact-checking during debate (AI SDK tools) */
  tools?: Record<string, Tool>
  /** Which phases should have tools enabled (default: ['rebuttal']) */
  toolPhases?: DebatePhase[]
  /**
   * Use provider's native WebSearch capability instead of custom AI SDK tools.
   *
   * When enabled, providers should be configured with `enabledTools: ['WebSearch']`.
   * This uses each provider's built-in WebSearch implementation:
   * - Claude: Anthropic's server-side `web_search_20250305`
   * - OpenAI: Codex CLI with `--search` flag
   * - Gemini: Google Search grounding via Antigravity backend
   *
   * @default false
   */
  useNativeWebSearch?: boolean
}

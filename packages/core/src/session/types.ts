/**
 * Session-based logging system types
 *
 * Sessions are the top-level unit of observability in Obora.
 * Each CLI invocation creates a new session, and all AI operations
 * (debate, query, skill, agent) are logged as events within that session.
 */

// =============================================================================
// Session Configuration
// =============================================================================

export interface SessionConfig {
  /** Enable session logging (default: false) */
  enabled: boolean
  /** Custom session directory (default: ~/.config/obora/sessions) */
  dir?: string
  /** Store prompts in events (default: false, for privacy) */
  logPrompts?: boolean
  /** Store responses in events (default: true) */
  logResponses?: boolean
  /** Store tool call results (default: true) */
  logToolResults?: boolean
  /** Auto-cleanup sessions older than N days (default: undefined = keep all) */
  retentionDays?: number
}

export const DEFAULT_SESSION_CONFIG: SessionConfig = {
  enabled: false,
  logPrompts: false,
  logResponses: true,
  logToolResults: true,
}

// =============================================================================
// Session Metadata
// =============================================================================

export type SessionStatus = 'running' | 'completed' | 'failed' | 'cancelled'
export type FeatureType = 'debate' | 'query' | 'skill' | 'agent'

export interface SessionUsageSummary {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  providers?: string[]
  models?: string[]
}

export interface SessionMetadata {
  /** ULID-based session ID */
  id: string
  /** ISO8601 timestamp */
  createdAt: string
  /** ISO8601 timestamp */
  updatedAt: string
  /** Current session status */
  status: SessionStatus
  /** Features used in this session */
  features: FeatureType[]
  /** Aggregated usage summary */
  summary: SessionUsageSummary
  /** Optional tags for filtering */
  tags?: string[]
  /** Working directory when session was created */
  cwd?: string
}

// =============================================================================
// Event Types
// =============================================================================

export type EventType =
  // Session lifecycle
  | 'session.started'
  | 'session.ended'
  // Activity lifecycle (debate, query, skill, agent)
  | 'activity.started'
  | 'activity.ended'
  // LLM interactions
  | 'llm.request'
  | 'llm.response'
  // Tool calls
  | 'tool.call'
  | 'tool.result'
  // Debate-specific
  | 'debate.phase.started'
  | 'debate.phase.ended'
  | 'debate.round.started'
  | 'debate.round.ended'
  // Errors
  | 'error'

export type ActorKind = 'user' | 'engine' | 'agent' | 'provider' | 'tool'

export interface EventActor {
  kind: ActorKind
  id?: string
  name?: string
}

export interface EventUsage {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  costUsd?: number
  latencyMs?: number
  provider?: string
  model?: string
  backend?: 'cli' | 'api' | 'oauth'
}

// =============================================================================
// Base Event
// =============================================================================

export interface BaseEvent {
  /** Schema version */
  v: 1
  /** ISO8601 timestamp */
  ts: string
  /** Session ID (ULID) */
  sessionId: string
  /** Event type */
  type: EventType
  /** Sequence number within session */
  seq: number
  /** Correlation ID for linking related events (e.g., request/response) */
  spanId?: string
  /** Parent span for nesting (activity → llm → tool) */
  parentSpanId?: string
  /** Actor that triggered this event */
  actor?: EventActor
  /** Feature that generated this event */
  feature?: FeatureType
  /** Usage metrics */
  usage?: EventUsage
  /** Feature-specific data */
  data?: Record<string, unknown>
}

// =============================================================================
// Specific Event Types
// =============================================================================

export interface SessionStartedEvent extends BaseEvent {
  type: 'session.started'
  data: {
    config?: Partial<SessionConfig>
    cwd?: string
    argv?: string[]
  }
}

export interface SessionEndedEvent extends BaseEvent {
  type: 'session.ended'
  data: {
    status: SessionStatus
    durationMs: number
    summary: SessionUsageSummary
  }
}

export interface ActivityStartedEvent extends BaseEvent {
  type: 'activity.started'
  feature: FeatureType
  data: {
    /** Activity-specific input (e.g., topic for debate, question for query) */
    input?: string
    /** Configuration used */
    config?: Record<string, unknown>
  }
}

export interface ActivityEndedEvent extends BaseEvent {
  type: 'activity.ended'
  feature: FeatureType
  data: {
    status: 'completed' | 'failed' | 'cancelled'
    /** Path to result artifact if saved */
    artifactPath?: string
  }
}

export interface LlmRequestEvent extends BaseEvent {
  type: 'llm.request'
  data: {
    provider: string
    model?: string
    /** Prompt content (only if logPrompts=true) */
    prompt?: string
    /** Prompt hash for correlation without storing content */
    promptHash?: string
  }
}

export interface LlmResponseEvent extends BaseEvent {
  type: 'llm.response'
  usage: EventUsage
  data: {
    provider: string
    model?: string
    /** Response content (only if logResponses=true) */
    response?: string
    /** Response hash for correlation */
    responseHash?: string
    /** Whether response was streamed */
    streamed?: boolean
  }
}

export interface ToolCallEvent extends BaseEvent {
  type: 'tool.call'
  data: {
    toolName: string
    /** Tool input (only if logToolResults=true) */
    input?: Record<string, unknown>
  }
}

export interface ToolResultEvent extends BaseEvent {
  type: 'tool.result'
  data: {
    toolName: string
    /** Tool output (only if logToolResults=true) */
    output?: unknown
    success: boolean
    error?: string
  }
}

export interface DebatePhaseStartedEvent extends BaseEvent {
  type: 'debate.phase.started'
  feature: 'debate'
  data: {
    phase: 'initial' | 'rebuttal' | 'revised' | 'consensus'
    participants?: string[]
  }
}

export interface DebatePhaseEndedEvent extends BaseEvent {
  type: 'debate.phase.ended'
  feature: 'debate'
  data: {
    phase: 'initial' | 'rebuttal' | 'revised' | 'consensus'
  }
}

export interface DebateRoundStartedEvent extends BaseEvent {
  type: 'debate.round.started'
  feature: 'debate'
  data: {
    phase: string
    speaker: string
    roundIndex: number
  }
}

export interface DebateRoundEndedEvent extends BaseEvent {
  type: 'debate.round.ended'
  feature: 'debate'
  usage: EventUsage
  data: {
    phase: string
    speaker: string
    roundIndex: number
    /** Response content (only if logResponses=true) */
    response?: string
  }
}

export interface ErrorEvent extends BaseEvent {
  type: 'error'
  data: {
    message: string
    code?: string
    stack?: string
    recoverable: boolean
  }
}

// Union type for all events
export type SessionEvent =
  | SessionStartedEvent
  | SessionEndedEvent
  | ActivityStartedEvent
  | ActivityEndedEvent
  | LlmRequestEvent
  | LlmResponseEvent
  | ToolCallEvent
  | ToolResultEvent
  | DebatePhaseStartedEvent
  | DebatePhaseEndedEvent
  | DebateRoundStartedEvent
  | DebateRoundEndedEvent
  | ErrorEvent

// =============================================================================
// Session Index Entry (for global index.jsonl)
// =============================================================================

export interface SessionIndexEntry {
  id: string
  createdAt: string
  updatedAt: string
  status: SessionStatus
  features: FeatureType[]
  totalTokens?: number
  costUsd?: number
  providers?: string[]
}

// =============================================================================
// Pricing
// =============================================================================

export interface ModelPricing {
  inputPer1kTokens: number
  outputPer1kTokens: number
}

export interface ProviderPricing {
  [model: string]: ModelPricing
}

export interface PricingTable {
  [provider: string]: ProviderPricing
}

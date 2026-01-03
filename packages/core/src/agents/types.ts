/**
 * Obora Agent System Types
 *
 * Based on Claude Code's Primary/Subagent pattern.
 * Supports:
 * - Invocation modes: delegation, handoff, parallel
 * - Output formats: text, structured, json
 * - Trigger conditions: event-based agent activation
 */

import type { Provider } from '../providers/types'

// ============================================================================
// Constants
// ============================================================================

export const AGENT_PATHS = {
  custom: '.ai/agents',
  builtin: 'agents',
  globPattern: '**/*.md',
} as const

// ============================================================================
// Invocation Modes
// ============================================================================

/**
 * How the agent is invoked and controlled
 */
export type InvocationMode =
  | 'delegation' // Call & return (function-like)
  | 'handoff' // Full control transfer
  | 'parallel' // Independent execution

/**
 * Agent lifecycle state
 */
export type AgentState = 'idle' | 'initializing' | 'running' | 'waiting' | 'completed' | 'failed' | 'cancelled'

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Broad category of the agent
 */
export type AgentType =
  | 'debate' // Participates in structured debates
  | 'analysis' // Code/architecture analysis
  | 'research' // Information gathering
  | 'utility' // Helper utilities
  | 'custom' // User-defined

/**
 * Agent's communication tone
 */
export type AgentTone = 'neutral' | 'skeptical' | 'constructive' | 'enthusiastic' | 'formal' | 'casual'

/**
 * Output format type
 */
export type OutputFormatType =
  | 'text' // Free-form text
  | 'structured' // Semi-structured with sections
  | 'json' // Machine-readable JSON

/**
 * Severity level for issues found by agents
 */
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'

// ============================================================================
// Trigger System
// ============================================================================

/**
 * Condition that triggers agent invocation
 */
export type TriggerCondition =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'event'; event: string }
  | { type: 'pattern'; pattern: string }
  | { type: 'if'; condition: string }
  | { type: 'phase'; phase: string }
  | { type: 'custom'; config: CustomTriggerConfig }

/**
 * Custom trigger configuration
 */
export interface CustomTriggerConfig {
  pattern: string
  params?: Record<string, unknown>
}

// ============================================================================
// Output Format
// ============================================================================

/**
 * Structured output schema
 */
export interface OutputSchema {
  type: OutputFormatType
  schema?: Record<string, unknown>
  example?: Record<string, unknown>
}

/**
 * Text output with optional sections
 */
export interface TextOutput {
  type: 'text'
  content: string
  sections?: {
    name: string
    content: string
  }[]
}

/**
 * Structured output with typed fields
 */
export interface StructuredOutput {
  type: 'structured'
  data: Record<string, unknown>
  metadata?: {
    confidence?: number
    sources?: string[]
    warnings?: string[]
  }
}

/**
 * JSON output
 */
export interface JsonOutput {
  type: 'json'
  data: Record<string, unknown>
}

// ============================================================================
// Frontmatter Types
// ============================================================================

/**
 * Agent frontmatter from AGENT.md YAML
 */
export interface AgentFrontmatter {
  // Identification
  name: string
  description: string
  version?: string
  author?: string
  license?: string

  // Classification
  agentType: AgentType
  category?: string

  // Persona
  persona: {
    role: string
    tone: AgentTone
    expertise: string[]
    model?: string // 'inherit' or specific model ID
  }

  // Invocation configuration
  invocation: {
    mode: InvocationMode
    timeout?: number // ms
    maxRetries?: number
    costBudget?: number
    priority?: number // 0-100, higher = more priority
  }

  // Tool permissions
  tools?: {
    allowed?: string[]
    inherit?: boolean
    deny?: string[]
  }

  skills?: string[]

  // Trigger conditions
  triggers?: TriggerCondition[]

  // Output specification
  output?: OutputSchema

  // Handoff configuration
  handoff?: {
    preserveContext?: boolean
    allowedTransfers?: string[]
    autoReturn?: boolean
    returnCondition?: string
  }
}

// ============================================================================
// Core Agent Types
// ============================================================================

/**
 * Full agent definition
 */
export interface Agent extends AgentMetadata {
  frontmatter: AgentFrontmatter
  instructions: string
  agentDir: string
  prompts?: AgentPrompts
  resources?: AgentResources
}

/**
 * Lightweight agent metadata for discovery
 */
export interface AgentMetadata {
  name: string
  description: string
  agentType: AgentType
  category: string | null
  invocationMode: InvocationMode
  location: string
  isBuiltIn: boolean
  version?: string
}

/**
 * Phase-specific prompts for debate agents
 */
export interface AgentPrompts {
  initial?: string
  rebuttal?: string
  revision?: string
  consensus?: string
  custom?: Record<string, string>
}

/**
 * Agent resources (scripts, references, assets)
 */
export interface AgentResources {
  scripts: string[]
  references: string[]
  assets: string[]
}

// ============================================================================
// Execution Types
// ============================================================================

/**
 * Agent invocation context
 */
export interface AgentContext {
  agent: Agent
  task: string
  sessionId: string
  parentSessionId?: string
  history?: ConversationEntry[]
  activeFiles?: string[]
  metadata?: Record<string, unknown>
}

/**
 * Conversation entry
 */
export interface ConversationEntry {
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp: number
  toolCalls?: ToolCall[]
  metadata?: Record<string, unknown>
}

/**
 * Tool call definition
 */
export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
  result?: unknown
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean
  output: AgentOutput
  error?: string
  sessionId: string
  duration: number
  toolCalls: ToolCall[]
  metadata?: {
    retries?: number
    cost?: number
    tokens?: number
  }
}

/**
 * Unified output type
 */
export type AgentOutput = TextOutput | StructuredOutput | JsonOutput

/**
 * Streaming chunk from agent
 */
export interface AgentChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'metadata'
  content: unknown
  sessionId: string
}

// ============================================================================
// Parallel Execution Types
// ============================================================================

/**
 * Parallel agent execution group
 */
export interface AgentGroup {
  id: string
  agents: string[]
  mode: 'parallel' | 'sequential' | 'round_robin'
  aggregator?: string // Agent to aggregate results
}

/**
 * Group execution result
 */
export interface GroupResult {
  groupId: string
  results: AgentResult[]
  aggregated?: AgentOutput
  duration: number
}

// ============================================================================
// Handoff Types
// ============================================================================

/**
 * Handoff request
 */
export interface HandoffRequest {
  fromAgent: string
  toAgent: string
  context: Partial<AgentContext>
  reason: string
}

/**
 * Handoff response
 */
export interface HandoffResponse {
  accepted: boolean
  reason?: string
  transferredContext?: Record<string, unknown>
}

// ============================================================================
// CLI Types
// ============================================================================

/**
 * CLI agent invocation options
 */
export interface CliAgentOptions {
  mode: InvocationMode
  format: OutputFormatType
  output?: string
  history?: string
  files?: string[]
  stream?: boolean
  timeout?: number
}

/**
 * CLI agent list options
 */
export interface CliAgentListOptions {
  type?: AgentType
  category?: string
  builtin?: boolean
  custom?: boolean
}

// ============================================================================
// Debate Integration Types
// ============================================================================

/**
 * Agent participation in debate
 */
export interface DebateParticipant {
  agent: Agent
  provider: Provider
  role: 'skeptic' | 'advocate' | 'moderator' | 'synthesizer'
  skills?: string[]
}

/**
 * Debate phase configuration
 */
export interface DebatePhaseConfig {
  phase: 'initial' | 'rebuttal' | 'revision' | 'consensus'
  promptTemplate?: string
  enableTools?: boolean
  timeLimit?: number
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Agent validation error
 */
export interface AgentValidationError {
  field: string
  message: string
  value?: unknown
}

/**
 * Validation result
 */
export interface AgentValidationResult {
  valid: boolean
  errors: AgentValidationError[]
  warnings: string[]
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Check if output is text type
 */
export function isTextOutput(output: AgentOutput): output is TextOutput {
  return output.type === 'text'
}

/**
 * Check if output is structured type
 */
export function isStructuredOutput(output: AgentOutput): output is StructuredOutput {
  return output.type === 'structured'
}

/**
 * Check if output is JSON type
 */
export function isJsonOutput(output: AgentOutput): output is JsonOutput {
  return output.type === 'json'
}

/**
 * Create text output
 */
export function createTextOutput(content: string, sections?: { name: string; content: string }[]): TextOutput {
  return { type: 'text', content, sections }
}

/**
 * Create structured output
 */
export function createStructuredOutput(
  data: Record<string, unknown>,
  metadata?: StructuredOutput['metadata'],
): StructuredOutput {
  return { type: 'structured', data, metadata }
}

/**
 * Create JSON output
 */
export function createJsonOutput(data: Record<string, unknown>): JsonOutput {
  return { type: 'json', data }
}

/**
 * Create agent result
 */
export function createAgentResult(
  success: boolean,
  output: AgentOutput,
  sessionId: string,
  duration: number,
  toolCalls: ToolCall[],
  error?: string,
  metadata?: AgentResult['metadata'],
): AgentResult {
  return {
    success,
    output,
    error,
    sessionId,
    duration,
    toolCalls,
    metadata,
  }
}

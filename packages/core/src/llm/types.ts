export type ProviderId = 'anthropic' | 'openai' | 'google'

/**
 * Streaming granularity levels
 * - 'token': Real-time token-by-token streaming
 * - 'sentence': Sentence-level streaming (buffered)
 * - 'none': No streaming support
 */
export type StreamingGranularity = 'token' | 'sentence' | 'none'

/**
 * Declares what capabilities a model supports.
 * Patterns should check these before using advanced features.
 *
 * @example
 * ```typescript
 * if (!model.capabilities.structuredOutput) {
 *   throw new Error(`Model ${model.model} does not support structured output`)
 * }
 * ```
 */
export interface ChatModelCapabilities {
  /** Supports schema-constrained JSON output (not just "output JSON") */
  structuredOutput: boolean
  /** Supports function/tool calling */
  toolCalling: boolean
  /** Streaming granularity level */
  streaming: StreamingGranularity
  /** Maximum context window in tokens */
  maxContextWindow: number
  /** Supports system messages (some models don't) */
  supportsSystemMessages: boolean
  /** Supports prompt caching for cost optimization */
  promptCaching?: boolean
  /** Supports web search / grounding */
  webSearch?: boolean
  /** Supports vision/image inputs */
  vision?: boolean
}

/**
 * Helper to check if a model has required capabilities.
 * Throws descriptive error if capability is missing.
 */
export function assertCapability(model: ChatModel, capability: keyof ChatModelCapabilities, context?: string): void {
  const value = model.capabilities[capability]
  const hasCapability = typeof value === 'boolean' ? value : value !== 'none'

  if (!hasCapability) {
    const ctx = context ? ` for ${context}` : ''
    throw new Error(`Model "${model.model}" (${model.provider}) does not support "${capability}"${ctx}`)
  }
}

/**
 * Check multiple capabilities at once.
 * Returns array of missing capabilities (empty if all present).
 */
export function checkCapabilities(
  model: ChatModel,
  required: Array<keyof ChatModelCapabilities>,
): Array<keyof ChatModelCapabilities> {
  const missing: Array<keyof ChatModelCapabilities> = []

  for (const cap of required) {
    const value = model.capabilities[cap]
    const hasCapability = typeof value === 'boolean' ? value : value !== 'none'
    if (!hasCapability) {
      missing.push(cap)
    }
  }

  return missing
}

export interface ModelRef {
  provider: ProviderId
  model: string
  defaultParams?: Record<string, unknown>
  fallbacks?: Array<Omit<ModelRef, 'fallbacks'>>
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
}

export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ToolResult {
  callId: string
  result: unknown
  error?: string
}

export interface Usage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
}

export interface TraceSpan {
  id: string
  name: string
  startTime: number
  endTime?: number
  metadata?: Record<string, unknown>
}

export type RunEvent =
  | { type: 'token'; text: string; agentId?: string }
  | { type: 'message'; message: ChatMessage; agentId?: string }
  | { type: 'tool_call'; call: ToolCall; agentId?: string }
  | { type: 'tool_result'; result: ToolResult; agentId?: string }
  | { type: 'usage'; usage: Usage; model: string; provider: ProviderId }
  | { type: 'trace'; span: TraceSpan }
  | { type: 'error'; error: unknown }
  | { type: 'done' }

export interface ChatRequest {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  responseFormat?: 'text' | 'json'
  temperature?: number
  maxTokens?: number
}

export interface ChatResponse {
  message: ChatMessage
  usage?: Usage
  toolCalls?: ToolCall[]
  raw?: unknown
}

export interface RunHandle<O> {
  events(): AsyncIterable<RunEvent>
  result(): Promise<O>
  cancel?(reason?: string): void
}

export interface ChatModel {
  readonly provider: ProviderId
  readonly model: string
  readonly capabilities: ChatModelCapabilities
  run(request: ChatRequest, signal?: AbortSignal): RunHandle<ChatResponse>
}

export interface ChatModelFactory {
  create(ref: ModelRef): ChatModel
  list(): ModelRef[]
}

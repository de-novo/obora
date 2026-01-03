export type ProviderId = 'anthropic' | 'openai' | 'google'

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
  run(request: ChatRequest, signal?: AbortSignal): RunHandle<ChatResponse>
}

export interface ChatModelFactory {
  create(ref: ModelRef): ChatModel
  list(): ModelRef[]
}

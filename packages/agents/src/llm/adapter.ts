export interface LLMAdapter {
  chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult>;

  streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult>;

  readonly id: string;

  supports(feature: "streaming" | "function-calling" | "json-mode"): boolean;
}

export interface ChatCompletionParams {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  tools?: ToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; name: string };
  responseFormat?: { type: "text" | "json_object" };
  stopSequences?: string[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResult {
  id: string;
  model: string;
  message: {
    role: "assistant";
    content: string | null;
    toolCalls?: ToolCall[];
  };
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: "stop" | "length" | "tool_calls" | "error";
}

export interface ChatCompletionChunk {
  id: string;
  model: string;
  delta: {
    role?: "assistant";
    content?: string;
    toolCalls?: ToolCall[];
  };
  finishReason?: "stop" | "length" | "tool_calls" | "error";
  usage?: ChatCompletionResult["usage"];
}

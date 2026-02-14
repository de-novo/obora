import {
  LLMAdapter,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
  ToolCall,
} from "./adapter";

export interface OpenAICompatibleConfig {
  provider: string;
  authToken: string;
  baseUrl: string;
  defaultModel: string;
}

interface OpenAIAPIResponse {
  id: string;
  model: string;
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: ToolCall[];
    };
    finish_reason: "stop" | "length" | "tool_calls" | "error";
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  model: string;
  choices: Array<{
    delta: {
      role?: "assistant";
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason?: "stop" | "length" | "tool_calls" | "error";
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class OpenAICompatibleAdapter implements LLMAdapter {
  readonly id: string;

  private readonly authToken: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: OpenAICompatibleConfig) {
    this.id = config.provider;
    this.authToken = config.authToken;
    this.baseUrl = config.baseUrl;
    this.defaultModel = config.defaultModel;
  }

  supports(feature: "streaming" | "function-calling" | "json-mode"): boolean {
    return feature !== "json-mode";
  }

  async chatCompletion(
    params: ChatCompletionParams,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify(this.transformParams(params)),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`${this.id} API error: ${response.status} ${response.statusText}`);
    }

    return this.transformResponse((await response.json()) as OpenAIAPIResponse);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({ ...this.transformParams(params), stream: true }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`${this.id} stream API error: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let toolCalls: ToolCall[] = [];
    let lastChunk: ChatCompletionChunk | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;

        const chunk = this.transformChunk(JSON.parse(payload) as OpenAIStreamChunk);
        if (chunk.delta.content) content += chunk.delta.content;
        if (chunk.delta.toolCalls) toolCalls = toolCalls.concat(chunk.delta.toolCalls);
        lastChunk = chunk;
        onChunk(chunk);
      }
    }

    if (!lastChunk) {
      throw new Error(`${this.id} stream returned no chunks`);
    }

    return {
      id: lastChunk.id,
      model: lastChunk.model,
      message: {
        role: "assistant",
        content: content || null,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: lastChunk.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: lastChunk.finishReason ?? "stop",
    };
  }

  private transformParams(params: ChatCompletionParams): Record<string, unknown> {
    return {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
      top_p: params.topP,
      tools: params.tools,
      tool_choice: params.toolChoice,
      stop: params.stopSequences,
    };
  }

  private transformResponse(data: OpenAIAPIResponse): ChatCompletionResult {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`${this.id} API response did not include choices`);
    }

    return {
      id: data.id,
      model: data.model,
      message: {
        role: "assistant",
        content: choice.message.content,
        toolCalls: choice.message.tool_calls,
      },
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      finishReason: choice.finish_reason,
    };
  }

  private transformChunk(data: OpenAIStreamChunk): ChatCompletionChunk {
    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error(`${this.id} stream chunk did not include choices`);
    }

    return {
      id: data.id,
      model: data.model,
      delta: {
        role: choice.delta.role,
        content: choice.delta.content,
        toolCalls: choice.delta.tool_calls,
      },
      finishReason: choice.finish_reason,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }
}

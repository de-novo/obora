import {
  LLMAdapter,
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatMessage,
} from "./adapter";

export interface AnthropicConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: string;
}

interface AnthropicMessageResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string }>;
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | null;
  usage?: {
    input_tokens: number;
    output_tokens: number;
  };
}

export class AnthropicAdapter implements LLMAdapter {
  readonly id = "anthropic";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(config: AnthropicConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
    this.defaultModel = config.defaultModel ?? "claude-3-5-sonnet-latest";
  }

  supports(feature: "streaming" | "function-calling" | "json-mode"): boolean {
    return feature !== "json-mode";
  }

  async chatCompletion(
    params: ChatCompletionParams,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(this.toAnthropicPayload(params)),
      signal: options?.signal,
    });

    if (!response.ok) {
      throw new Error(`anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as AnthropicMessageResponse;
    return this.fromAnthropicResponse(data);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const result = await this.chatCompletion(params);
    const chunk: ChatCompletionChunk = {
      id: result.id,
      model: result.model,
      delta: {
        role: "assistant",
        content: result.message.content ?? "",
      },
      finishReason: result.finishReason,
      usage: result.usage,
    };
    onChunk(chunk);
    return result;
  }

  private toAnthropicPayload(params: ChatCompletionParams): Record<string, unknown> {
    const { system, messages } = splitSystemMessages(params.messages);
    return {
      model: params.model ?? this.defaultModel,
      max_tokens: params.maxTokens ?? 2048,
      temperature: params.temperature ?? 0.7,
      system,
      messages: messages.map((message) => ({
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    };
  }

  private fromAnthropicResponse(data: AnthropicMessageResponse): ChatCompletionResult {
    const text = data.content
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");

    return {
      id: data.id,
      model: data.model,
      message: {
        role: "assistant",
        content: text || null,
      },
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      finishReason: mapStopReason(data.stop_reason),
    };
  }
}

function splitSystemMessages(messages: ChatMessage[]): {
  system: string;
  messages: ChatMessage[];
} {
  const systemParts: string[] = [];
  const filtered = messages.filter((message) => {
    if (message.role === "system") {
      systemParts.push(message.content);
      return false;
    }
    return true;
  });

  return {
    system: systemParts.join("\n\n"),
    messages: filtered,
  };
}

function mapStopReason(reason: AnthropicMessageResponse["stop_reason"]): ChatCompletionResult["finishReason"] {
  if (reason === "max_tokens") return "length";
  if (reason === "tool_use") return "tool_calls";
  return "stop";
}

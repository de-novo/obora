import {
  LLMAdapter,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
  ToolCall,
} from "./adapter";

export class PiMonoAdapter implements LLMAdapter {
  readonly id = "pi-mono";

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly defaultModel = "pi-mono-1";

  constructor(config: PiMonoConfig) {
    this.baseUrl = config.baseUrl ?? "https://api.inflection.ai/v1";
    this.apiKey = config.apiKey;
  }

  supports(feature: "streaming" | "function-calling" | "json-mode"): boolean {
    switch (feature) {
      case "streaming":
        return true;
      case "function-calling":
        return true;
      case "json-mode":
        return false;
    }
  }

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(this.transformParams(params)),
    });

    if (!response.ok) {
      throw new PiMonoError(
        `Pi Mono API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    const data = await response.json();
    return this.transformResponse(data);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        ...this.transformParams(params),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new PiMonoError(
        `Pi Mono API error: ${response.status} ${response.statusText}`,
        response.status
      );
    }

    if (!response.body) {
      throw new PiMonoError("Response body is null", 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = "";
    let accumulatedToolCalls: ToolCall[] = [];
    let lastChunk: ChatCompletionChunk | null = null;
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

        const data = trimmedLine.slice(5).trim();
        if (data === "[DONE]") continue;

        try {
          const json = JSON.parse(data);
          const chunkData = this.transformChunk(json);
          if (chunkData.delta.content) {
            accumulatedContent += chunkData.delta.content;
          }
          if (chunkData.delta.toolCalls) {
            accumulatedToolCalls.push(...chunkData.delta.toolCalls);
          }
          lastChunk = chunkData;
          onChunk(chunkData);
        } catch (e) {
          console.warn("Failed to parse SSE chunk:", data, e);
        }
      }
    }

    if (!lastChunk) {
      throw new PiMonoError("No chunks received from stream", 0);
    }

    return {
      id: lastChunk.id,
      model: lastChunk.model,
      message: {
        role: "assistant",
        content: accumulatedContent || null,
        toolCalls: accumulatedToolCalls.length > 0 ? accumulatedToolCalls : undefined,
      },
      usage: lastChunk.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: lastChunk.finishReason ?? "stop",
    };
  }

  private transformParams(params: ChatCompletionParams): Record<string, unknown> {
    const transformed: Record<string, unknown> = {
      model: params.model ?? this.defaultModel,
      messages: params.messages,
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens ?? 2048,
    };

    if (params.topP !== undefined) {
      transformed.top_p = params.topP;
    }

    if (params.tools && this.supports("function-calling")) {
      transformed.tools = params.tools;
    }

    if (params.toolChoice) {
      transformed.tool_choice = params.toolChoice;
    }

    if (params.stopSequences) {
      transformed.stop = params.stopSequences;
    }

    return transformed;
  }

  private transformResponse(data: unknown): ChatCompletionResult {
    const response = data as PiMonoAPIResponse;
    return {
      id: response.id,
      model: response.model,
      message: {
        role: "assistant",
        content: response.choices[0].message.content,
        toolCalls: response.choices[0].message.tool_calls,
      },
      usage: {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      },
      finishReason: response.choices[0].finish_reason,
    };
  }

  private transformChunk(data: unknown): ChatCompletionChunk {
    const chunk = data as PiMonoStreamChunk;
    return {
      id: chunk.id,
      model: chunk.model,
      delta: {
        role: chunk.choices[0].delta.role,
        content: chunk.choices[0].delta.content,
        toolCalls: chunk.choices[0].delta.tool_calls,
      },
      finishReason: chunk.choices[0].finish_reason,
      usage: chunk.usage
        ? {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          }
        : undefined,
    };
  }
}

export interface PiMonoConfig {
  apiKey: string;
  baseUrl?: string;
}

interface PiMonoAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
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

interface PiMonoStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
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

export class PiMonoError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = "PiMonoError";
  }
}

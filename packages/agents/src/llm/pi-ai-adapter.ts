import {
  complete,
  getModel,
  getModels,
  stream,
  type AssistantMessage,
  type Context,
  type KnownProvider,
  type Message,
  type Model,
  type ProviderStreamOptions,
  type Tool,
} from "@mariozechner/pi-ai";

import type {
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResult,
  LLMAdapter,
  ToolCall,
  ToolDefinition,
} from "./adapter";

interface PiAIAdapterConfig {
  provider: KnownProvider;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  adapterId?: string;
}

export class PiAIAdapter implements LLMAdapter {
  readonly id: string;

  constructor(private readonly config: PiAIAdapterConfig) {
    this.id = config.adapterId ?? config.provider;
  }

  supports(feature: "streaming" | "function-calling" | "json-mode"): boolean {
    switch (feature) {
      case "streaming":
      case "function-calling":
        return true;
      case "json-mode":
        return false;
    }
  }

  async chatCompletion(
    params: ChatCompletionParams,
    options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult> {
    const model = this.resolveModel(params.model);
    const context = this.toContext(params);
    const response = await complete(model, context, this.toStreamOptions(params, options));
    return this.toChatCompletionResult(response, model.id);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const model = this.resolveModel(params.model);
    const context = this.toContext(params);
    const eventStream = stream(model, context, this.toStreamOptions(params));

    for await (const event of eventStream) {
      if (event.type === "text_delta") {
        onChunk({
          id: `chunk-${Date.now()}`,
          model: model.id,
          delta: {
            role: "assistant",
            content: event.delta,
          },
        });
      }

      if (event.type === "toolcall_end") {
        onChunk({
          id: `chunk-${Date.now()}`,
          model: model.id,
          delta: {
            role: "assistant",
            toolCalls: [
              {
                id: event.toolCall.id,
                type: "function",
                function: {
                  name: event.toolCall.name,
                  arguments: JSON.stringify(event.toolCall.arguments ?? {}),
                },
              },
            ],
          },
        });
      }
    }

    const response = await eventStream.result();
    return this.toChatCompletionResult(response, model.id);
  }

  private resolveModel(modelId?: string): Model<string> {
    const requested = modelId ?? this.config.model;

    if (requested) {
      try {
        const model = getModel(this.config.provider, requested as never);
        return this.withOverrides(model);
      } catch {
        // graceful fallback below
      }
    }

    const models = getModels(this.config.provider);
    const fallback = models[0];
    if (!fallback) {
      throw new Error(`No models available for provider: ${this.config.provider}`);
    }

    return this.withOverrides(fallback);
  }

  private withOverrides<TApi extends string>(model: Model<TApi>): Model<TApi> {
    if (!this.config.baseUrl) {
      return model;
    }

    return {
      ...model,
      baseUrl: this.config.baseUrl,
    };
  }

  private toStreamOptions(
    params: ChatCompletionParams,
    options?: { signal?: AbortSignal }
  ): ProviderStreamOptions {
    return {
      apiKey: this.config.apiKey,
      signal: options?.signal,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
    };
  }

  private toContext(params: ChatCompletionParams): Context {
    const now = Date.now();
    const systemMessages = params.messages.filter((m) => m.role === "system");
    const nonSystemMessages = params.messages.filter((m) => m.role !== "system");

    const toolCallNameById = new Map<string, string>();
    for (const message of nonSystemMessages) {
      if (message.role === "assistant" && message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          toolCallNameById.set(toolCall.id, toolCall.function.name);
        }
      }
    }

    const messages: Message[] = nonSystemMessages.map((message): Message => {
      if (message.role === "user") {
        return {
          role: "user",
          content: message.content,
          timestamp: now,
        };
      }

      if (message.role === "assistant") {
        const content: AssistantMessage["content"] = [];
        if (message.content) {
          content.push({ type: "text", text: message.content });
        }

        for (const toolCall of message.toolCalls ?? []) {
          content.push({
            type: "toolCall",
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: this.parseToolArguments(toolCall.function.arguments),
          });
        }

        return {
          role: "assistant",
          content,
          timestamp: now,
          api: "openai-completions",
          provider: this.config.provider,
          model: this.config.model ?? "unknown",
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: "stop",
        } as Message;
      }

      return {
        role: "toolResult",
        toolCallId: message.toolCallId ?? `tool-${now}`,
        toolName: toolCallNameById.get(message.toolCallId ?? "") ?? "tool",
        content: [{ type: "text", text: message.content }],
        isError: false,
        timestamp: now,
      };
    });

    const tools: Tool[] | undefined = params.tools?.map((tool: ToolDefinition) => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters as never,
    }));

    return {
      systemPrompt: systemMessages.map((m) => m.content).join("\n\n") || undefined,
      messages,
      tools,
    };
  }

  private toChatCompletionResult(response: AssistantMessage, model: string): ChatCompletionResult {
    const textContent = response.content
      .filter((item): item is { type: "text"; text: string } => item.type === "text")
      .map((item) => item.text)
      .join("");

    const toolCalls: ToolCall[] = response.content
      .filter((item): item is AssistantMessage["content"][number] & { type: "toolCall" } =>
        item.type === "toolCall"
      )
      .map((item) => ({
        id: item.id,
        type: "function",
        function: {
          name: item.name,
          arguments: JSON.stringify(item.arguments ?? {}),
        },
      }));

    return {
      id: `${response.provider}-${response.model}-${response.timestamp}`,
      model,
      message: {
        role: "assistant",
        content: textContent || null,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      },
      usage: {
        promptTokens: response.usage.input,
        completionTokens: response.usage.output,
        totalTokens: response.usage.totalTokens,
      },
      finishReason: this.mapStopReason(response.stopReason),
    };
  }

  private parseToolArguments(argumentsString: string): Record<string, unknown> {
    try {
      return JSON.parse(argumentsString) as Record<string, unknown>;
    } catch {
      return { raw: argumentsString };
    }
  }

  private mapStopReason(reason: AssistantMessage["stopReason"]): ChatCompletionResult["finishReason"] {
    switch (reason) {
      case "stop":
        return "stop";
      case "length":
        return "length";
      case "toolUse":
        return "tool_calls";
      case "aborted":
      case "error":
        return "error";
      default:
        return "error";
    }
  }
}

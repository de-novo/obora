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
} from "@earendil-works/pi-ai";

import type {
  ChatCompletionChunk,
  ChatCompletionParams,
  ChatCompletionResult,
  LLMAdapter,
  ToolCall,
  ToolDefinition,
} from "./adapter";


const PI_AI_PROVIDER_CANDIDATES = [
  "openai",
  "anthropic",
  "google",
  "zai",
  "xai",
  "groq",
  "cerebras",
  "openrouter",
  "vercel-ai-gateway",
  "mistral",
  "minimax",
  "minimax-cn",
  "huggingface",
  "opencode",
  "kimi-coding",
  "github-copilot",
] as const;

export function listPiAIProviders(): string[] {
  return PI_AI_PROVIDER_CANDIDATES.filter((provider) => {
    try {
      return getModels(provider as KnownProvider).length > 0;
    } catch {
      return false;
    }
  });
}

export function listPiAIModels(provider: string): string[] {
  const models = getModels(provider as KnownProvider);
  return models.map((model) => model.id);
}

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

    if (response.stopReason === "error") {
      const errorMessage = (response as AssistantMessage & { errorMessage?: string }).errorMessage;
      throw new Error(errorMessage ?? `pi-ai returned error stopReason for model ${model.id}`);
    }

    return this.toChatCompletionResult(response, model.id);
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const model = this.resolveModel(params.model);
    const context = this.toContext(params);
    const eventStream = stream(model, context, this.toStreamOptions(params));

    const consumeEvents = async (
      iterator: AsyncIterator<Awaited<ReturnType<typeof eventStream[typeof Symbol.asyncIterator]> extends AsyncIterator<infer T> ? T : never>>
    ): Promise<void> => {
      const result = await iterator.next();
      if (result.done) {
        return;
      }
      const event = result.value;
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
      return consumeEvents(iterator);
    };

    await consumeEvents(eventStream[Symbol.asyncIterator]());

    const response = await eventStream.result();

    if (response.stopReason === "error") {
      const errorMessage = (response as AssistantMessage & { errorMessage?: string }).errorMessage;
      throw new Error(errorMessage ?? `pi-ai returned error stopReason for model ${model.id}`);
    }

    return this.toChatCompletionResult(response, model.id);
  }

  private resolveModel(modelId?: string): Model<string> {
    const requested = modelId ?? this.config.model;

    if (!requested) {
      throw new Error(
        `No model specified for provider '${this.config.provider}'. ` +
          `Available models: ${this.listAvailableModels()}`
      );
    }

    try {
      const model = getModel(this.config.provider, requested as never);
      if (!model) {
        throw new Error("Model not found");
      }
      return this.withOverrides(model);
    } catch {
      throw new Error(
        `[MODEL_1002] Unsupported model ref: ${requested}
` +
          `Reason: installed runtime catalog does not include this model for provider ${this.config.provider}
` +
          `Fix: use a supported model or upgrade @earendil-works/pi-ai
` +
          `Context: provider=${this.config.provider}, available=${this.listAvailableModels()}`
      );
    }
  }

  private listAvailableModels(): string {
    return listPiAIModels(this.config.provider).join(", ");
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

    const toolCallNameById = new Map(
      nonSystemMessages.flatMap((message) =>
        message.role === "assistant" && message.toolCalls
          ? message.toolCalls.map((toolCall) => [toolCall.id, toolCall.function.name] as const)
          : []
      )
    );

    const messages: Message[] = nonSystemMessages.map((message): Message => {
      if (message.role === "user") {
        return {
          role: "user",
          content: message.content,
          timestamp: now,
        };
      }

      if (message.role === "assistant") {
        const content: AssistantMessage["content"] = [
          ...(message.content ? [{ type: "text" as const, text: message.content }] : []),
          ...(message.toolCalls ?? []).map((toolCall) => ({
            type: "toolCall" as const,
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: this.parseToolArguments(toolCall.function.arguments),
          })),
        ];

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

    if (textContent.trim().length === 0 && toolCalls.length === 0) {
      const contentTypes = response.content.map((item) => item.type).join(", ") || "none";
      throw new Error(
        `pi-ai returned no assistant text or tool calls for model ${model}; contentTypes=${contentTypes}`
      );
    }

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

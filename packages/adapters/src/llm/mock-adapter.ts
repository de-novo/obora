import {
  LLMAdapter,
  ChatCompletionParams,
  ChatCompletionResult,
  ChatCompletionChunk,
} from "./adapter";

export class MockLLMAdapter implements LLMAdapter {
  readonly id = "mock-llm";

  constructor(
    private readonly responses: Record<
      string,
      string | ((params: ChatCompletionParams) => string)
    > = {}
  ) {}

  supports(_feature: "streaming" | "function-calling" | "json-mode"): boolean {
    return true;
  }

  async chatCompletion(
    params: ChatCompletionParams,
    _options?: { signal?: AbortSignal }
  ): Promise<ChatCompletionResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lastUserMessage = params.messages.filter((m) => m.role === "user").pop();
    const messageContent = lastUserMessage?.content ?? "";

    // 1. 정확한 키 매칭 시도
    const matchedKey =
      messageContent in this.responses
        ? messageContent
        : (Object.keys(this.responses).find(
            (registeredKey) => registeredKey && messageContent.includes(registeredKey)
          ) ?? ("" in this.responses ? "" : undefined));

    const selected = matchedKey !== undefined ? this.responses[matchedKey] : undefined;
    const content =
      typeof selected === "function"
        ? (selected as (p: ChatCompletionParams) => string)(params)
        : (selected ?? `Mock response to: ${messageContent || "default"}`);

    return {
      id: `mock-${Date.now()}`,
      model: "mock-model",
      message: {
        role: "assistant",
        content,
      },
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      finishReason: "stop",
    };
  }

  async streamChatCompletion(
    params: ChatCompletionParams,
    onChunk: (chunk: ChatCompletionChunk) => void
  ): Promise<ChatCompletionResult> {
    const result = await this.chatCompletion(params);
    const content = result.message.content ?? "";

    const words = content.split(" ");
    await words.reduce<Promise<void>>(async (previousChunk, word, index) => {
      await previousChunk;
      await new Promise((resolve) => setTimeout(resolve, 50));
      const isLast = index === words.length - 1;
      onChunk({
        id: `mock-${Date.now()}`,
        model: "mock-model",
        delta: {
          role: "assistant",
          content: word + (isLast ? "" : " "),
        },
        finishReason: isLast ? "stop" : undefined,
      });
    }, Promise.resolve());

    return result;
  }

  setResponse(key: string, response: string | ((params: ChatCompletionParams) => string)): void {
    this.responses[key] = response;
  }

  clearResponses(): void {
    Object.keys(this.responses).forEach((key) => {
      delete this.responses[key];
    });
  }
}

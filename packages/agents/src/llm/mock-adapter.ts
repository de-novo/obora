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

  async chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResult> {
    await new Promise((resolve) => setTimeout(resolve, 100));

    const lastUserMessage = params.messages.filter((m) => m.role === "user").pop();
    const key = lastUserMessage?.content ?? "default";
    const content =
      typeof this.responses[key] === "function"
        ? (this.responses[key] as (p: ChatCompletionParams) => string)(params)
        : (this.responses[key] ?? `Mock response to: ${key}`);

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
    for (let i = 0; i < words.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      const isLast = i === words.length - 1;
      onChunk({
        id: `mock-${Date.now()}`,
        model: "mock-model",
        delta: {
          role: "assistant",
          content: words[i] + (isLast ? "" : " "),
        },
        finishReason: isLast ? "stop" : undefined,
      });
    }

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

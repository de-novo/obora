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
    let matchedKey: string | undefined = undefined;
    if (messageContent in this.responses) {
      matchedKey = messageContent;
    } else {
      // 2. 부분 문자열 매칭 시도 (등록된 키가 메시지에 포함되어 있는지)
      for (const registeredKey of Object.keys(this.responses)) {
        if (registeredKey && messageContent.includes(registeredKey)) {
          matchedKey = registeredKey;
          break;
        }
      }
      // 3. 빈 문자열 키를 기본 폴백으로 사용
      if (matchedKey === undefined && "" in this.responses) {
        matchedKey = "";
      }
    }

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

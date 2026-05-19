import { describe, it, expect, vi } from "vitest";

import { complete, type AssistantMessage } from "@earendil-works/pi-ai";

import type { ChatCompletionParams, ChatCompletionResult } from "../../llm/adapter";
import { PiAIAdapter } from "../../llm/pi-ai-adapter";

vi.mock("@earendil-works/pi-ai", () => ({
  getModel: vi.fn((provider: string, modelId: string) => {
    if (provider === "openai" && modelId === "gpt-4o-mini") {
      return {
        id: "gpt-4o-mini",
        provider: "openai",
        api: "openai-completions",
        baseUrl: "https://api.openai.com/v1",
      };
    }
    throw new Error(`Unknown model: ${provider}/${modelId}`);
  }),
  getModels: vi.fn(() => [{ id: "gpt-4o-mini", provider: "openai", api: "openai-completions", baseUrl: "https://api.openai.com/v1" }]),
  complete: vi.fn(async () => ({
    role: "assistant",
    content: [{ type: "text", text: "hello" }],
    api: "openai-completions",
    provider: "openai",
    model: "gpt-4o-mini",
    usage: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: "stop",
    timestamp: 1,
  })),
  stream: vi.fn(() => ({
    async *[Symbol.asyncIterator]() {
      yield { type: "text_delta", delta: "he" };
      yield { type: "text_delta", delta: "llo" };
    },
    async result() {
      return {
        role: "assistant",
        content: [{ type: "text", text: "hello" }],
        api: "openai-completions",
        provider: "openai",
        model: "gpt-4o-mini",
        usage: { input: 5, output: 3, cacheRead: 0, cacheWrite: 0, totalTokens: 8, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "stop",
        timestamp: 1,
      };
    },
  })),
}));

describe("LLMAdapter Interface", () => {
  it("should define the correct interface structure", () => {
    const params: ChatCompletionParams = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
      temperature: 0.7,
      maxTokens: 2048,
      topP: 0.9,
      tools: [
        {
          type: "function",
          function: {
            name: "test_function",
            description: "A test function",
            parameters: { type: "object", properties: {} },
          },
        },
      ],
      toolChoice: "auto",
      responseFormat: { type: "text" },
      stopSequences: ["END"],
    };

    expect(params.messages).toHaveLength(2);
    expect(params.temperature).toBe(0.7);
    expect(params.maxTokens).toBe(2048);
    expect(params.topP).toBe(0.9);
    expect(params.tools).toHaveLength(1);
    expect(params.toolChoice).toBe("auto");
    expect(params.responseFormat?.type).toBe("text");
    expect(params.stopSequences).toEqual(["END"]);
  });

  it("should define ChatCompletionResult structure", () => {
    const result: ChatCompletionResult = {
      id: "test-id",
      model: "test-model",
      message: {
        role: "assistant",
        content: "Hello!",
      },
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      finishReason: "stop",
    };

    expect(result.id).toBe("test-id");
    expect(result.model).toBe("test-model");
    expect(result.message.role).toBe("assistant");
    expect(result.message.content).toBe("Hello!");
    expect(result.usage.promptTokens).toBe(10);
    expect(result.usage.completionTokens).toBe(20);
    expect(result.usage.totalTokens).toBe(30);
    expect(result.finishReason).toBe("stop");
  });
});

describe("PiAIAdapter", () => {
  it("should map complete() response to ChatCompletionResult", async () => {
    const adapter = new PiAIAdapter({ provider: "openai", apiKey: "test", model: "gpt-4o-mini" });

    const result = await adapter.chatCompletion({
      messages: [{ role: "user", content: "hello" }],
    });

    expect(result.message.content).toBe("hello");
    expect(result.usage.totalTokens).toBe(8);
    expect(result.finishReason).toBe("stop");
  });

  it("should reject responses without assistant text or tool calls", async () => {
    const adapter = new PiAIAdapter({ provider: "openai", apiKey: "test", model: "gpt-4o-mini" });
    const thinkingOnlyResponse: AssistantMessage = {
      role: "assistant",
      content: [{ type: "thinking", thinking: "internal reasoning" }],
      api: "openai-completions",
      provider: "openai",
      model: "gpt-4o-mini",
      usage: {
        input: 5,
        output: 3,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 8,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: 1,
    };

    vi.mocked(complete).mockResolvedValueOnce(thinkingOnlyResponse);

    await expect(
      adapter.chatCompletion({
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toThrow(
      "pi-ai returned no assistant text or tool calls for model gpt-4o-mini; contentTypes=thinking"
    );
  });

  it("should emit stream chunks and return final result", async () => {
    const adapter = new PiAIAdapter({ provider: "openai", apiKey: "test", model: "gpt-4o-mini" });

    const chunks: string[] = [];
    const result = await adapter.streamChatCompletion(
      {
        messages: [{ role: "user", content: "hello" }],
      },
      (chunk) => {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      }
    );

    expect(chunks.join("")).toBe("hello");
    expect(result.message.content).toBe("hello");
  });

  it("should throw when no model is specified", async () => {
    const adapter = new PiAIAdapter({ provider: "openai", apiKey: "test" });

    await expect(
      adapter.chatCompletion({
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toThrow(
      "No model specified for provider 'openai'. Available models: gpt-4o-mini"
    );
  });

  it("should throw with available models when requested model is invalid", async () => {
    const adapter = new PiAIAdapter({ provider: "openai", apiKey: "test", model: "gpt-4o-mini" });

    await expect(
      adapter.chatCompletion({
        model: "bad-model",
        messages: [{ role: "user", content: "hello" }],
      })
    ).rejects.toThrow(/(\[MODEL_1002\] Unsupported model ref: bad-model|Model 'bad-model' not found for provider 'openai')/);
  });
});

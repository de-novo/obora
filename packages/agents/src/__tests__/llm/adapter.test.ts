import { describe, it, expect } from "vitest";

import type { ChatCompletionParams, ChatCompletionResult } from "../../llm/adapter";

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

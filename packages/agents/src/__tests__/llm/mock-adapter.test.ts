import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ChatCompletionParams } from "../../llm/adapter";
import { MockLLMAdapter } from "../../llm/mock-adapter";

describe("MockLLMAdapter", () => {
  let adapter: MockLLMAdapter;

  beforeEach(() => {
    adapter = new MockLLMAdapter();
  });

  describe("id", () => {
    it("should have correct id", () => {
      expect(adapter.id).toBe("mock-llm");
    });
  });

  describe("supports", () => {
    it("should support all features", () => {
      expect(adapter.supports("streaming")).toBe(true);
      expect(adapter.supports("function-calling")).toBe(true);
      expect(adapter.supports("json-mode")).toBe(true);
    });
  });

  describe("chatCompletion", () => {
    it("should return default response", async () => {
      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await adapter.chatCompletion(params);

      expect(result.id).toMatch(/^mock-\d+$/);
      expect(result.model).toBe("mock-model");
      expect(result.message.role).toBe("assistant");
      expect(result.message.content).toBe("Mock response to: Hello");
      expect(result.usage.promptTokens).toBe(10);
      expect(result.usage.completionTokens).toBe(20);
      expect(result.usage.totalTokens).toBe(30);
      expect(result.finishReason).toBe("stop");
    });

    it("should return custom response from map", async () => {
      adapter.setResponse("Hello", "Custom response!");
      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await adapter.chatCompletion(params);

      expect(result.message.content).toBe("Custom response!");
    });

    it("should call response function", async () => {
      const responseFn = vi.fn((params: ChatCompletionParams) => {
        return `Response to: ${params.messages[0].content}`;
      });
      adapter.setResponse("Test", responseFn);
      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await adapter.chatCompletion(params);

      expect(responseFn).toHaveBeenCalledWith(params);
      expect(result.message.content).toBe("Response to: Test");
    });

    it("should handle multiple messages correctly", async () => {
      const params: ChatCompletionParams = {
        messages: [
          { role: "system", content: "You are helpful" },
          { role: "user", content: "First" },
          { role: "assistant", content: "Response 1" },
          { role: "user", content: "Second" },
        ],
      };

      const result = await adapter.chatCompletion(params);

      expect(result.message.content).toBe("Mock response to: Second");
    });
  });

  describe("streamChatCompletion", () => {
    it("should stream chunks", async () => {
      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Hello world" }],
      };

      const chunks: unknown[] = [];
      const result = await adapter.streamChatCompletion(params, (chunk) => {
        chunks.push(chunk);
      });

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.length).toBe(5);

      const finalChunk = chunks[chunks.length - 1] as { finishReason?: string };
      expect(finalChunk.finishReason).toBe("stop");
      expect(result.message.content).toBe("Mock response to: Hello world");
    });

    it("should stream custom response", async () => {
      adapter.setResponse("Test", "Custom streaming response");
      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Test" }],
      };

      const chunks: string[] = [];
      await adapter.streamChatCompletion(params, (chunk) => {
        if (chunk.delta.content) {
          chunks.push(chunk.delta.content);
        }
      });

      const fullContent = chunks.join("");
      expect(fullContent).toBe("Custom streaming response");
    });
  });

  describe("setResponse", () => {
    it("should set custom response", () => {
      adapter.setResponse("key", "value");
      adapter.setResponse("key2", (params) => `custom: ${params.messages[0].content}`);

      expect(() => adapter.setResponse("key", "value")).not.toThrow();
    });
  });

  describe("clearResponses", () => {
    it("should clear all responses", async () => {
      adapter.setResponse("Hello", "Custom");
      adapter.clearResponses();

      const params: ChatCompletionParams = {
        messages: [{ role: "user", content: "Hello" }],
      };

      const result = await adapter.chatCompletion(params);

      expect(result.message.content).toBe("Mock response to: Hello");
    });
  });
});

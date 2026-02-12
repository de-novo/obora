import { describe, it, expect, beforeEach, afterEach } from "vitest";

import type { LLMAdapter } from "../../llm/adapter";
import { createLLMAdapter, createAdapterFromEnv } from "../../llm/factory";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { PiMonoAdapter } from "../../llm/pi-mono-adapter";
import { withRetry } from "../../llm/retry-handler";

describe("Factory", () => {
  describe("createLLMAdapter", () => {
    it("should create pi-mono adapter", () => {
      const adapter = createLLMAdapter("pi-mono", { apiKey: "test-key" });

      expect(adapter).toBeInstanceOf(PiMonoAdapter);
      expect(adapter.id).toBe("pi-mono");
    });

    it("should wrap adapter with retry", () => {
      const adapter = createLLMAdapter("pi-mono", { apiKey: "test-key" });

      expect(adapter.id).toBe("pi-mono");
    });

    it("should throw for unsupported provider", () => {
      expect(() => createLLMAdapter("unknown" as "pi-mono", { apiKey: "test" } as never)).toThrow(
        "Unsupported LLM provider: unknown"
      );
    });
  });

  describe("createAdapterFromEnv", () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it("should create pi-mono adapter from env with default provider", () => {
      process.env!.PIMONO_API_KEY = "test-key";

      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(PiMonoAdapter);
      expect(adapter.id).toBe("pi-mono");
    });

    it("should create pi-mono adapter from env with explicit provider", () => {
      process.env!.OBORA_LLM_PROVIDER = "pi-mono";
      process.env!.PIMONO_API_KEY = "test-key";

      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(PiMonoAdapter);
      expect(adapter.id).toBe("pi-mono");
    });

    it("should throw when PIMONO_API_KEY is missing", () => {
      process.env!.OBORA_LLM_PROVIDER = "pi-mono";
      delete process.env!.PIMONO_API_KEY;

      expect(createAdapterFromEnv).toThrow("PIMONO_API_KEY environment variable is required");
    });

    it("should throw for unsupported provider from env", () => {
      process.env!.OBORA_LLM_PROVIDER = "unknown";

      expect(createAdapterFromEnv).toThrow("Unsupported LLM provider: unknown");
    });
  });
});

describe("withRetry proxy", () => {
  it("should wrap chatCompletion with retry", async () => {
    const mockAdapter = new MockLLMAdapter();
    const adapter = withRetry(mockAdapter);

    const result = await adapter.chatCompletion({
      messages: [{ role: "user", content: "test" }],
    });

    expect(result.message.content).toBe("Mock response to: test");
  });

  it("should wrap streamChatCompletion with retry", async () => {
    const mockAdapter = new MockLLMAdapter();
    const adapter = withRetry(mockAdapter);

    const chunks: unknown[] = [];
    await adapter.streamChatCompletion({ messages: [{ role: "user", content: "test" }] }, (chunk) =>
      chunks.push(chunk)
    );

    expect(chunks.length).toBeGreaterThan(0);
  });

  it("should preserve adapter id", () => {
    const mockAdapter = new MockLLMAdapter();
    const adapter = withRetry(mockAdapter);

    expect(adapter.id).toBe("mock-llm");
  });

  it("should preserve supports method", () => {
    const mockAdapter = new MockLLMAdapter();
    const adapter = withRetry(mockAdapter);

    expect(adapter.supports("streaming")).toBe(true);
    expect(adapter.supports("function-calling")).toBe(true);
    expect(adapter.supports("json-mode")).toBe(true);
  });

  it("should retry on failures", async () => {
    let attempts = 0;
    const failingAdapter: LLMAdapter = {
      id: "failing",
      supports: () => true,
      async chatCompletion() {
        attempts++;
        if (attempts < 2) {
          throw new Error("rate limit");
        }
        return {
          id: "test",
          model: "test",
          message: { role: "assistant", content: "success" },
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
          finishReason: "stop",
        };
      },
      async streamChatCompletion() {
        return this.chatCompletion({ messages: [] });
      },
    };

    const adapter = withRetry(failingAdapter);
    const result = await adapter.chatCompletion({ messages: [] });

    expect(attempts).toBe(2);
    expect(result.message.content).toBe("success");
  });
});

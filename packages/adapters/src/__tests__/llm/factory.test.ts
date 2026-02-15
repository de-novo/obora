import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { FileAuthManager } from "../../auth";
import type { LLMAdapter } from "../../llm/adapter";
import { createAdapter, createLLMAdapter, createAdapterFromEnv } from "../../llm/factory";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { PiAIAdapter } from "../../llm/pi-ai-adapter";
import { withRetry } from "../../llm/retry-handler";

describe("Factory", () => {
  describe("createLLMAdapter", () => {
    it("should create pi-ai backed adapter", () => {
      const adapter = createLLMAdapter("openai", { apiKey: "test-key" });

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("openai");
    });

    it("should keep backward-compatible pi-mono provider alias", () => {
      const adapter = createLLMAdapter("pi-mono", { apiKey: "test-key" });

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("pi-mono");
    });

    it("should throw for unsupported provider", () => {
      expect(() => createLLMAdapter("unknown" as "openai", { apiKey: "test" })).toThrow(
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

    it("should create openai adapter from env with default provider", () => {
      process.env!.OPENAI_API_KEY = "test-key";

      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("openai");
    });

    it("should create provider adapter from env with explicit provider", () => {
      process.env!.OBORA_LLM_PROVIDER = "anthropic";
      process.env!.ANTHROPIC_API_KEY = "test-key";

      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("anthropic");
    });

    it("should throw when provider API key is missing in production", () => {
      process.env!.OBORA_LLM_PROVIDER = "openai";
      process.env!.NODE_ENV = "production";
      delete process.env!.OPENAI_API_KEY;

      expect(createAdapterFromEnv).toThrow("OPENAI_API_KEY environment variable is required in production");
    });

    it("should fallback to MockLLMAdapter with warning in development when key missing", () => {
      process.env!.OBORA_LLM_PROVIDER = "openai";
      process.env!.NODE_ENV = "development";
      delete process.env!.OPENAI_API_KEY;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(MockLLMAdapter);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("OPENAI_API_KEY not set"));
      warnSpy.mockRestore();
    });

    it("should create MockLLMAdapter when provider is explicitly mock", () => {
      process.env!.OBORA_LLM_PROVIDER = "mock";

      const adapter = createAdapterFromEnv();
      expect(adapter).toBeInstanceOf(MockLLMAdapter);
    });
  });
});

describe("createAdapter", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("falls back to another authenticated provider when requested provider has no auth/env", async () => {
    delete process.env!.OPENAI_API_KEY;

    vi.spyOn(FileAuthManager.prototype, "getProvider").mockImplementation(async (provider: string) => {
      if (provider === "anthropic") {
        return {
          provider: "anthropic",
          type: "apiKey",
          apiKey: "test-key",
          addedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return undefined;
    });

    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([
      {
        provider: "openai",
        type: "apiKey",
        apiKey: "openai-key",
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        provider: "anthropic",
        type: "apiKey",
        apiKey: "anthropic-key",
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const adapter = await createAdapter("openai");

    expect(adapter).toBeInstanceOf(PiAIAdapter);
    expect(adapter.id).toBe("anthropic");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Falling back to authenticated provider"));
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

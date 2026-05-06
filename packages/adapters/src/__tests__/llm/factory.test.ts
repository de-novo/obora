import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { FileAuthManager } from "../../auth";
import type { LLMAdapter } from "../../llm/adapter";
import {
  createAdapter,
  createLLMAdapter,
  createAdapterFromEnv,
  getProviderDefaultModel,
  isSupportedProvider,
  pickPreferredProvider,
} from "../../llm/factory";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { PiAIAdapter } from "../../llm/pi-ai-adapter";
import { withRetry } from "../../llm/retry-handler";

describe("Factory", () => {
  describe("provider inventory helpers", () => {
    it("selects preferred authenticated providers by priority and stable fallback order", () => {
      expect(pickPreferredProvider([])).toBeUndefined();
      expect(pickPreferredProvider(["zai", "openai", "anthropic"])).toBe("anthropic");
      expect(pickPreferredProvider(["xai", "cerebras", "groq"])).toBe("cerebras");
    });

    it("checks provider support and default model lookup", () => {
      expect(isSupportedProvider("openai")).toBe(true);
      expect(isSupportedProvider("unknown")).toBe(false);
      expect(getProviderDefaultModel("openai")).toBe("gpt-4o-mini");
      expect(getProviderDefaultModel("unknown")).toBeUndefined();
    });
  });

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

    it("should reject unsupported env providers before auth fallback", () => {
      process.env!.OBORA_LLM_PROVIDER = "unsupported-provider";

      expect(() => createAdapterFromEnv()).toThrow(
        "Unsupported LLM provider: unsupported-provider"
      );
    });

    it("should create adapters for providers without base URL env overrides", () => {
      process.env!.BEDROCK_API_KEY = "bedrock-key";

      const adapter = createAdapterFromEnv("amazon-bedrock");

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("amazon-bedrock");
    });

    it("should create provider adapters with explicit model and base URL overrides", () => {
      process.env!.OPENAI_API_KEY = "test-key";

      const adapter = createAdapterFromEnv("openai", {
        model: "custom-model",
        baseUrl: "https://override.test/v1",
      });

      expect(adapter).toBeInstanceOf(PiAIAdapter);
      expect(adapter.id).toBe("openai");
    });

    it("should use default development behavior when NODE_ENV is unset", () => {
      process.env!.OBORA_LLM_PROVIDER = "openai";
      delete process.env!.OPENAI_API_KEY;
      delete process.env!.NODE_ENV;

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const adapter = createAdapterFromEnv();

      expect(adapter).toBeInstanceOf(MockLLMAdapter);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("OPENAI_API_KEY not set"));
      warnSpy.mockRestore();
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

  it("uses requested provider auth before env or fallback providers", async () => {
    process.env!.OPENAI_API_KEY = "env-key";

    vi.spyOn(FileAuthManager.prototype, "getProvider").mockResolvedValue({
      provider: "openai",
      type: "apiKey",
      apiKey: "stored-key",
      baseUrl: "https://stored.test/v1",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    const adapter = await createAdapter("openai", { model: "gpt-4o-mini" });

    expect(adapter).toBeInstanceOf(PiAIAdapter);
    expect(adapter.id).toBe("openai");
  });

  it("uses env auth when no stored credentials exist", async () => {
    process.env!.OPENAI_API_KEY = "env-key";

    vi.spyOn(FileAuthManager.prototype, "getProvider").mockResolvedValue(undefined);
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    const adapter = await createAdapter("openai");

    expect(adapter).toBeInstanceOf(PiAIAdapter);
    expect(adapter.id).toBe("openai");
  });

  it("falls back to env behavior when listed fallback providers cannot be resolved", async () => {
    delete process.env!.OPENAI_API_KEY;
    process.env!.NODE_ENV = "development";

    vi.spyOn(FileAuthManager.prototype, "getProvider").mockResolvedValue(undefined);
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([
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

    expect(adapter).toBeInstanceOf(MockLLMAdapter);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("OPENAI_API_KEY not set"));
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

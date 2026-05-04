import { describe, it, expect, vi } from "vitest";
import { AdapterResolver } from "../adapter-resolver.js";
import type { LLMConfig } from "../../runtime-types.js";
import type { LLMAdapterLike } from "../../step-executor.js";

describe("AdapterResolver", () => {
  const createMockAdapter = (): LLMAdapterLike =>
    ({ id: "mock-adapter" }) as LLMAdapterLike;

  it("creates and caches adapter", async () => {
    const factory = vi.fn().mockResolvedValue(createMockAdapter());
    const resolver = new AdapterResolver(factory);

    const config: LLMConfig = {
      provider: "openai",
      model: "gpt-4",
      baseUrl: "https://api.openai.com",
      apiKey: "test-key",
    };

    const adapter1 = await resolver.get(config);
    const adapter2 = await resolver.get(config);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(adapter1).toBe(adapter2); // same cached instance
  });

  it("creates different adapters for different configs", async () => {
    const factory = vi.fn().mockResolvedValue(createMockAdapter());
    const resolver = new AdapterResolver(factory);

    const config1: LLMConfig = {
      provider: "openai",
      model: "gpt-4",
      apiKey: "key1",
    };
    const config2: LLMConfig = {
      provider: "anthropic",
      model: "claude-3",
      apiKey: "key2",
    };

    await resolver.get(config1);
    await resolver.get(config2);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("caches separately when model is undefined", async () => {
    const factory = vi.fn().mockResolvedValue(createMockAdapter());
    const resolver = new AdapterResolver(factory);

    const config1: LLMConfig = {
      provider: "openai",
      apiKey: "key1",
    };
    const config2: LLMConfig = {
      provider: "openai",
      apiKey: "key2",
    };

    await resolver.get(config1);
    await resolver.get(config2);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("caches separately when baseUrl is undefined", async () => {
    const factory = vi.fn().mockResolvedValue(createMockAdapter());
    const resolver = new AdapterResolver(factory);

    const config1: LLMConfig = {
      provider: "openai",
      model: "gpt-4",
      apiKey: "key1",
    };
    const config2: LLMConfig = {
      provider: "openai",
      model: "gpt-4",
      baseUrl: "https://custom.api.com",
      apiKey: "key1",
    };

    await resolver.get(config1);
    await resolver.get(config2);

    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("reuses cached adapter for identical config", async () => {
    const factory = vi.fn().mockResolvedValue(createMockAdapter());
    const resolver = new AdapterResolver(factory);

    const config: LLMConfig = {
      provider: "openai",
      model: "gpt-4",
      baseUrl: "https://api.openai.com",
      apiKey: "test-key",
    };

    const adapter1 = await resolver.get(config);
    const adapter2 = await resolver.get(config);
    const adapter3 = await resolver.get(config);

    expect(factory).toHaveBeenCalledTimes(1);
    expect(adapter1).toBe(adapter2);
    expect(adapter2).toBe(adapter3);
  });
});

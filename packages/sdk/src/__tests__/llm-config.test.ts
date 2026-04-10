import { describe, expect, it } from "vitest";

import { detectLLMConfigFromEnv, resolveLLMConfig } from "../llm-config.js";

describe("llm-config", () => {
  it("detects built-in providers first", () => {
    const config = detectLLMConfigFromEnv({
      OPENAI_API_KEY: "openai-key",
      OBORA_LLM_PROVIDER: "custom-provider",
      OBORA_LLM_API_KEY: "custom-key",
    });

    expect(config).toEqual({
      provider: "openai",
      apiKey: "openai-key",
      model: undefined,
    });
  });

  it("detects custom provider from OBORA_LLM_PROVIDER and OBORA_LLM_API_KEY", () => {
    const config = detectLLMConfigFromEnv({
      OBORA_LLM_PROVIDER: "my-provider",
      OBORA_LLM_API_KEY: "my-key",
      OBORA_LLM_MODEL: "my-model",
      OBORA_LLM_BASE_URL: "https://llm.example.com",
    });

    expect(config).toEqual({
      provider: "my-provider",
      apiKey: "my-key",
      model: "my-model",
    });
  });

  it("resolveLLMConfig priority: explicit > config > env", () => {
    process.env.ANTHROPIC_API_KEY="env-key";

    const fromExplicit = resolveLLMConfig(
      { provider: "openai", apiKey: "explicit-key", model: "gpt-5" },
      {
        defaults: { provider: "anthropic" },
        providers: {
          anthropic: { authRef: "plain-config-key", defaultModel: "claude-opus-4-6" },
        },
      }
    );
    expect(fromExplicit?.provider).toBe("openai");

    const fromConfig = resolveLLMConfig(undefined, {
      defaults: { provider: "anthropic" },
      providers: {
        anthropic: { authRef: "plain-config-key", defaultModel: "claude-opus-4-6" },
      },
    });
    expect(fromConfig?.provider).toBe("anthropic");
    expect(fromConfig?.apiKey).toBe("plain-config-key");

    const fromEnv = resolveLLMConfig();
    expect(fromEnv?.provider).toBe("anthropic");
    expect(fromEnv?.apiKey).toBe("env-key");

    delete process.env.ANTHROPIC_API_KEY;
  });

  it("inherits config model when env auth is present for the configured provider", () => {
    const resolved = resolveLLMConfig(
      { provider: "openai", apiKey: "env-openai-key" },
      {
        defaults: { provider: "openai", model: "gpt-4o-mini" },
        providers: {
          openai: {},
        },
      }
    );

    expect(resolved).toEqual(
      expect.objectContaining({
        provider: "openai",
        apiKey: "env-openai-key",
        model: "gpt-4o-mini",
      })
    );
  });
});

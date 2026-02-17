import { describe, expect, it } from "vitest";

import { detectLLMConfigFromEnv } from "../llm-config.js";

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
      baseUrl: undefined,
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
      baseUrl: "https://llm.example.com",
    });
  });
});

/**
 * E2E test helpers for real LLM adapter testing.
 *
 * Provides factory functions that create real adapters against zai/glm-4.7
 * (or the model specified by OBORA_TEST_MODEL env var).
 */
import { createLLMAdapter, type LLMProvider } from "../../llm/factory.js";
import type { LLMAdapter } from "../../llm/adapter.js";

export interface E2ETestConfig {
  provider: LLMProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Resolves test config from environment variables.
 * Returns undefined if required env vars are missing (test should be skipped).
 */
export function resolveE2EConfig(): E2ETestConfig | undefined {
  const provider = (process.env.OBORA_TEST_PROVIDER ?? "zai") as LLMProvider;
  const model = process.env.OBORA_TEST_MODEL ?? "glm-4.7";

  const apiKeyEnvMap: Record<string, string> = {
    zai: "ZAI_API_KEY",
    openai: "OPENAI_API_KEY",
    anthropic: "ANTHROPIC_API_KEY",
    google: "GOOGLE_API_KEY",
  };

  const envKey = apiKeyEnvMap[provider] ?? `${provider.toUpperCase().replace(/-/g, "_")}_API_KEY`;
  const apiKey = process.env[envKey];

  if (!apiKey) {
    return undefined;
  }

  return {
    provider,
    model,
    apiKey,
    baseUrl: process.env.OBORA_TEST_BASE_URL,
  };
}

/**
 * Creates a real LLM adapter for E2E testing.
 * Throws if config is not available.
 */
export function createE2EAdapter(config?: E2ETestConfig): LLMAdapter {
  const resolved = config ?? resolveE2EConfig();
  if (!resolved) {
    throw new Error(
      "E2E test config not available. Set ZAI_API_KEY (or the appropriate provider key) to run E2E tests."
    );
  }

  return createLLMAdapter(resolved.provider, {
    apiKey: resolved.apiKey,
    model: resolved.model,
    baseUrl: resolved.baseUrl,
  });
}

/**
 * Guard that skips the test if E2E config is not available.
 * Use in describe/it blocks: `const config = skipIfNoE2E();`
 */
export function skipIfNoE2E(): E2ETestConfig {
  const config = resolveE2EConfig();
  if (!config) {
    // vitest will see the skip
    throw new Error("SKIP: E2E config not available");
  }
  return config;
}

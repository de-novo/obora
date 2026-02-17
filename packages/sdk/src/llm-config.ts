export interface LLMConfig {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const PROVIDER_ENV_MAP: Array<{ provider: string; key: string; baseUrl?: string; model?: string }> = [
  { provider: "openai", key: "OPENAI_API_KEY", baseUrl: "OPENAI_BASE_URL", model: "OPENAI_MODEL" },
  { provider: "anthropic", key: "ANTHROPIC_API_KEY", baseUrl: "ANTHROPIC_BASE_URL", model: "ANTHROPIC_MODEL" },
  { provider: "google", key: "GOOGLE_API_KEY", baseUrl: "GOOGLE_BASE_URL", model: "GOOGLE_MODEL" },
  { provider: "xai", key: "XAI_API_KEY", baseUrl: "XAI_BASE_URL", model: "XAI_MODEL" },
];

export function detectLLMConfigFromEnv(env: NodeJS.ProcessEnv = process.env): LLMConfig | undefined {
  for (const candidate of PROVIDER_ENV_MAP) {
    const apiKey = env[candidate.key];
    if (!apiKey) {
      continue;
    }

    return {
      provider: candidate.provider,
      apiKey,
      model: candidate.model ? env[candidate.model] : undefined,
      baseUrl: candidate.baseUrl ? env[candidate.baseUrl] : undefined,
    };
  }

  return undefined;
}

export function resolveLLMConfig(config?: LLMConfig): LLMConfig | undefined {
  return config ?? detectLLMConfigFromEnv();
}

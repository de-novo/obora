import { resolveProviderConfig, type OboraConfig } from "./config-loader.js";

export interface LLMConfig {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  timeout?: number;
  maxTokens?: number;
}

const PROVIDER_ENV_MAP: Array<{ provider: string; key: string; model?: string }> = [
  { provider: "openai", key: "OPENAI_API_KEY", model: "OPENAI_MODEL" },
  { provider: "anthropic", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" },
  { provider: "google", key: "GOOGLE_API_KEY", model: "GOOGLE_MODEL" },
  { provider: "zai", key: "ZAI_API_KEY", model: "ZAI_MODEL" },
  { provider: "xai", key: "XAI_API_KEY", model: "XAI_MODEL" },
  { provider: "groq", key: "GROQ_API_KEY", model: "GROQ_MODEL" },
  { provider: "cerebras", key: "CEREBRAS_API_KEY", model: "CEREBRAS_MODEL" },
  { provider: "openrouter", key: "OPENROUTER_API_KEY", model: "OPENROUTER_MODEL" },
  { provider: "vercel-ai-gateway", key: "VERCEL_AI_GATEWAY_API_KEY", model: "VERCEL_AI_GATEWAY_MODEL" },
  { provider: "mistral", key: "MISTRAL_API_KEY", model: "MISTRAL_MODEL" },
  { provider: "minimax", key: "MINIMAX_API_KEY", model: "MINIMAX_MODEL" },
  { provider: "minimax-cn", key: "MINIMAX_CN_API_KEY", model: "MINIMAX_CN_MODEL" },
  { provider: "huggingface", key: "HUGGINGFACE_API_KEY", model: "HUGGINGFACE_MODEL" },
  { provider: "opencode", key: "OPENCODE_API_KEY", model: "OPENCODE_MODEL" },
  { provider: "kimi-coding", key: "KIMI_CODING_API_KEY", model: "KIMI_CODING_MODEL" },
  { provider: "github-copilot", key: "GITHUB_COPILOT_API_KEY", model: "GITHUB_COPILOT_MODEL" },
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
      // baseUrl 제거 - pi-ai가 알아서 처리
    };
  }

  const customProvider = env.OBORA_LLM_PROVIDER;
  const customApiKey = env.OBORA_LLM_API_KEY;
  if (customProvider && customApiKey) {
    return {
      provider: customProvider,
      apiKey: customApiKey,
      model: env.OBORA_LLM_MODEL,
      // baseUrl 제거 - pi-ai가 알아서 처리
    };
  }

  return undefined;
}

export function resolveLLMConfig(explicit?: LLMConfig, config?: OboraConfig): LLMConfig | undefined {
  if (explicit) {
    return explicit;
  }

  if (config) {
    const fromConfig = resolveProviderConfig(config);
    if (fromConfig) {
      return fromConfig;
    }
  }

  return detectLLMConfigFromEnv();
}

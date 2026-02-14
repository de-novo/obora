import { FileAuthManager, getAuthToken, type ProviderAuth } from "../auth";
import { LLMAdapter } from "./adapter";
import { AnthropicAdapter } from "./anthropic-adapter";
import { MockLLMAdapter } from "./mock-adapter";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";
import { PiMonoAdapter, type PiMonoConfig } from "./pi-mono-adapter";
import { withRetry } from "./retry-handler";

export type LLMProvider = "pi-mono" | "openai" | "openai-codex" | "anthropic" | "google" | "zai";

type LLMAdapterConfigMap = {
  "pi-mono": PiMonoConfig;
  openai: { apiKey: string; baseUrl?: string; model?: string };
  anthropic: { apiKey: string; baseUrl?: string; model?: string };
  google: { apiKey: string; baseUrl?: string; model?: string };
  zai: { apiKey: string; baseUrl?: string; model?: string };
  "openai-codex": { apiKey: string; baseUrl?: string; model?: string };
};

interface ProviderDefinition<P extends LLMProvider> {
  envApiKey: string;
  envBaseUrl?: string;
  defaultBaseUrl: string;
  defaultModel: string;
  create(config: LLMAdapterConfigMap[P]): LLMAdapter;
}

const PROVIDER_REGISTRY: { [K in LLMProvider]: ProviderDefinition<K> } = {
  "pi-mono": {
    envApiKey: "PIMONO_API_KEY",
    envBaseUrl: "PIMONO_BASE_URL",
    defaultBaseUrl: "https://api.inflection.ai/v1",
    defaultModel: "pi-mono-1",
    create: (config) => new PiMonoAdapter(config as PiMonoConfig),
  },
  openai: {
    envApiKey: "OPENAI_API_KEY",
    envBaseUrl: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    create: (config) =>
      new OpenAICompatibleAdapter({
        provider: "openai",
        authToken: (config as { apiKey: string }).apiKey,
        baseUrl: (config as { baseUrl?: string }).baseUrl ?? "https://api.openai.com/v1",
        defaultModel: (config as { model?: string }).model ?? "gpt-4o-mini",
      }),
  },
  anthropic: {
    envApiKey: "ANTHROPIC_API_KEY",
    envBaseUrl: "ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-latest",
    create: (config) =>
      new AnthropicAdapter({
        apiKey: (config as { apiKey: string }).apiKey,
        baseUrl: (config as { baseUrl?: string }).baseUrl,
        defaultModel: (config as { model?: string }).model,
      }),
  },
  google: {
    envApiKey: "GOOGLE_API_KEY",
    envBaseUrl: "GOOGLE_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.0-flash",
    create: (config) =>
      new OpenAICompatibleAdapter({
        provider: "google",
        authToken: (config as { apiKey: string }).apiKey,
        baseUrl:
          (config as { baseUrl?: string }).baseUrl ??
          "https://generativelanguage.googleapis.com/v1beta/openai",
        defaultModel: (config as { model?: string }).model ?? "gemini-2.0-flash",
      }),
  },

  zai: {
    envApiKey: "ZAI_API_KEY",
    envBaseUrl: "ZAI_BASE_URL",
    defaultBaseUrl: "https://api.z.ai/v1",
    defaultModel: "glm-4",
    create: (config) =>
      new OpenAICompatibleAdapter({
        provider: "zai",
        authToken: (config as { apiKey: string }).apiKey,
        baseUrl: (config as { baseUrl?: string }).baseUrl ?? "https://api.z.ai/v1",
        defaultModel: (config as { model?: string }).model ?? "glm-4",
      }),
  },
  "openai-codex": {
    envApiKey: "OPENAI_CODEX_API_KEY",
    envBaseUrl: "OPENAI_CODEX_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.3-codex",
    create: (config) =>
      new OpenAICompatibleAdapter({
        provider: "openai",
        authToken: (config as { apiKey: string }).apiKey,
        baseUrl: (config as { baseUrl?: string }).baseUrl ?? "https://api.openai.com/v1",
        defaultModel: (config as { model?: string }).model ?? "gpt-5.3-codex",
      }),
  },
};

export function createLLMAdapter<P extends LLMProvider>(
  provider: P,
  config: LLMAdapterConfigMap[P]
): LLMAdapter {
  const def = PROVIDER_REGISTRY[provider];
  if (!def) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  return withRetry(def.create(config));
}

export async function createAdapter(
  provider: LLMProvider,
  options?: { model?: string; baseUrl?: string }
): Promise<LLMAdapter> {
  const authManager = new FileAuthManager();
  const storedAuth = await authManager.getProvider(provider);

  if (storedAuth) {
    return createAdapterFromAuth(provider, storedAuth, options);
  }

  return createAdapterFromEnv(provider, options);
}

export function createAdapterFromEnv(
  provider?: LLMProvider,
  options?: { model?: string; baseUrl?: string }
): LLMAdapter {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;

  const selectedProvider = provider ?? ((env?.OBORA_LLM_PROVIDER as LLMProvider | "mock") ?? "pi-mono");

  if (selectedProvider === "mock") {
    return new MockLLMAdapter();
  }

  const definition = PROVIDER_REGISTRY[selectedProvider];
  if (!definition) {
    throw new Error(`Unsupported LLM provider: ${selectedProvider}`);
  }

  const apiKey = env?.[definition.envApiKey];
  if (!apiKey) {
    const nodeEnv = env?.NODE_ENV ?? "development";
    if (nodeEnv === "production") {
      throw new Error(
        `${definition.envApiKey} environment variable is required in production. ` +
          "Set OBORA_LLM_PROVIDER=mock to use the mock adapter explicitly."
      );
    }

    console.warn(
      `[obora-agents] WARNING: ${definition.envApiKey} not set for provider ${selectedProvider}. ` +
        "Falling back to MockLLMAdapter."
    );
    return new MockLLMAdapter();
  }

  return createLLMAdapter(selectedProvider, {
    apiKey,
    baseUrl: options?.baseUrl ?? env?.[definition.envBaseUrl ?? ""] ?? definition.defaultBaseUrl,
    model: options?.model ?? definition.defaultModel,
  } as LLMAdapterConfigMap[typeof selectedProvider]);
}

function createAdapterFromAuth(
  provider: LLMProvider,
  auth: ProviderAuth,
  options?: { model?: string; baseUrl?: string }
): LLMAdapter {
  const definition = PROVIDER_REGISTRY[provider];
  const apiKey = getAuthToken(auth);

  return createLLMAdapter(provider, {
    apiKey,
    baseUrl: options?.baseUrl ?? auth.baseUrl ?? definition.defaultBaseUrl,
    model: options?.model ?? definition.defaultModel,
  } as LLMAdapterConfigMap[typeof provider]);
}

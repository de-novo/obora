import { type KnownProvider } from "@earendil-works/pi-ai";

import { FileAuthManager, getAuthToken, type OAuthAuth, type ProviderAuth } from "../auth";
import type { LLMAdapter } from "./adapter";
import { MockLLMAdapter } from "./mock-adapter";
import { PiAIAdapter } from "./pi-ai-adapter";
import { withRetry } from "./retry-handler";

type LLMAdapterConfig = {
  apiKey: string;
  baseUrl?: string;
  model?: string;
};

interface ProviderDefinition {
  envApiKey: string;
  envBaseUrl?: string;
  defaultBaseUrl: string;
  defaultModel: string;
  provider: KnownProvider;
}

const AUTH_PROVIDER_PRIORITY = ["anthropic", "openai", "openai-codex", "zai", "google"] as const;

function providerPriority(provider: string): number {
  const idx = AUTH_PROVIDER_PRIORITY.indexOf(provider as (typeof AUTH_PROVIDER_PRIORITY)[number]);
  return idx === -1 ? AUTH_PROVIDER_PRIORITY.length : idx;
}

export function pickPreferredProvider(providers: LLMProvider[]): LLMProvider | undefined {
  if (providers.length === 0) {
    return undefined;
  }

  return [...providers].sort((a, b) => {
    const pa = providerPriority(a);
    const pb = providerPriority(b);
    if (pa !== pb) {
      return pa - pb;
    }
    return a.localeCompare(b);
  })[0];
}

export function isSupportedProvider(provider: string): provider is LLMProvider {
  return provider in PROVIDER_DEFINITIONS;
}

export function getProviderDefaultModel(provider: string): string | undefined {
  return PROVIDER_DEFINITIONS[provider as LLMProvider]?.defaultModel;
}

const PROVIDER_DEFINITIONS = {
  "pi-mono": {
    envApiKey: "PIMONO_API_KEY",
    envBaseUrl: "PIMONO_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    provider: "openai",
  },
  openai: {
    envApiKey: "OPENAI_API_KEY",
    envBaseUrl: "OPENAI_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    provider: "openai",
  },
  "openai-codex": {
    envApiKey: "OPENAI_CODEX_API_KEY",
    envBaseUrl: "OPENAI_CODEX_BASE_URL",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.3-codex",
    provider: "openai-codex",
  },
  anthropic: {
    envApiKey: "ANTHROPIC_API_KEY",
    envBaseUrl: "ANTHROPIC_BASE_URL",
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-opus-4-1-20250805",
    provider: "anthropic",
  },
  google: {
    envApiKey: "GOOGLE_API_KEY",
    envBaseUrl: "GOOGLE_BASE_URL",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    provider: "google",
  },
  zai: {
    envApiKey: "ZAI_API_KEY",
    envBaseUrl: "ZAI_BASE_URL",
    defaultBaseUrl: "https://api.z.ai/api/coding/paas/v4",
    defaultModel: "glm-4.7",
    provider: "zai",
  },
  "amazon-bedrock": {
    envApiKey: "BEDROCK_API_KEY",
    defaultBaseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    defaultModel: "anthropic.claude-3-5-sonnet-20240620-v1:0",
    provider: "amazon-bedrock",
  },
  "google-gemini-cli": {
    envApiKey: "GOOGLE_GEMINI_CLI_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-pro",
    provider: "google",
  },
  "google-antigravity": {
    envApiKey: "GOOGLE_ANTIGRAVITY_API_KEY",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-2.5-pro",
    provider: "google",
  },
  "google-vertex": {
    envApiKey: "GOOGLE_VERTEX_API_KEY",
    defaultBaseUrl: "https://aiplatform.googleapis.com",
    defaultModel: "gemini-2.5-pro",
    provider: "google-vertex",
  },
  "azure-openai-responses": {
    envApiKey: "AZURE_OPENAI_API_KEY",
    envBaseUrl: "AZURE_OPENAI_BASE_URL",
    defaultBaseUrl: "https://example.openai.azure.com/openai/v1",
    defaultModel: "gpt-4.1-mini",
    provider: "azure-openai-responses",
  },
  "github-copilot": {
    envApiKey: "GITHUB_COPILOT_API_KEY",
    defaultBaseUrl: "https://api.githubcopilot.com",
    defaultModel: "gpt-4.1",
    provider: "github-copilot",
  },
  xai: {
    envApiKey: "XAI_API_KEY",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    provider: "xai",
  },
  groq: {
    envApiKey: "GROQ_API_KEY",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    provider: "groq",
  },
  cerebras: {
    envApiKey: "CEREBRAS_API_KEY",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    defaultModel: "llama-3.3-70b",
    provider: "cerebras",
  },
  openrouter: {
    envApiKey: "OPENROUTER_API_KEY",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    provider: "openrouter",
  },
  "vercel-ai-gateway": {
    envApiKey: "VERCEL_AI_GATEWAY_API_KEY",
    defaultBaseUrl: "https://ai-gateway.vercel.sh/v1",
    defaultModel: "openai/gpt-4o-mini",
    provider: "vercel-ai-gateway",
  },
  mistral: {
    envApiKey: "MISTRAL_API_KEY",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    provider: "mistral",
  },
  minimax: {
    envApiKey: "MINIMAX_API_KEY",
    defaultBaseUrl: "https://api.minimaxi.chat/v1",
    defaultModel: "minimax-m1",
    provider: "minimax",
  },
  "minimax-cn": {
    envApiKey: "MINIMAX_CN_API_KEY",
    defaultBaseUrl: "https://api.minimax.chat/v1",
    defaultModel: "minimax-m1",
    provider: "minimax-cn",
  },
  huggingface: {
    envApiKey: "HUGGINGFACE_API_KEY",
    defaultBaseUrl: "https://router.huggingface.co/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct",
    provider: "huggingface",
  },
  opencode: {
    envApiKey: "OPENCODE_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    provider: "opencode",
  },
  "opencode-go": {
    envApiKey: "OPENCODE_GO_API_KEY",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    provider: "opencode",
  },
  "kimi-coding": {
    envApiKey: "KIMI_CODING_API_KEY",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "kimi-k2-0905-preview",
    provider: "kimi-coding",
  },
} satisfies Record<string, ProviderDefinition>;

export type LLMProvider = keyof typeof PROVIDER_DEFINITIONS;

export function createLLMAdapter(provider: LLMProvider, config: LLMAdapterConfig): LLMAdapter {
  const definition = PROVIDER_DEFINITIONS[provider];
  if (!definition) {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }

  // baseUrl을 전달하지 않음 - pi-ai가 알아서 매핑함 (getModel에서 자동 처리)
  return withRetry(
    new PiAIAdapter({
      provider: definition.provider,
      apiKey: config.apiKey,
      model: config.model ?? definition.defaultModel,
      adapterId: provider,
    }),
    { maxRetries: 0 }
  );
}

export async function createAdapter(
  provider: LLMProvider,
  options?: { model?: string; baseUrl?: string }
): Promise<LLMAdapter> {
  const authManager = new FileAuthManager();
  const storedAuth = await authManager.getProvider(provider);

  if (storedAuth) {
    return createAdapterFromAuth(provider, storedAuth, options, authManager);
  }

  if (hasEnvApiKey(provider)) {
    return createAdapterFromEnv(provider, options);
  }

  const providers = await authManager.listProviders();
  const fallbackProvider = pickPreferredProvider(
    providers
      .map((item) => item.provider)
      .filter((name): name is LLMProvider => name !== provider && name in PROVIDER_DEFINITIONS)
  );

  if (fallbackProvider) {
    const fallbackAuth = await authManager.getProvider(fallbackProvider);
    if (fallbackAuth) {
      console.warn(
        `[obora-agents] WARNING: auth not found for provider '${provider}'. ` +
          `Falling back to authenticated provider '${fallbackProvider}'.`
      );
      return createAdapterFromAuth(fallbackProvider, fallbackAuth, options, authManager);
    }
  }

  return createAdapterFromEnv(provider, options);
}

function hasEnvApiKey(provider: LLMProvider): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  const definition = PROVIDER_DEFINITIONS[provider];
  return Boolean(env?.[definition.envApiKey]);
}

export function createAdapterFromEnv(
  provider?: LLMProvider,
  options?: { model?: string; baseUrl?: string }
): LLMAdapter {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;

  const selectedProvider = provider ?? ((env?.OBORA_LLM_PROVIDER as LLMProvider | "mock") ?? "openai");

  if (selectedProvider === "mock") {
    return new MockLLMAdapter();
  }

  const definition = PROVIDER_DEFINITIONS[selectedProvider];
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
    baseUrl:
      options?.baseUrl ??
      (("envBaseUrl" in definition && definition.envBaseUrl) ? env?.[definition.envBaseUrl] : undefined),
    model: options?.model ?? definition.defaultModel,
  });
}

async function createAdapterFromAuth(
  provider: LLMProvider,
  auth: ProviderAuth,
  options: { model?: string; baseUrl?: string } | undefined,
  authManager: FileAuthManager
): Promise<LLMAdapter> {
  const definition = PROVIDER_DEFINITIONS[provider];
  const apiKey = await resolveApiKey(provider, auth, authManager);

  return createLLMAdapter(provider, {
    apiKey,
    baseUrl: options?.baseUrl ?? auth.baseUrl,
    model: options?.model ?? definition.defaultModel,
  });
}

async function resolveApiKey(
  provider: LLMProvider,
  auth: ProviderAuth,
  authManager: FileAuthManager
): Promise<string> {
  if (auth.type !== "oauth") {
    return getAuthToken(auth);
  }

  const normalizedProvider = PROVIDER_DEFINITIONS[provider]?.provider ?? provider;
  const oauthCredentials = toOAuthCredentials(auth);

  const oauthModule = (await import("@earendil-works/pi-ai/oauth")) as {
    getOAuthApiKey?: (
      provider: string,
      credentials: Record<string, OAuthCredentials>
    ) => Promise<
      | {
          apiKey: string;
          newCredentials: { access: string; refresh?: string; expires: number };
        }
      | undefined
    >;
  };

  const resolved = await oauthModule.getOAuthApiKey?.(normalizedProvider, {
    [normalizedProvider]: oauthCredentials,
  });

  if (!resolved) {
    return auth.accessToken;
  }

  await authManager.addProvider(provider, {
    ...auth,
    accessToken: resolved.newCredentials.access,
    refreshToken: typeof resolved.newCredentials.refresh === "string"
      ? resolved.newCredentials.refresh
      : auth.refreshToken,
    expiresAt: new Date(resolved.newCredentials.expires * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  });

  return resolved.apiKey;
}

type OAuthCredentials = { access: string; refresh: string; expires: number };

function toOAuthCredentials(auth: OAuthAuth): OAuthCredentials {
  const expires = auth.expiresAt ? Math.floor(Date.parse(auth.expiresAt) / 1000) : Date.now() / 1000;
  return {
    access: auth.accessToken,
    refresh: auth.refreshToken ?? "",
    expires,
  };
}

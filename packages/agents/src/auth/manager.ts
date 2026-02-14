import { AuthStoreRepository } from "./store";
import type { AuthManager, ProviderAuth } from "./types";

const TEST_ENDPOINTS: Record<string, { path: string; header: "authorization" | "x-api-key" }> = {
  "pi-mono": { path: "/models", header: "authorization" },
  openai: { path: "/models", header: "authorization" },
  google: { path: "/models", header: "authorization" },
  anthropic: { path: "/models", header: "x-api-key" },
};

const DEFAULT_BASE_URLS: Record<string, string> = {
  "pi-mono": "https://api.inflection.ai/v1",
  openai: "https://api.openai.com/v1",
  google: "https://generativelanguage.googleapis.com/v1beta/openai",
  anthropic: "https://api.anthropic.com/v1",
};

export class FileAuthManager implements AuthManager {
  constructor(private readonly repository = new AuthStoreRepository()) {}

  async addProvider(provider: string, auth: ProviderAuth): Promise<void> {
    assertProviderAuth(provider, auth);
    await this.repository.upsert(provider, auth);
  }

  async getProvider(provider: string): Promise<ProviderAuth | undefined> {
    const store = await this.repository.load();
    return store.providers[provider];
  }

  async listProviders(): Promise<ProviderAuth[]> {
    const store = await this.repository.load();
    return Object.values(store.providers);
  }

  async removeProvider(provider: string): Promise<void> {
    await this.repository.remove(provider);
  }

  async testConnection(provider: string): Promise<boolean> {
    const auth = await this.getProvider(provider);
    if (!auth) return false;

    const endpoint = TEST_ENDPOINTS[provider];
    if (!endpoint) {
      throw new Error(`Unsupported provider for testConnection: ${provider}`);
    }

    const token = getAuthToken(auth);
    const baseUrl = auth.baseUrl ?? DEFAULT_BASE_URLS[provider];
    const headers: Record<string, string> = endpoint.header === "x-api-key"
      ? { "x-api-key": token, "anthropic-version": "2023-06-01" }
      : { Authorization: `Bearer ${token}` };

    const response = await fetch(`${baseUrl}${endpoint.path}`, { headers });
    return response.ok;
  }
}

export function getAuthToken(auth: ProviderAuth): string {
  switch (auth.type) {
    case "apiKey":
      return auth.apiKey;
    case "token":
      return auth.token;
    case "oauth":
      return auth.accessToken;
  }
}

function assertProviderAuth(provider: string, auth: ProviderAuth): void {
  if (provider !== auth.provider) {
    throw new Error(`Provider mismatch: expected ${provider}, got ${auth.provider}`);
  }

  if (auth.type === "apiKey" && !auth.apiKey) {
    throw new Error("apiKey auth requires apiKey");
  }
  if (auth.type === "token" && !auth.token) {
    throw new Error("token auth requires token");
  }
  if (auth.type === "oauth" && !auth.accessToken) {
    throw new Error("oauth auth requires accessToken");
  }
}

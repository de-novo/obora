export type AuthType = "apiKey" | "token" | "oauth";

export interface ProviderAuthBase {
  provider: string;
  type: AuthType;
  baseUrl?: string;
  addedAt: string;
  updatedAt: string;
}

export interface ApiKeyAuth extends ProviderAuthBase {
  type: "apiKey";
  apiKey: string;
}

export interface TokenAuth extends ProviderAuthBase {
  type: "token";
  token: string;
}

export interface OAuthAuth extends ProviderAuthBase {
  type: "oauth";
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}

export type ProviderAuth = ApiKeyAuth | TokenAuth | OAuthAuth;

export interface AuthStore {
  version: number;
  providers: Record<string, ProviderAuth>;
}

export interface AuthManager {
  addProvider(provider: string, auth: ProviderAuth): Promise<void>;
  getProvider(provider: string): Promise<ProviderAuth | undefined>;
  listProviders(): Promise<ProviderAuth[]>;
  removeProvider(provider: string): Promise<void>;
  testConnection(provider: string): Promise<boolean>;
}

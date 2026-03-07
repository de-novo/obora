import {
  FileAuthManager,
  maskProviderAuth,
  type AuthType,
  type ProviderAuth,
} from "@obora/adapters";
import { Command } from "commander";

interface AddOptions {
  type?: AuthType;
  apiKey?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  baseUrl?: string;
}

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage global LLM provider authentication");

  auth
    .command("add <provider>")
    .description("Add or update provider authentication")
    .option("-t, --type <type>", "Auth type: apiKey | token | oauth")
    .option("--apiKey <value>", "API key value")
    .option("--token <value>", "Token value")
    .option("--accessToken <value>", "OAuth access token")
    .option("--refreshToken <value>", "OAuth refresh token")
    .option("--expiresAt <value>", "OAuth expiration (ISO-8601)")
    .option("--scope <value>", "OAuth scopes")
    .option("--baseUrl <value>", "Override provider base URL")
    .action(async (provider: string, options: AddOptions) => {
      const manager = new FileAuthManager();
      const authValue = buildProviderAuth(provider, options);
      await manager.addProvider(provider, authValue);
      console.log(`✓ Saved auth for provider: ${provider}`);
    });

  auth
    .command("list")
    .description("List registered provider auth entries")
    .action(async () => {
      const manager = new FileAuthManager();
      const list = await manager.listProviders();
      if (list.length === 0) {
        console.log("No provider auth entries found.");
        return;
      }

      for (const item of list) {
        console.log(JSON.stringify(maskProviderAuth(item), null, 2));
      }
    });

  auth
    .command("remove <provider>")
    .description("Remove provider authentication")
    .action(async (provider: string) => {
      const manager = new FileAuthManager();
      await manager.removeProvider(provider);
      console.log(`✓ Removed auth for provider: ${provider}`);
    });

  auth
    .command("test <provider>")
    .description("Test provider authentication by calling provider API")
    .action(async (provider: string) => {
      const manager = new FileAuthManager();
      const ok = await manager.testConnection(provider);
      if (!ok) {
        console.error(`✗ Auth test failed for provider: ${provider}`);
        process.exitCode = 1;
        return;
      }
      console.log(`✓ Auth test passed for provider: ${provider}`);
    });

  return auth;
}

function inferAuthType(provider: string, options: AddOptions): AuthType {
  void provider;
  if (options.type) return options.type as AuthType;

  // OAuth explicit fields
  if (options.accessToken) return "oauth";

  // Anthropic OAT token detection
  const value = options.apiKey || options.token || "";
  if (value.startsWith("sk-ant-oat")) return "token";

  // Default
  if (options.token) return "token";
  return "apiKey";
}

function buildProviderAuth(provider: string, options: AddOptions): ProviderAuth {
  const now = new Date().toISOString();
  const type = inferAuthType(provider, options);

  if (type === "apiKey") {
    if (!options.apiKey) {
      throw new Error("--apiKey is required when --type=apiKey");
    }
    return {
      provider,
      type,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl,
      addedAt: now,
      updatedAt: now,
    };
  }

  if (type === "token") {
    const token = options.token ?? options.apiKey;
    if (!token) {
      throw new Error("--token is required when --type=token");
    }
    return {
      provider,
      type,
      token,
      baseUrl: options.baseUrl,
      addedAt: now,
      updatedAt: now,
    };
  }

  if (!options.accessToken) {
    throw new Error("--accessToken is required when --type=oauth");
  }

  return {
    provider,
    type: "oauth",
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    expiresAt: options.expiresAt,
    scope: options.scope,
    baseUrl: options.baseUrl,
    addedAt: now,
    updatedAt: now,
  };
}

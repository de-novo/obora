import {
  FileAuthManager,
  getDefaultAuthFilePath,
  maskProviderAuth,
  type AuthType,
  type ProviderAuth,
} from "@obora/adapters";
import { Command } from "commander";

import { CLIError } from "../utils/cli-error.js";
import { handleCommandAction } from "../utils/error-handler.js";
import { ExitCode } from "../utils/exit-codes.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts, type GlobalOptions } from "../utils/global-opts.js";

interface AuthCommandOptions {
  json?: boolean;
}

interface AddOptions extends AuthCommandOptions {
  type?: string;
  apiKey?: string;
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
  baseUrl?: string;
}

const AUTH_TYPES: AuthType[] = ["apiKey", "token", "oauth"];

function shouldOutputJson(localJson: boolean | undefined, globalOpts: GlobalOptions): boolean {
  return Boolean(localJson || globalOpts.json);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseAuthType(type: string | undefined): AuthType | undefined {
  if (type === undefined) {
    return undefined;
  }

  if (AUTH_TYPES.includes(type as AuthType)) {
    return type as AuthType;
  }

  throw new CLIError(
    `Invalid auth type: ${type}. Supported types: ${AUTH_TYPES.join(", ")}`,
    ExitCode.VALIDATION_ERROR
  );
}

function inferAuthType(provider: string, options: AddOptions): AuthType {
  void provider;

  const explicitType = parseAuthType(options.type);
  if (explicitType) {
    return explicitType;
  }

  if (options.accessToken) {
    return "oauth";
  }

  const value = options.apiKey || options.token || "";
  if (value.startsWith("sk-ant-oat")) {
    return "token";
  }

  if (options.token) {
    return "token";
  }

  return "apiKey";
}

function buildProviderAuth(provider: string, options: AddOptions): ProviderAuth {
  const now = new Date().toISOString();
  const type = inferAuthType(provider, options);

  if (type === "apiKey") {
    if (!options.apiKey) {
      throw new CLIError("--apiKey is required when --type=apiKey", ExitCode.VALIDATION_ERROR);
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
      throw new CLIError("--token is required when --type=token", ExitCode.VALIDATION_ERROR);
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
    throw new CLIError("--accessToken is required when --type=oauth", ExitCode.VALIDATION_ERROR);
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

function maskAuth(auth: ProviderAuth): Record<string, unknown> {
  return maskProviderAuth(auth);
}

function getCredentialPreview(auth: ProviderAuth): string {
  const masked = maskAuth(auth);
  const value =
    masked.apiKey ??
    masked.token ??
    masked.accessToken ??
    masked.refreshToken ??
    masked.scope ??
    "-";

  return String(value);
}

function buildListRow(auth: ProviderAuth): Record<string, unknown> {
  return {
    provider: auth.provider,
    type: auth.type,
    credential: getCredentialPreview(auth),
    baseUrl: auth.baseUrl ?? "-",
    updatedAt: auth.updatedAt,
  };
}

async function loadStoredProviderAuth(
  manager: FileAuthManager,
  provider: string
): Promise<ProviderAuth | undefined> {
  try {
    return await manager.getProvider(provider);
  } catch (error) {
    throw new CLIError(
      `Failed to load provider auth store: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

async function listStoredProviderAuth(manager: FileAuthManager): Promise<ProviderAuth[]> {
  try {
    return await manager.listProviders();
  } catch (error) {
    throw new CLIError(
      `Failed to load provider auth store: ${getErrorMessage(error)}`,
      ExitCode.EXECUTION_FAILED
    );
  }
}

export function createAuthCommand(): Command {
  const auth = new Command("auth").description("Manage global LLM provider authentication");

  auth
    .command("add <provider>")
    .description("Add or update provider authentication")
    .option("--json", "Output as JSON")
    .option("-t, --type <type>", "Auth type: apiKey | token | oauth")
    .option("--apiKey <value>", "API key value")
    .option("--token <value>", "Token value")
    .option("--accessToken <value>", "OAuth access token")
    .option("--refreshToken <value>", "OAuth refresh token")
    .option("--expiresAt <value>", "OAuth expiration (ISO-8601)")
    .option("--scope <value>", "OAuth scopes")
    .option("--baseUrl <value>", "Override provider base URL")
    .action(async function (this: Command, provider: string, options: AddOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const manager = new FileAuthManager();
          const authValue = buildProviderAuth(provider, options);

          try {
            await manager.addProvider(provider, authValue);
          } catch (error) {
            throw new CLIError(
              `Failed to save provider auth: ${getErrorMessage(error)}`,
              ExitCode.EXECUTION_FAILED
            );
          }

          const payload = {
            command: "auth add",
            provider,
            saved: true,
            storePath: getDefaultAuthFilePath(),
            auth: maskAuth(authValue),
          };

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json(payload);
            return;
          }

          if (!globalOpts.quiet) {
            formatter.success(`Saved auth for provider: ${provider}`);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  auth
    .command("list")
    .description("List registered provider auth entries")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, options: AuthCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const manager = new FileAuthManager();
          const providers = (await listStoredProviderAuth(manager)).sort((left, right) =>
            left.provider.localeCompare(right.provider)
          );
          const maskedProviders = providers.map(maskAuth);

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({
              command: "auth list",
              storePath: getDefaultAuthFilePath(),
              providers: maskedProviders,
            });
            return;
          }

          if (providers.length === 0) {
            if (!globalOpts.quiet) {
              formatter.info("No provider auth entries found.");
            }
            return;
          }

          if (!globalOpts.quiet) {
            formatter.table(providers.map(buildListRow));
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  auth
    .command("remove <provider>")
    .description("Remove provider authentication")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, provider: string, options: AuthCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const manager = new FileAuthManager();
          const existing = await loadStoredProviderAuth(manager, provider);
          if (!existing) {
            throw new CLIError(`Provider auth not found: ${provider}`, ExitCode.VALIDATION_ERROR);
          }

          try {
            await manager.removeProvider(provider);
          } catch (error) {
            throw new CLIError(
              `Failed to remove provider auth: ${getErrorMessage(error)}`,
              ExitCode.EXECUTION_FAILED
            );
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({
              command: "auth remove",
              provider,
              removed: true,
              storePath: getDefaultAuthFilePath(),
            });
            return;
          }

          if (!globalOpts.quiet) {
            formatter.success(`Removed auth for provider: ${provider}`);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  auth
    .command("test <provider>")
    .description("Test provider authentication by calling provider API")
    .option("--json", "Output as JSON")
    .action(async function (this: Command, provider: string, options: AuthCommandOptions = {}) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          const manager = new FileAuthManager();
          const existing = await loadStoredProviderAuth(manager, provider);
          if (!existing) {
            throw new CLIError(`Provider auth not found: ${provider}`, ExitCode.VALIDATION_ERROR);
          }

          const ok = await (async () => {
            try {
              return await manager.testConnection(provider);
            } catch (error) {
              const message = getErrorMessage(error);
              if (message.includes("Unsupported provider for testConnection")) {
                throw new CLIError(
                  `Unsupported provider auth test target: ${provider}`,
                  ExitCode.VALIDATION_ERROR
                );
              }

              throw new CLIError(
                `Failed to test provider auth: ${message}`,
                ExitCode.EXECUTION_FAILED
              );
            }
          })();

          if (!ok) {
            throw new CLIError(
              `Auth test failed for provider: ${provider}`,
              ExitCode.EXECUTION_FAILED
            );
          }

          if (shouldOutputJson(options.json, globalOpts)) {
            formatter.json({
              command: "auth test",
              provider,
              ok: true,
              storePath: getDefaultAuthFilePath(),
              auth: maskAuth(existing),
            });
            return;
          }

          if (!globalOpts.quiet) {
            formatter.success(`Auth test passed for provider: ${provider}`);
          }
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });

  return auth;
}

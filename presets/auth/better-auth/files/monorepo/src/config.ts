import type { AuthConfig, AuthEnvConfig } from "./types";

/**
 * Default authentication configuration
 */
export const defaultAuthConfig: AuthConfig = {
  basePath: "/auth",
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
};

/**
 * Create auth configuration by merging with defaults
 */
export function createAuthConfig(overrides: Partial<AuthConfig> = {}): AuthConfig {
  return {
    ...defaultAuthConfig,
    ...overrides,
    session: {
      ...defaultAuthConfig.session,
      ...overrides.session,
    },
    emailAndPassword: {
      ...defaultAuthConfig.emailAndPassword,
      ...overrides.emailAndPassword,
    },
  };
}

/**
 * Validate required environment variables
 */
export function validateAuthEnv(env: Partial<AuthEnvConfig> = {}): AuthEnvConfig {
  const databaseUrl = env.databaseUrl || process.env.DATABASE_URL;
  const authUrl = env.authUrl || process.env.BETTER_AUTH_URL;
  const webUrl = env.webUrl || process.env.WEB_URL;
  const secret = env.secret || process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL environment variable is required. " +
        "Please check your .env file."
    );
  }

  if (!authUrl && process.env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_URL environment variable is required in production."
    );
  }

  return {
    databaseUrl,
    authUrl: authUrl || "http://localhost:3001",
    webUrl: webUrl || "http://localhost:3000",
    secret,
  };
}

/**
 * Get trusted origins for CORS
 */
export function getTrustedOrigins(config: AuthEnvConfig): string[] {
  const origins: string[] = [config.authUrl];

  if (config.webUrl) {
    origins.push(config.webUrl);
  }

  return origins;
}

/**
 * Session cookie name used by Better Auth
 */
export const SESSION_COOKIE_NAME = "better-auth.session_token";

/**
 * API paths for Better Auth
 */
export const AUTH_PATHS = {
  signIn: "/sign-in/email",
  signUp: "/sign-up/email",
  signOut: "/sign-out",
  session: "/session",
  verifyEmail: "/verify-email",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
} as const;

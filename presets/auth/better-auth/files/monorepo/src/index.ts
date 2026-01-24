// Types
export type {
  AuthUser,
  SessionInfo,
  Session,
  SignUpRequest,
  SignInRequest,
  AuthResult,
  AuthConfig,
  AuthEnvConfig,
} from "./types";

// Configuration
export {
  defaultAuthConfig,
  createAuthConfig,
  validateAuthEnv,
  getTrustedOrigins,
  SESSION_COOKIE_NAME,
  AUTH_PATHS,
} from "./config";

// Utilities
export {
  isSessionValid,
  isEmailVerified,
  getUserDisplayName,
  getUserInitials,
  authSuccess,
  authError,
  parseSessionCookie,
  isValidEmail,
  isStrongPassword,
  formatSessionExpiry,
} from "./utils";

// Re-export better-auth core types
export type { BetterAuthOptions } from "better-auth";

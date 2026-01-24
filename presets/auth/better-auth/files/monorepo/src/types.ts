/**
 * Base user type from Better Auth
 */
export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Session info from Better Auth
 */
export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: Date;
  token?: string;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Complete session type
 */
export interface Session {
  user: AuthUser;
  session: SessionInfo;
}

/**
 * Sign up request
 */
export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * Sign in request
 */
export interface SignInRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
}

/**
 * Auth result type
 */
export type AuthResult<T = Session> =
  | { success: true; data: T }
  | { success: false; error: string };

/**
 * Better Auth configuration options
 */
export interface AuthConfig {
  basePath?: string;
  session?: {
    expiresIn?: number;
    updateAge?: number;
  };
  emailAndPassword?: {
    enabled?: boolean;
    requireEmailVerification?: boolean;
  };
  trustedOrigins?: string[];
}

/**
 * Environment configuration
 */
export interface AuthEnvConfig {
  databaseUrl: string;
  authUrl: string;
  webUrl?: string;
  secret?: string;
}

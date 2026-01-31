/**
 * Authentication Types
 *
 * Standard authentication types used across Obora presets.
 */

/**
 * Base user entity
 */
export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  createdAt: Date;
}

/**
 * User session information
 */
export interface Session {
  id: string;
  userId: string;
  expiresAt: Date;
  token?: string;
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  secretKey: string;
  baseUrl?: string;
  apiUrl?: string;
  issuer?: string;
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
 * Sign up request
 */
export interface SignUpRequest {
  email: string;
  password: string;
  name?: string;
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: AuthUser;
  error?: string;
}

import type { AuthUser, Session, AuthResult } from "./types";
import { SESSION_COOKIE_NAME } from "./config";

/**
 * Check if a session is valid (not expired)
 */
export function isSessionValid(session: Session | null): boolean {
  if (!session?.session) return false;
  return new Date(session.session.expiresAt) > new Date();
}

/**
 * Check if a user has a verified email
 */
export function isEmailVerified(user: AuthUser | null): boolean {
  return user?.emailVerified === true;
}

/**
 * Get user display name
 */
export function getUserDisplayName(user: AuthUser): string {
  return user.name || user.email.split("@")[0];
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(user: AuthUser): string {
  const name = getUserDisplayName(user);
  const parts = name.split(" ");
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

/**
 * Create a success result
 */
export function authSuccess<T>(data: T): AuthResult<T> {
  return { success: true, data };
}

/**
 * Create an error result
 */
export function authError(error: string): AuthResult<never> {
  return { success: false, error };
}

/**
 * Parse session cookie from cookie string
 */
export function parseSessionCookie(cookieString: string): string | null {
  const cookies = cookieString.split(";").map((c) => c.trim());
  const sessionCookie = cookies.find((c) =>
    c.startsWith(`${SESSION_COOKIE_NAME}=`)
  );
  return sessionCookie ? sessionCookie.split("=")[1] : null;
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength
 */
export function isStrongPassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Format session expiry for display
 */
export function formatSessionExpiry(expiresAt: Date): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) {
    return `${days} day${days > 1 ? "s" : ""} remaining`;
  }
  if (hours > 0) {
    return `${hours} hour${hours > 1 ? "s" : ""} remaining`;
  }
  return "Expires soon";
}

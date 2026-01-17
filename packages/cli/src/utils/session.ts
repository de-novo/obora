/**
 * Session Management Utilities
 *
 * CLI-specific environment setup for obora sessions
 */

let originalOboraSession: string | undefined;

/**
 * Set OBORA_SESSION environment variable
 * Preserves original value for restoration
 */
export function setOboraSession(): void {
  if (originalOboraSession === undefined) {
    originalOboraSession = process.env.OBORA_SESSION;
  }
  process.env.OBORA_SESSION = "true";
}

/**
 * Restore original OBORA_SESSION value
 */
export function restoreOboraSession(): void {
  if (originalOboraSession === undefined) {
    delete process.env.OBORA_SESSION;
  } else {
    process.env.OBORA_SESSION = originalOboraSession;
  }
}

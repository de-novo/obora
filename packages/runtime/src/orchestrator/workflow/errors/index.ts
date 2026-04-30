/**
 * Error codes and classes for obora-kit
 * @module @obora/core/errors
 */

/**
 * Error codes mapping
 * Reference: docs/spec/10-error-codes.md
 */
export const ErrorCodes = {
  // General errors (E1xxx)
  E1001: "Unknown error",
  E1002: "Configuration not found",
  E1003: "Permission denied",

  // YAML/Parse errors (E2xxx)
  E2001: "Invalid YAML syntax",
  E2002: "Missing required field",
  E2003: "Invalid field type",
  E2004: "Unknown field",
  E2005: "Invalid duration format",
  E2006: "Duplicate step name",

  // Dependency errors (E3xxx)
  E3001: "Circular dependency detected",
  E3002: "Missing dependency",
  E3003: "Self dependency",
  E3004: "Unresolved input file",

  // Runtime errors (E4xxx)
  E4001: "Step execution failed",
  E4002: "Timeout exceeded",
  E4003: "Agent not found",
  E4004: "Lock acquisition failed",
  E4005: "Step failed after retries exhausted",
  E4006: "Spec validation failed",
  E4007: "Context assembly failed",

  // Agent errors (E6xxx)
  E6003: "OpenClaw connection failed",
} as const;

export type ErrorCode = keyof typeof ErrorCodes;

/**
 * Base error class for obora-kit
 */
export class OboraError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    const baseMessage = ErrorCodes[code];
    const fullMessage = message
      ? `${code}: ${baseMessage} - ${message}`
      : `${code}: ${baseMessage}`;
    super(fullMessage);
    this.name = "OboraError";
    this.code = code;
    this.details = details;
  }
}

/**
 * YAML parsing error
 */
export class ParseError extends OboraError {
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "ParseError";
  }
}

/**
 * Dependency resolution error
 */
export class DependencyError extends OboraError {
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>) {
    super(code, message, details);
    this.name = "DependencyError";
  }
}

/**
 * Structured Error Handling System
 *
 * Provides consistent, actionable error messages with:
 * - Error codes for reference
 * - Contextual information
 * - Suggested fixes
 * - Help links
 */

import consola from "consola";

// ============================================================================
// Error Codes
// ============================================================================

export const ErrorCode = {
  // Config errors (E1xx)
  CONFIG_NOT_FOUND: "E101",
  CONFIG_INVALID: "E102",
  CONFIG_PARSE_ERROR: "E103",

  // Preset errors (E2xx)
  PRESET_NOT_FOUND: "E201",
  PRESET_CONFLICT: "E202",
  PRESET_INVALID_MANIFEST: "E203",
  PRESET_NO_TARGETS: "E204",
  PRESET_INCOMPATIBLE: "E205",

  // Transform errors (E3xx)
  TRANSFORM_FAILED: "E301",
  TRANSFORM_FILE_NOT_FOUND: "E302",
  TRANSFORM_PARSE_ERROR: "E303",
  TRANSFORM_IMPORT_FAILED: "E304",
  TRANSFORM_PROVIDER_WRAP_FAILED: "E305",
  TRANSFORM_LAYOUT_COMPONENT_FAILED: "E306",
  TRANSFORM_NESTJS_MODULE_FAILED: "E307",
  TRANSFORM_MARKER_NOT_FOUND: "E308",
  TRANSFORM_PATTERN_NOT_FOUND: "E309",
  TRANSFORM_DUPLICATE_DETECTED: "E310",

  // Dependency errors (E4xx)
  DEP_INSTALL_FAILED: "E401",
  DEP_CONFLICT: "E402",
  DEP_VERSION_MISMATCH: "E403",

  // File system errors (E5xx)
  FS_READ_ERROR: "E501",
  FS_WRITE_ERROR: "E502",
  FS_NOT_FOUND: "E503",
  FS_PERMISSION_DENIED: "E504",

  // Project errors (E6xx)
  PROJECT_NOT_INITIALIZED: "E601",
  PROJECT_ALREADY_INITIALIZED: "E602",
  PROJECT_INVALID_STRUCTURE: "E603",

  // Network errors (E7xx)
  NETWORK_ERROR: "E701",
  NETWORK_TIMEOUT: "E702",

  // Validation errors (E8xx)
  INVALID_ARGUMENT: "E801",
  MISSING_REQUIRED: "E802",
  VALIDATION_FAILED: "E803",

  // General errors (E9xx)
  OPERATION_FAILED: "E901",
  UNKNOWN_ERROR: "E999",
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================================
// Error Context Interface
// ============================================================================

export interface ErrorContext {
  /** Error code for reference */
  code: ErrorCodeType;
  /** Human-readable error message */
  message: string;
  /** Additional context details */
  details?: Record<string, unknown>;
  /** Suggested fixes */
  suggestions?: string[];
  /** Help URL */
  helpUrl?: string;
  /** Related files or resources */
  related?: string[];
}

// ============================================================================
// CLI Error Class
// ============================================================================

export class CLIError extends Error {
  public readonly code: ErrorCodeType;
  public readonly details?: Record<string, unknown>;
  public readonly suggestions?: string[];
  public readonly helpUrl?: string;
  public readonly related?: string[];

  constructor(context: ErrorContext) {
    super(context.message);
    this.name = "CLIError";
    this.code = context.code;
    this.details = context.details;
    this.suggestions = context.suggestions;
    this.helpUrl = context.helpUrl;
    this.related = context.related;
  }

  /**
   * Format error for console output
   */
  format(): string {
    const lines: string[] = [];

    // Error header with code
    lines.push(`[${this.code}] ${this.message}`);

    // Details
    if (this.details && Object.keys(this.details).length > 0) {
      lines.push("");
      lines.push("Details:");
      for (const [key, value] of Object.entries(this.details)) {
        const displayValue =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        lines.push(`  ${key}: ${displayValue}`);
      }
    }

    // Suggestions
    if (this.suggestions && this.suggestions.length > 0) {
      lines.push("");
      lines.push("Suggestions:");
      for (const suggestion of this.suggestions) {
        lines.push(`  → ${suggestion}`);
      }
    }

    // Related files
    if (this.related && this.related.length > 0) {
      lines.push("");
      lines.push("Related:");
      for (const item of this.related) {
        lines.push(`  - ${item}`);
      }
    }

    // Help URL
    if (this.helpUrl) {
      lines.push("");
      lines.push(`Help: ${this.helpUrl}`);
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Error Display Function
// ============================================================================

/**
 * Display a structured error to the console
 */
export function showError(error: CLIError | ErrorContext): void {
  const ctx = error instanceof CLIError ? error : new CLIError(error);
  consola.error(ctx.format());
}

/**
 * Display a warning with context
 */
export function showWarning(
  message: string,
  options?: {
    details?: Record<string, unknown>;
    suggestions?: string[];
  }
): void {
  let output = message;

  if (options?.details && Object.keys(options.details).length > 0) {
    output += "\n  Details:";
    for (const [key, value] of Object.entries(options.details)) {
      output += `\n    ${key}: ${value}`;
    }
  }

  if (options?.suggestions && options.suggestions.length > 0) {
    output += "\n  Suggestions:";
    for (const suggestion of options.suggestions) {
      output += `\n    → ${suggestion}`;
    }
  }

  consola.warn(output);
}

// ============================================================================
// Transform Error Context Types
// ============================================================================

export type TransformErrorType =
  | "import"
  | "export"
  | "dependency"
  | "provider-wrap"
  | "layout-component"
  | "nestjs-module"
  | "marker"
  | "json-property"
  | "config"
  | "script"
  | "env";

export interface TransformErrorContext {
  type: TransformErrorType;
  target: string;
  content?: string;
  reason?: string;
  expected?: string;
}

/**
 * Create a CLIError from transform context
 */
export function createTransformError(ctx: TransformErrorContext): CLIError {
  switch (ctx.type) {
    case "import":
      return Errors.transformImportFailed(ctx.target, ctx.content || "", ctx.reason);
    case "provider-wrap":
      return Errors.transformProviderWrapFailed(ctx.target, ctx.content || "", ctx.reason);
    case "layout-component":
      return Errors.transformLayoutComponentFailed(ctx.target, ctx.content || "", ctx.reason);
    case "nestjs-module":
      return Errors.transformNestJsModuleFailed(ctx.target, ctx.content || "", ctx.reason);
    case "marker":
      return Errors.transformMarkerNotFound(ctx.target, ctx.content || "");
    default:
      return Errors.transformFailed(ctx.target, ctx.type, ctx.reason);
  }
}

/**
 * Format a transform error message with suggestions for console output
 * Returns a structured error string that includes actionable guidance
 */
export function formatTransformError(
  ctx: TransformErrorContext,
  verbose = false
): string {
  const error = createTransformError(ctx);
  return error.format();
}

// ============================================================================
// Error Factory Functions
// ============================================================================

export const Errors = {
  // Config errors
  configNotFound: (path?: string): CLIError =>
    new CLIError({
      code: ErrorCode.CONFIG_NOT_FOUND,
      message: "Configuration file not found",
      details: path ? { path } : undefined,
      suggestions: [
        "Run 'obora init' to initialize the project",
        "Check if you're in the correct directory",
      ],
    }),

  configInvalid: (path: string, reason?: string): CLIError =>
    new CLIError({
      code: ErrorCode.CONFIG_INVALID,
      message: "Invalid configuration file",
      details: { path, reason },
      suggestions: [
        "Check the configuration file syntax",
        "Run 'obora doctor' to diagnose issues",
      ],
    }),

  // Preset errors
  presetNotFound: (presetName: string, available?: string[]): CLIError =>
    new CLIError({
      code: ErrorCode.PRESET_NOT_FOUND,
      message: `Preset '${presetName}' not found`,
      details: available?.length ? { available: available.slice(0, 5) } : undefined,
      suggestions: [
        "Run 'obora list presets' to see available presets",
        "Check the preset name spelling",
        available?.length ? `Similar: ${available.slice(0, 3).join(", ")}` : "",
      ].filter(Boolean),
    }),

  presetConflict: (
    presetName: string,
    conflictsWith: string[],
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.PRESET_CONFLICT,
      message: `Preset '${presetName}' conflicts with existing presets`,
      details: { conflictsWith, reason },
      suggestions: [
        `Remove conflicting presets first: obora remove ${conflictsWith.join(" ")}`,
        "Use --force to override (not recommended)",
      ],
    }),

  presetNoTargets: (presetName: string): CLIError =>
    new CLIError({
      code: ErrorCode.PRESET_NO_TARGETS,
      message: `Preset '${presetName}' has no compatible targets for this project`,
      suggestions: [
        "Check if your project framework is supported",
        "Run 'obora doctor' to verify project detection",
      ],
    }),

  presetIncompatible: (
    presetName: string,
    requirement: string,
    current: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.PRESET_INCOMPATIBLE,
      message: `Preset '${presetName}' is incompatible with your project`,
      details: { required: requirement, current },
      suggestions: [
        `Upgrade to meet the requirement: ${requirement}`,
        "Check preset documentation for alternatives",
      ],
    }),

  // Transform errors
  transformFailed: (
    target: string,
    type: string,
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_FAILED,
      message: `Transform failed for '${target}'`,
      details: { type, reason },
      suggestions: [
        "Check if the target file exists and is valid",
        "Ensure the file is not locked by another process",
        "Try running with --verbose for more details",
      ],
      related: [target],
    }),

  transformFileNotFound: (path: string): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_FILE_NOT_FOUND,
      message: `Transform target file not found: ${path}`,
      details: { path },
      suggestions: [
        "Verify the file path is correct",
        "Create the file manually if it should exist",
        "Check if a different file path is intended",
      ],
    }),

  transformImportFailed: (
    target: string,
    importSpec: string,
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_IMPORT_FAILED,
      message: `Failed to add import to '${target}'`,
      details: { target, import: importSpec, reason },
      suggestions: [
        "Check if the file uses ES modules syntax",
        "Verify the target file is a valid JavaScript/TypeScript file",
        "Ensure the import statement syntax is correct",
      ],
      related: [target],
    }),

  transformProviderWrapFailed: (
    target: string,
    provider: string,
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_PROVIDER_WRAP_FAILED,
      message: `Failed to wrap with provider '${provider}' in '${target}'`,
      details: { target, provider, reason },
      suggestions: [
        "Ensure the file contains a valid React component with {children}",
        "Check if the component uses JSX syntax",
        "Verify the file exports a Providers component",
        "Manual fix: wrap {children} with the provider component",
      ],
      related: [target],
    }),

  transformLayoutComponentFailed: (
    target: string,
    component: string,
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_LAYOUT_COMPONENT_FAILED,
      message: `Failed to add component '${component}' to layout '${target}'`,
      details: { target, component, reason },
      suggestions: [
        "Ensure the layout file returns valid JSX",
        "Check if the layout has a <body> or container element",
        "Verify the component import is correct",
        "Manual fix: add the component inside the layout's JSX",
      ],
      related: [target],
    }),

  transformNestJsModuleFailed: (
    target: string,
    module: string,
    reason?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_NESTJS_MODULE_FAILED,
      message: `Failed to add NestJS module '${module}' to '${target}'`,
      details: { target, module, reason },
      suggestions: [
        "Ensure the target is a valid NestJS module with @Module decorator",
        "Check if the imports array exists in @Module",
        "Verify the module name is spelled correctly",
        "Manual fix: add the module to the imports array in @Module",
      ],
      related: [target],
    }),

  transformMarkerNotFound: (
    target: string,
    marker: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_MARKER_NOT_FOUND,
      message: `Marker '${marker}' not found in '${target}'`,
      details: { target, marker },
      suggestions: [
        `Add the marker comment to the target file: // ${marker}`,
        "Check if the marker was removed or modified",
        "Use the correct marker syntax for your file type",
      ],
      related: [target],
    }),

  transformPatternNotFound: (
    target: string,
    pattern: string,
    expected?: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_PATTERN_NOT_FOUND,
      message: `Required pattern not found in '${target}'`,
      details: { target, pattern, expected },
      suggestions: [
        expected ? `Expected to find: ${expected}` : "Check the file structure",
        "The file structure may have changed",
        "Verify the preset is compatible with your project",
      ],
      related: [target],
    }),

  transformDuplicateDetected: (
    target: string,
    type: string,
    content: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.TRANSFORM_DUPLICATE_DETECTED,
      message: `Duplicate ${type} already exists in '${target}'`,
      details: { target, type, content },
      suggestions: [
        "The transform was skipped to avoid duplicates",
        "Remove the existing entry if you want to re-add it",
        "This is usually safe to ignore",
      ],
      related: [target],
    }),

  // Dependency errors
  depInstallFailed: (packages: string[], reason?: string): CLIError =>
    new CLIError({
      code: ErrorCode.DEP_INSTALL_FAILED,
      message: "Failed to install dependencies",
      details: { packages, reason },
      suggestions: [
        "Check your internet connection",
        "Try running the package manager install manually",
        "Clear node_modules and lock file, then retry",
      ],
    }),

  depConflict: (
    pkg: string,
    required: string,
    installed: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.DEP_CONFLICT,
      message: `Dependency version conflict for '${pkg}'`,
      details: { package: pkg, required, installed },
      suggestions: [
        `Update ${pkg} to ${required}`,
        "Check if other packages depend on the current version",
        "Use --force to override (may cause issues)",
      ],
    }),

  // File system errors
  fsNotFound: (path: string, type: "file" | "directory" = "file"): CLIError =>
    new CLIError({
      code: ErrorCode.FS_NOT_FOUND,
      message: `${type === "file" ? "File" : "Directory"} not found: ${path}`,
      details: { path, type },
      suggestions: [
        `Verify the ${type} path is correct`,
        `Create the ${type} if it should exist`,
      ],
    }),

  fsPermissionDenied: (path: string, operation: string): CLIError =>
    new CLIError({
      code: ErrorCode.FS_PERMISSION_DENIED,
      message: `Permission denied: ${operation} on ${path}`,
      details: { path, operation },
      suggestions: [
        "Check file/directory permissions",
        "Run with appropriate permissions",
        "Ensure the file is not locked by another process",
      ],
    }),

  // Project errors
  projectNotInitialized: (dir?: string): CLIError =>
    new CLIError({
      code: ErrorCode.PROJECT_NOT_INITIALIZED,
      message: "Project is not initialized",
      details: dir ? { directory: dir } : undefined,
      suggestions: [
        "Run 'obora init' to initialize the project",
        "Ensure you're in the correct directory",
      ],
    }),

  projectAlreadyInitialized: (dir?: string): CLIError =>
    new CLIError({
      code: ErrorCode.PROJECT_ALREADY_INITIALIZED,
      message: "Project is already initialized",
      details: dir ? { directory: dir } : undefined,
      suggestions: [
        "Use --force to reinitialize",
        "Run 'obora sync' to update assets instead",
      ],
    }),

  // Validation errors
  invalidArgument: (
    messageOrArgument: string,
    reason?: string,
    expected?: string
  ): CLIError => {
    // Support both simple message and structured format
    const isSimple = reason === undefined;
    const message = isSimple
      ? messageOrArgument
      : `Invalid argument '${messageOrArgument}': ${reason}`;

    return new CLIError({
      code: ErrorCode.INVALID_ARGUMENT,
      message,
      details: expected ? { expected } : undefined,
      suggestions: [
        expected ? `Expected: ${expected}` : "Check the argument value",
        "Run the command with --help for usage information",
      ].filter(Boolean),
    });
  },

  missingRequired: (field: string, context?: string): CLIError =>
    new CLIError({
      code: ErrorCode.MISSING_REQUIRED,
      message: `Missing required ${context ? `${context} ` : ""}field: ${field}`,
      suggestions: [
        `Provide the required ${field}`,
        "Run the command with --help for usage information",
      ],
    }),

  validationFailed: (
    field: string,
    value: unknown,
    reason: string
  ): CLIError =>
    new CLIError({
      code: ErrorCode.VALIDATION_FAILED,
      message: `Validation failed for '${field}': ${reason}`,
      details: { field, value, reason },
      suggestions: [
        "Check the input value format",
        "Refer to the documentation for valid values",
      ],
    }),

  // General errors
  operationFailed: (operation: string, reason: string): CLIError =>
    new CLIError({
      code: ErrorCode.OPERATION_FAILED,
      message: `Operation '${operation}' failed: ${reason}`,
      suggestions: [
        "Check the error message for details",
        "Run with --verbose for more information",
      ],
    }),

  unknown: (error: unknown): CLIError => {
    const message = error instanceof Error ? error.message : String(error);
    return new CLIError({
      code: ErrorCode.UNKNOWN_ERROR,
      message: `An unexpected error occurred: ${message}`,
      suggestions: [
        "Try running the command again",
        "Run 'obora doctor' to check for issues",
        "Report this issue if it persists",
      ],
    });
  },
};

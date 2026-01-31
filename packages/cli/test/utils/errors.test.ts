import { describe, it, expect } from "vitest";

// ============================================================================
// Error Codes (from errors.ts)
// ============================================================================

const ErrorCode = {
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

type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// ============================================================================
// Error Context Interface (from errors.ts)
// ============================================================================

interface ErrorContext {
  code: ErrorCodeType;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
  helpUrl?: string;
  related?: string[];
}

// ============================================================================
// CLIError Class (from errors.ts)
// ============================================================================

class CLIError extends Error {
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

  format(): string {
    const lines: string[] = [];

    lines.push(`[${this.code}] ${this.message}`);

    if (this.details && Object.keys(this.details).length > 0) {
      lines.push("");
      lines.push("Details:");
      for (const [key, value] of Object.entries(this.details)) {
        const displayValue =
          typeof value === "object" ? JSON.stringify(value) : String(value);
        lines.push(`  ${key}: ${displayValue}`);
      }
    }

    if (this.suggestions && this.suggestions.length > 0) {
      lines.push("");
      lines.push("Suggestions:");
      for (const suggestion of this.suggestions) {
        lines.push(`  → ${suggestion}`);
      }
    }

    if (this.related && this.related.length > 0) {
      lines.push("");
      lines.push("Related:");
      for (const item of this.related) {
        lines.push(`  - ${item}`);
      }
    }

    if (this.helpUrl) {
      lines.push("");
      lines.push(`Help: ${this.helpUrl}`);
    }

    return lines.join("\n");
  }
}

// ============================================================================
// Helper Functions (from errors.ts)
// ============================================================================

const DOCS_BASE_URL = "https://obora.dev/docs/errors";

function getErrorDocsUrl(code: ErrorCodeType): string {
  return `${DOCS_BASE_URL}/${code.toLowerCase()}`;
}

// ============================================================================
// Tests
// ============================================================================

describe("errors utility", () => {
  describe("ErrorCode", () => {
    it("should have unique error codes for each category", () => {
      const codes = Object.values(ErrorCode);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it("should follow E{category}{number} format", () => {
      for (const [name, code] of Object.entries(ErrorCode)) {
        expect(code).toMatch(/^E[1-9]\d{2}$/);
      }
    });

    it("should have config errors in E1xx range", () => {
      expect(ErrorCode.CONFIG_NOT_FOUND).toBe("E101");
      expect(ErrorCode.CONFIG_INVALID).toBe("E102");
      expect(ErrorCode.CONFIG_PARSE_ERROR).toBe("E103");
    });

    it("should have preset errors in E2xx range", () => {
      expect(ErrorCode.PRESET_NOT_FOUND).toBe("E201");
      expect(ErrorCode.PRESET_CONFLICT).toBe("E202");
      expect(ErrorCode.PRESET_NO_TARGETS).toBe("E204");
    });

    it("should have transform errors in E3xx range", () => {
      expect(ErrorCode.TRANSFORM_FAILED).toBe("E301");
      expect(ErrorCode.TRANSFORM_FILE_NOT_FOUND).toBe("E302");
      expect(ErrorCode.TRANSFORM_IMPORT_FAILED).toBe("E304");
    });

    it("should have dependency errors in E4xx range", () => {
      expect(ErrorCode.DEP_INSTALL_FAILED).toBe("E401");
      expect(ErrorCode.DEP_CONFLICT).toBe("E402");
    });

    it("should have filesystem errors in E5xx range", () => {
      expect(ErrorCode.FS_NOT_FOUND).toBe("E503");
      expect(ErrorCode.FS_PERMISSION_DENIED).toBe("E504");
    });

    it("should have project errors in E6xx range", () => {
      expect(ErrorCode.PROJECT_NOT_INITIALIZED).toBe("E601");
      expect(ErrorCode.PROJECT_ALREADY_INITIALIZED).toBe("E602");
    });

    it("should have validation errors in E8xx range", () => {
      expect(ErrorCode.INVALID_ARGUMENT).toBe("E801");
      expect(ErrorCode.MISSING_REQUIRED).toBe("E802");
    });

    it("should have general errors in E9xx range", () => {
      expect(ErrorCode.OPERATION_FAILED).toBe("E901");
      expect(ErrorCode.UNKNOWN_ERROR).toBe("E999");
    });
  });

  describe("getErrorDocsUrl", () => {
    it("should generate correct documentation URL", () => {
      const url = getErrorDocsUrl(ErrorCode.CONFIG_NOT_FOUND);
      expect(url).toBe("https://obora.dev/docs/errors/e101");
    });

    it("should lowercase the error code in URL", () => {
      const url = getErrorDocsUrl(ErrorCode.PRESET_NOT_FOUND);
      expect(url).toBe("https://obora.dev/docs/errors/e201");
    });
  });

  describe("CLIError", () => {
    it("should create error with basic context", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_NOT_FOUND,
        message: "Configuration file not found",
      });

      expect(error.name).toBe("CLIError");
      expect(error.code).toBe("E101");
      expect(error.message).toBe("Configuration file not found");
      expect(error instanceof Error).toBe(true);
    });

    it("should include optional details", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_INVALID,
        message: "Invalid configuration",
        details: { path: "/config.json", reason: "syntax error" },
      });

      expect(error.details).toEqual({
        path: "/config.json",
        reason: "syntax error",
      });
    });

    it("should include suggestions", () => {
      const error = new CLIError({
        code: ErrorCode.PROJECT_NOT_INITIALIZED,
        message: "Project not initialized",
        suggestions: ["Run obora init", "Check directory"],
      });

      expect(error.suggestions).toEqual(["Run obora init", "Check directory"]);
    });

    it("should include related files", () => {
      const error = new CLIError({
        code: ErrorCode.TRANSFORM_FAILED,
        message: "Transform failed",
        related: ["src/app.ts", "src/main.ts"],
      });

      expect(error.related).toEqual(["src/app.ts", "src/main.ts"]);
    });

    it("should include help URL", () => {
      const error = new CLIError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: "Unknown error",
        helpUrl: "https://example.com/help",
      });

      expect(error.helpUrl).toBe("https://example.com/help");
    });
  });

  describe("CLIError.format()", () => {
    it("should format basic error", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_NOT_FOUND,
        message: "Configuration file not found",
      });

      const formatted = error.format();
      expect(formatted).toBe("[E101] Configuration file not found");
    });

    it("should format error with details", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_INVALID,
        message: "Invalid configuration",
        details: { path: "/config.json" },
      });

      const formatted = error.format();
      expect(formatted).toContain("[E102] Invalid configuration");
      expect(formatted).toContain("Details:");
      expect(formatted).toContain("path: /config.json");
    });

    it("should format object details as JSON", () => {
      const error = new CLIError({
        code: ErrorCode.PRESET_CONFLICT,
        message: "Preset conflict",
        details: { conflicts: ["a", "b"] },
      });

      const formatted = error.format();
      expect(formatted).toContain('conflicts: ["a","b"]');
    });

    it("should format error with suggestions", () => {
      const error = new CLIError({
        code: ErrorCode.PROJECT_NOT_INITIALIZED,
        message: "Project not initialized",
        suggestions: ["Run obora init", "Check directory"],
      });

      const formatted = error.format();
      expect(formatted).toContain("Suggestions:");
      expect(formatted).toContain("→ Run obora init");
      expect(formatted).toContain("→ Check directory");
    });

    it("should format error with related files", () => {
      const error = new CLIError({
        code: ErrorCode.TRANSFORM_FAILED,
        message: "Transform failed",
        related: ["src/app.ts"],
      });

      const formatted = error.format();
      expect(formatted).toContain("Related:");
      expect(formatted).toContain("- src/app.ts");
    });

    it("should format error with help URL", () => {
      const error = new CLIError({
        code: ErrorCode.UNKNOWN_ERROR,
        message: "Unknown error",
        helpUrl: "https://example.com/help",
      });

      const formatted = error.format();
      expect(formatted).toContain("Help: https://example.com/help");
    });

    it("should format full error with all fields", () => {
      const error = new CLIError({
        code: ErrorCode.TRANSFORM_IMPORT_FAILED,
        message: "Failed to add import",
        details: { target: "app.ts", import: "lodash" },
        suggestions: ["Check syntax", "Verify file exists"],
        related: ["app.ts", "package.json"],
        helpUrl: "https://docs.example.com",
      });

      const formatted = error.format();

      expect(formatted).toContain("[E304] Failed to add import");
      expect(formatted).toContain("Details:");
      expect(formatted).toContain("target: app.ts");
      expect(formatted).toContain("Suggestions:");
      expect(formatted).toContain("→ Check syntax");
      expect(formatted).toContain("Related:");
      expect(formatted).toContain("- app.ts");
      expect(formatted).toContain("Help: https://docs.example.com");
    });

    it("should handle empty details object", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_NOT_FOUND,
        message: "Config not found",
        details: {},
      });

      const formatted = error.format();
      expect(formatted).not.toContain("Details:");
    });

    it("should handle empty suggestions array", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_NOT_FOUND,
        message: "Config not found",
        suggestions: [],
      });

      const formatted = error.format();
      expect(formatted).not.toContain("Suggestions:");
    });

    it("should handle empty related array", () => {
      const error = new CLIError({
        code: ErrorCode.CONFIG_NOT_FOUND,
        message: "Config not found",
        related: [],
      });

      const formatted = error.format();
      expect(formatted).not.toContain("Related:");
    });
  });

  describe("Error factory pattern", () => {
    it("should create config not found error", () => {
      const createConfigNotFound = (path?: string): CLIError =>
        new CLIError({
          code: ErrorCode.CONFIG_NOT_FOUND,
          message: "Configuration file not found",
          details: path ? { path } : undefined,
          suggestions: [
            "Run 'obora init' to initialize the project",
            "Check if you're in the correct directory",
          ],
          helpUrl: getErrorDocsUrl(ErrorCode.CONFIG_NOT_FOUND),
        });

      const error = createConfigNotFound("/path/to/config");

      expect(error.code).toBe("E101");
      expect(error.details?.path).toBe("/path/to/config");
      expect(error.suggestions).toHaveLength(2);
      expect(error.helpUrl).toContain("e101");
    });

    it("should create preset not found error with available presets", () => {
      const createPresetNotFound = (
        presetName: string,
        available?: string[]
      ): CLIError =>
        new CLIError({
          code: ErrorCode.PRESET_NOT_FOUND,
          message: `Preset '${presetName}' not found`,
          details: available?.length
            ? { available: available.slice(0, 5) }
            : undefined,
          suggestions: [
            "Run 'obora list presets' to see available presets",
            "Check the preset name spelling",
            available?.length ? `Similar: ${available.slice(0, 3).join(", ")}` : "",
          ].filter(Boolean),
          helpUrl: getErrorDocsUrl(ErrorCode.PRESET_NOT_FOUND),
        });

      const error = createPresetNotFound("drizzl", ["drizzle", "prisma"]);

      expect(error.code).toBe("E201");
      expect(error.message).toBe("Preset 'drizzl' not found");
      expect(error.details?.available).toEqual(["drizzle", "prisma"]);
      expect(error.suggestions).toContain("Similar: drizzle, prisma");
    });

    it("should create preset conflict error", () => {
      const createPresetConflict = (
        presetName: string,
        conflictsWith: string[]
      ): CLIError =>
        new CLIError({
          code: ErrorCode.PRESET_CONFLICT,
          message: `Preset '${presetName}' conflicts with existing presets`,
          details: { conflictsWith },
          suggestions: [
            `Remove conflicting presets first: obora remove ${conflictsWith.join(" ")}`,
            "Use --force to override (not recommended)",
          ],
          helpUrl: getErrorDocsUrl(ErrorCode.PRESET_CONFLICT),
        });

      const error = createPresetConflict("prisma", ["drizzle"]);

      expect(error.code).toBe("E202");
      expect(error.details?.conflictsWith).toEqual(["drizzle"]);
      expect(error.suggestions?.[0]).toContain("obora remove drizzle");
    });

    it("should create transform file not found error", () => {
      const createTransformFileNotFound = (path: string): CLIError =>
        new CLIError({
          code: ErrorCode.TRANSFORM_FILE_NOT_FOUND,
          message: `Transform target file not found: ${path}`,
          details: { path },
          suggestions: [
            "Verify the file path is correct",
            "Create the file manually if it should exist",
          ],
          helpUrl: getErrorDocsUrl(ErrorCode.TRANSFORM_FILE_NOT_FOUND),
        });

      const error = createTransformFileNotFound("src/missing.ts");

      expect(error.code).toBe("E302");
      expect(error.message).toContain("src/missing.ts");
      expect(error.details?.path).toBe("src/missing.ts");
    });

    it("should create unknown error from Error instance", () => {
      const createUnknown = (error: unknown): CLIError => {
        const message =
          error instanceof Error ? error.message : String(error);
        return new CLIError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `An unexpected error occurred: ${message}`,
          suggestions: [
            "Try running the command again",
            "Run 'obora doctor' to check for issues",
          ],
          helpUrl: getErrorDocsUrl(ErrorCode.UNKNOWN_ERROR),
        });
      };

      const originalError = new Error("Something went wrong");
      const error = createUnknown(originalError);

      expect(error.code).toBe("E999");
      expect(error.message).toContain("Something went wrong");
    });

    it("should create unknown error from string", () => {
      const createUnknown = (error: unknown): CLIError => {
        const message =
          error instanceof Error ? error.message : String(error);
        return new CLIError({
          code: ErrorCode.UNKNOWN_ERROR,
          message: `An unexpected error occurred: ${message}`,
          suggestions: ["Try running the command again"],
          helpUrl: getErrorDocsUrl(ErrorCode.UNKNOWN_ERROR),
        });
      };

      const error = createUnknown("raw string error");

      expect(error.code).toBe("E999");
      expect(error.message).toContain("raw string error");
    });
  });

  describe("TransformErrorType handling", () => {
    type TransformErrorType =
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

    interface TransformErrorContext {
      type: TransformErrorType;
      target: string;
      content?: string;
      reason?: string;
      expected?: string;
    }

    it("should handle import transform error type", () => {
      const ctx: TransformErrorContext = {
        type: "import",
        target: "src/app.ts",
        content: "import { foo } from 'bar'",
        reason: "Syntax error",
      };

      expect(ctx.type).toBe("import");
      expect(ctx.target).toBe("src/app.ts");
    });

    it("should handle provider-wrap transform error type", () => {
      const ctx: TransformErrorContext = {
        type: "provider-wrap",
        target: "src/providers.tsx",
        content: "QueryClientProvider",
        reason: "No children found",
      };

      expect(ctx.type).toBe("provider-wrap");
    });

    it("should handle nestjs-module transform error type", () => {
      const ctx: TransformErrorContext = {
        type: "nestjs-module",
        target: "src/app.module.ts",
        content: "DatabaseModule",
        reason: "@Module decorator not found",
      };

      expect(ctx.type).toBe("nestjs-module");
    });

    it("should handle marker transform error type", () => {
      const ctx: TransformErrorContext = {
        type: "marker",
        target: "src/config.ts",
        content: "@obora:imports",
        expected: "// @obora:imports",
      };

      expect(ctx.type).toBe("marker");
      expect(ctx.expected).toBe("// @obora:imports");
    });
  });
});

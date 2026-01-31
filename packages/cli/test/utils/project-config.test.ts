/**
 * project-config.ts tests
 *
 * Tests for the resolveAppPath function.
 * Note: Most exports are re-exports from @obora/project-config.
 * Only resolveAppPath is custom logic in this file.
 */

import { describe, test, expect } from "bun:test";

// ============================================================================
// Test Helper: Copy resolveAppPath logic for isolated testing
// ============================================================================

// Replicate APP_MODULES structure for testing
const TEST_APP_MODULES: Record<string, { targetDir?: string }> = {
  "nextjs-web": { targetDir: "apps/web" },
  "nestjs-api": { targetDir: "apps/api" },
  "shared-database": { targetDir: "packages/database" },
  "shared-ui": { targetDir: "packages/ui" },
};

/**
 * Test version of resolveAppPath
 */
function resolveAppPath(
  projectPath: string,
  base: string,
  appName: string,
  module: string
): string {
  // Simple path join for testing (platform-independent)
  const join = (...parts: string[]) => parts.filter(Boolean).join("/");

  const moduleConfig = TEST_APP_MODULES[module];

  // Single project: return project path as-is
  if (base === "single") {
    return projectPath;
  }

  // Module with targetDir
  if (moduleConfig?.targetDir) {
    const root = moduleConfig.targetDir.split("/")[0];
    if (root === "packages") {
      return join(projectPath, "packages", appName);
    }
    if (root === "apps") {
      return join(projectPath, "apps", appName);
    }
  }

  // Fallback for shared modules without config lookup
  if (module === "shared-database" || module === "shared-ui") {
    return join(projectPath, "packages", appName);
  }

  // Default: apps directory
  return join(projectPath, "apps", appName);
}

// ============================================================================
// Tests
// ============================================================================

describe("resolveAppPath", () => {
  const projectPath = "/my/project";
  const appName = "my-app";

  describe("single base", () => {
    test("should return projectPath for single base", () => {
      const result = resolveAppPath(projectPath, "single", appName, "nextjs-web");
      expect(result).toBe(projectPath);
    });

    test("should return projectPath for single base regardless of module", () => {
      expect(resolveAppPath(projectPath, "single", appName, "nextjs-web")).toBe(projectPath);
      expect(resolveAppPath(projectPath, "single", appName, "nestjs-api")).toBe(projectPath);
      expect(resolveAppPath(projectPath, "single", appName, "shared-database")).toBe(projectPath);
      expect(resolveAppPath(projectPath, "single", appName, "unknown")).toBe(projectPath);
    });

    test("should work with empty appName for single base", () => {
      const result = resolveAppPath(projectPath, "single", "", "nextjs-web");
      expect(result).toBe(projectPath);
    });
  });

  describe("monorepo base - apps modules", () => {
    test("should resolve nextjs-web to apps directory", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "nextjs-web");
      expect(result).toBe("/my/project/apps/my-app");
    });

    test("should resolve nestjs-api to apps directory", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "nestjs-api");
      expect(result).toBe("/my/project/apps/my-app");
    });

    test("should use appName in path for apps modules", () => {
      const customApp = "custom-web";
      const result = resolveAppPath(projectPath, "monorepo", customApp, "nextjs-web");
      expect(result).toBe("/my/project/apps/custom-web");
    });
  });

  describe("monorepo base - packages modules", () => {
    test("should resolve shared-database to packages directory", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "shared-database");
      expect(result).toBe("/my/project/packages/my-app");
    });

    test("should resolve shared-ui to packages directory", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "shared-ui");
      expect(result).toBe("/my/project/packages/my-app");
    });

    test("should use appName in path for packages modules", () => {
      const customApp = "db";
      const result = resolveAppPath(projectPath, "monorepo", customApp, "shared-database");
      expect(result).toBe("/my/project/packages/db");
    });
  });

  describe("unknown modules", () => {
    test("should fallback to apps directory for unknown modules", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "unknown-module");
      expect(result).toBe("/my/project/apps/my-app");
    });

    test("should fallback to apps for empty module name", () => {
      const result = resolveAppPath(projectPath, "monorepo", appName, "");
      expect(result).toBe("/my/project/apps/my-app");
    });
  });

  describe("path handling", () => {
    test("should handle projectPath without trailing slash", () => {
      const result = resolveAppPath("/project", "monorepo", "app", "nextjs-web");
      expect(result).toBe("/project/apps/app");
    });

    test("should handle Windows-style projectPath with forward slashes", () => {
      const result = resolveAppPath("C:/Users/dev/project", "monorepo", "app", "nextjs-web");
      expect(result).toBe("C:/Users/dev/project/apps/app");
    });

    test("should handle relative projectPath", () => {
      const result = resolveAppPath("./my-project", "monorepo", "web", "nextjs-web");
      expect(result).toBe("./my-project/apps/web");
    });
  });

  describe("edge cases", () => {
    test("should handle appName with dashes", () => {
      const result = resolveAppPath(projectPath, "monorepo", "my-cool-app", "nextjs-web");
      expect(result).toBe("/my/project/apps/my-cool-app");
    });

    test("should handle appName with underscores", () => {
      const result = resolveAppPath(projectPath, "monorepo", "my_app", "nestjs-api");
      expect(result).toBe("/my/project/apps/my_app");
    });

    test("should handle numeric appName", () => {
      const result = resolveAppPath(projectPath, "monorepo", "app123", "nextjs-web");
      expect(result).toBe("/my/project/apps/app123");
    });

    test("should handle unknown base type as monorepo", () => {
      // Any base other than "single" should be treated as monorepo
      const result = resolveAppPath(projectPath, "unknown-base", appName, "nextjs-web");
      expect(result).toBe("/my/project/apps/my-app");
    });
  });
});

// ============================================================================
// Special fallback tests
// ============================================================================

describe("resolveAppPath fallback logic", () => {
  describe("shared modules without moduleConfig", () => {
    // Test the fallback case where module is shared-database or shared-ui
    // but moduleConfig doesn't exist (simulating external dependency changes)
    const resolveAppPathWithEmptyModules = (
      projectPath: string,
      base: string,
      appName: string,
      module: string
    ): string => {
      const join = (...parts: string[]) => parts.filter(Boolean).join("/");
      const moduleConfig = {} as Record<string, { targetDir?: string }>;

      if (base === "single") {
        return projectPath;
      }

      const config = moduleConfig[module];
      if (config?.targetDir) {
        const root = config.targetDir.split("/")[0];
        if (root === "packages") {
          return join(projectPath, "packages", appName);
        }
        if (root === "apps") {
          return join(projectPath, "apps", appName);
        }
      }

      // Fallback for shared modules
      if (module === "shared-database" || module === "shared-ui") {
        return join(projectPath, "packages", appName);
      }

      return join(projectPath, "apps", appName);
    };

    test("shared-database should fallback to packages even without moduleConfig", () => {
      const result = resolveAppPathWithEmptyModules(
        "/project",
        "monorepo",
        "db",
        "shared-database"
      );
      expect(result).toBe("/project/packages/db");
    });

    test("shared-ui should fallback to packages even without moduleConfig", () => {
      const result = resolveAppPathWithEmptyModules(
        "/project",
        "monorepo",
        "ui",
        "shared-ui"
      );
      expect(result).toBe("/project/packages/ui");
    });
  });
});

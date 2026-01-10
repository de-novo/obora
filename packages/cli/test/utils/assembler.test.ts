import { describe, it, expect } from "vitest";
import { APP_MODULES } from "../../src/utils/constants";

/**
 * Unit tests for assembler logic
 * Note: Integration tests for assembleProject are performed via E2E testing
 * because they require the full template directory structure.
 */
describe("assembler logic", () => {
  describe("targetApps filtering logic", () => {
    // Simulates getPresetTargetDirs logic
    function getTargetDirsForPreset(
      category: string,
      apps: string[],
      targetApps?: string[]
    ): string[] {
      const rootLevelCategories = ["linting"];
      if (rootLevelCategories.includes(category)) {
        return ["project-root"];
      }

      const dirs: string[] = [];

      for (const appName of apps) {
        const appConfig = APP_MODULES[appName as keyof typeof APP_MODULES];
        if (!appConfig) continue;

        // Check if this app supports the preset category
        if (!appConfig.slots.includes(category)) {
          continue;
        }

        // If preset has targetApps, check if this app is in the list
        if (targetApps && targetApps.length > 0 && !targetApps.includes(appName)) {
          continue;
        }

        dirs.push(appConfig.targetDir);
      }

      return dirs.length > 0 ? dirs : ["project-root"];
    }

    it("should return project root for linting category", () => {
      const dirs = getTargetDirsForPreset("linting", ["nestjs-api", "nextjs-web"]);
      expect(dirs).toEqual(["project-root"]);
    });

    it("should return nestjs-api targetDir for database category", () => {
      const dirs = getTargetDirsForPreset("database", ["nestjs-api", "nextjs-web"]);
      expect(dirs).toEqual(["apps/api"]);
    });

    it("should return both apps for auth category without targetApps", () => {
      const dirs = getTargetDirsForPreset("auth", ["nestjs-api", "nextjs-web"]);
      expect(dirs).toContain("apps/api");
      expect(dirs).toContain("apps/web");
    });

    it("should filter to nestjs-api only with targetApps", () => {
      const dirs = getTargetDirsForPreset(
        "auth",
        ["nestjs-api", "nextjs-web"],
        ["nestjs-api"] // clerk targetApps
      );
      expect(dirs).toEqual(["apps/api"]);
      expect(dirs).not.toContain("apps/web");
    });

    it("should filter to nextjs-web only with targetApps", () => {
      const dirs = getTargetDirsForPreset(
        "auth",
        ["nestjs-api", "nextjs-web"],
        ["nextjs-web"] // clerk-nextjs targetApps
      );
      expect(dirs).toEqual(["apps/web"]);
      expect(dirs).not.toContain("apps/api");
    });

    it("should return project root if no matching apps", () => {
      const dirs = getTargetDirsForPreset(
        "database",
        ["nextjs-web"], // nextjs-web doesn't have database slot
        undefined
      );
      expect(dirs).toEqual(["project-root"]);
    });

    it("should work with single app", () => {
      const dirs = getTargetDirsForPreset("database", ["nestjs-api"]);
      expect(dirs).toEqual(["apps/api"]);
    });

    it("should handle analytics for nextjs-web", () => {
      const dirs = getTargetDirsForPreset("analytics", ["nestjs-api", "nextjs-web"]);
      // nextjs-web has analytics slot
      expect(dirs).toContain("apps/web");
    });

    it("should handle email for nestjs-api only", () => {
      const dirs = getTargetDirsForPreset("email", ["nestjs-api", "nextjs-web"]);
      // only nestjs-api has email slot
      expect(dirs).toEqual(["apps/api"]);
    });

    it("should handle payment for nestjs-api only", () => {
      const dirs = getTargetDirsForPreset("payment", ["nestjs-api", "nextjs-web"]);
      // only nestjs-api has payment slot
      expect(dirs).toEqual(["apps/api"]);
    });
  });

  describe("slot configuration", () => {
    it("nestjs-api should have correct slots", () => {
      const slots = APP_MODULES["nestjs-api"].slots;
      expect(slots).toContain("linting");
      expect(slots).toContain("database");
      expect(slots).toContain("auth");
      expect(slots).toContain("payment");
      expect(slots).toContain("email");
      expect(slots).toContain("storage");
      expect(slots).toContain("ai");
      expect(slots).toContain("validation");
    });

    it("nextjs-web should have correct slots", () => {
      const slots = APP_MODULES["nextjs-web"].slots;
      expect(slots).toContain("linting");
      expect(slots).toContain("analytics");
      expect(slots).toContain("auth");
      // Should NOT have backend-only slots
      expect(slots).not.toContain("database");
      expect(slots).not.toContain("payment");
      expect(slots).not.toContain("email");
    });
  });
});

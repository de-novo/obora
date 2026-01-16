import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import {
  getConfigDir,
  getConfigPath,
  getHistoryPath,
  getPresetLockPath,
  hasOboraConfig,
  readOboraConfig,
  writeOboraConfig,
  createInitialConfig,
  defaultAppPathResolver,
  createPresetLockfileSnapshot,
  getInstalledApps,
  getInstalledPresets,
} from "../project-config.js";
import type { OboraConfig } from "../types.js";

const TEST_DIR = join(process.cwd(), ".test-project-config");

describe("project-config", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("path functions", () => {
    it("should return correct config dir", () => {
      expect(getConfigDir("/project")).toBe("/project/.obora");
    });

    it("should return correct config path", () => {
      expect(getConfigPath("/project")).toBe("/project/.obora/config.json");
    });

    it("should return correct history path", () => {
      expect(getHistoryPath("/project")).toBe("/project/.obora/history.json");
    });

    it("should return correct preset lock path", () => {
      expect(getPresetLockPath("/project")).toBe("/project/.obora/presets.lock.json");
    });
  });

  describe("hasOboraConfig", () => {
    it("should return false when no config exists", () => {
      expect(hasOboraConfig(TEST_DIR)).toBe(false);
    });

    it("should return true when config exists", async () => {
      const configDir = getConfigDir(TEST_DIR);
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(getConfigPath(TEST_DIR), JSON.stringify({ version: "1.0.0" }));

      expect(hasOboraConfig(TEST_DIR)).toBe(true);
    });
  });

  describe("readOboraConfig / writeOboraConfig", () => {
    it("should return null for non-existent config", async () => {
      const config = await readOboraConfig(TEST_DIR);
      expect(config).toBeNull();
    });

    it("should write and read config correctly", async () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "monorepo",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {},
        slots: {},
        packageManager: "pnpm",
      };

      await writeOboraConfig(TEST_DIR, config);
      const readConfig = await readOboraConfig(TEST_DIR);

      expect(readConfig).not.toBeNull();
      expect(readConfig?.version).toBe("2.0.0");
      expect(readConfig?.base).toBe("monorepo");
      expect(readConfig?.packageManager).toBe("pnpm");
    });

    it("should update updatedAt on write", async () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "single",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {},
        slots: {},
        packageManager: "npm",
      };

      await writeOboraConfig(TEST_DIR, config);
      const readConfig = await readOboraConfig(TEST_DIR);

      expect(readConfig?.updatedAt).not.toBe("2024-01-01T00:00:00Z");
    });
  });

  describe("createInitialConfig", () => {
    it("should create config with apps and slots", () => {
      const config = createInitialConfig(
        TEST_DIR,
        "monorepo",
        "pnpm",
        {
          web: { module: "nextjs-web", version: "1.0.0" },
          api: { module: "nestjs-api", version: "1.0.0" },
        },
        {
          auth: { preset: "clerk", version: "1.0.0" },
          database: null,
        }
      );

      expect(config.base).toBe("monorepo");
      expect(config.packageManager).toBe("pnpm");
      expect(Object.keys(config.apps)).toEqual(["web", "api"]);
      expect(config.apps.web.module).toBe("nextjs-web");
      expect(config.slots.auth?.preset).toBe("clerk");
      expect(config.slots.database).toBeNull();
    });

    it("should use custom path when provided", () => {
      const config = createInitialConfig(
        TEST_DIR,
        "monorepo",
        "pnpm",
        {
          web: { module: "nextjs-web", version: "1.0.0", path: "/custom/path" },
        },
        {}
      );

      expect(config.apps.web.path).toBe("/custom/path");
    });
  });

  describe("defaultAppPathResolver", () => {
    it("should return project path for single base", () => {
      const path = defaultAppPathResolver("/project", "single", "web", "nextjs-web");
      expect(path).toBe("/project");
    });

    it("should return packages path for shared modules", () => {
      const dbPath = defaultAppPathResolver("/project", "monorepo", "database", "shared-database");
      expect(dbPath).toBe("/project/packages/database");

      const uiPath = defaultAppPathResolver("/project", "monorepo", "ui", "shared-ui");
      expect(uiPath).toBe("/project/packages/ui");
    });

    it("should return apps path for app modules", () => {
      const webPath = defaultAppPathResolver("/project", "monorepo", "web", "nextjs-web");
      expect(webPath).toBe("/project/apps/web");

      const apiPath = defaultAppPathResolver("/project", "monorepo", "api", "nestjs-api");
      expect(apiPath).toBe("/project/apps/api");
    });
  });

  describe("createPresetLockfileSnapshot", () => {
    it("should create lockfile from config", () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "monorepo",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {
          web: { module: "nextjs-web", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z", path: "/apps/web" },
        },
        slots: {
          auth: { preset: "clerk", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z" },
          database: null,
        },
        packageManager: "pnpm",
      };

      const lockfile = createPresetLockfileSnapshot(config);

      expect(lockfile.base).toBe("monorepo");
      expect(lockfile.packageManager).toBe("pnpm");
      expect(lockfile.apps.web.module).toBe("nextjs-web");
      expect(lockfile.presets.auth.preset).toBe("clerk");
      expect(lockfile.presets.database).toBeUndefined();
    });

    it("should include preset targets in lockfile", () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "monorepo",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {},
        slots: {
          auth: { preset: "clerk", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z" },
        },
        presetTargets: {
          clerk: "nextjs",
        },
        packageManager: "pnpm",
      };

      const lockfile = createPresetLockfileSnapshot(config);

      expect(lockfile.presets.auth.target).toBe("nextjs");
    });
  });

  describe("getInstalledApps", () => {
    it("should return map of app names to modules", () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "monorepo",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {
          web: { module: "nextjs-web", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z", path: "/apps/web" },
          api: { module: "nestjs-api", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z", path: "/apps/api" },
        },
        slots: {},
        packageManager: "pnpm",
      };

      const installed = getInstalledApps(config);

      expect(installed).toEqual({
        web: "nextjs-web",
        api: "nestjs-api",
      });
    });
  });

  describe("getInstalledPresets", () => {
    it("should return map of slot names to presets", () => {
      const config: OboraConfig = {
        $schema: "https://obora.dev/schema/config.json",
        version: "2.0.0",
        base: "monorepo",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:00Z",
        apps: {},
        slots: {
          auth: { preset: "clerk", version: "1.0.0", installedAt: "2024-01-01T00:00:00Z" },
          database: { preset: "drizzle", version: "0.45.0", installedAt: "2024-01-01T00:00:00Z" },
          linting: null,
        },
        packageManager: "pnpm",
      };

      const installed = getInstalledPresets(config);

      expect(installed).toEqual({
        auth: "clerk",
        database: "drizzle",
      });
    });
  });
});

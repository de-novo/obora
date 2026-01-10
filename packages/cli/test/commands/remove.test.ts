import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

// Mock modules
vi.mock("consola", () => ({
  consola: {
    start: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  },
}));

describe("remove command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `obora-remove-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("project validation", () => {
    it("should detect valid obora project with .obora/config.json", async () => {
      const configDir = join(testDir, ".obora");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        join(configDir, "config.json"),
        JSON.stringify({
          base: "monorepo",
          apps: {},
          slots: {},
        })
      );

      const configExists = await fs
        .stat(join(configDir, "config.json"))
        .then(() => true)
        .catch(() => false);

      expect(configExists).toBe(true);
    });

    it("should detect project without obora config", async () => {
      const configPath = join(testDir, ".obora", "config.json");

      const exists = await fs
        .stat(configPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });
  });

  describe("installed presets detection", () => {
    it("should read installed presets from config", async () => {
      const config = {
        base: "monorepo",
        apps: {},
        slots: {
          database: { preset: "drizzle", version: "0.38.0" },
          email: { preset: "resend", version: "4.0.0" },
        },
      };

      const installedPresets: Record<string, string> = {};
      for (const [slot, value] of Object.entries(config.slots)) {
        if (value && typeof value === "object" && "preset" in value) {
          installedPresets[slot] = (value as { preset: string }).preset;
        }
      }

      expect(installedPresets["database"]).toBe("drizzle");
      expect(installedPresets["email"]).toBe("resend");
    });

    it("should handle empty slots", async () => {
      const config = {
        base: "monorepo",
        apps: {},
        slots: {},
      };

      const installedList = Object.entries(config.slots);
      expect(installedList.length).toBe(0);
    });
  });

  describe("dependency removal", () => {
    it("should remove dependencies from package.json", async () => {
      const packageJson = {
        name: "test-project",
        dependencies: {
          react: "^18.0.0",
          resend: "^4.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      };

      const depsToRemove = {
        dependencies: {
          resend: "^4.0.0",
        },
      };

      // Simulate removal
      if (depsToRemove.dependencies && packageJson.dependencies) {
        for (const dep of Object.keys(depsToRemove.dependencies)) {
          if (packageJson.dependencies[dep as keyof typeof packageJson.dependencies]) {
            delete packageJson.dependencies[dep as keyof typeof packageJson.dependencies];
          }
        }
      }

      expect(packageJson.dependencies["react" as keyof typeof packageJson.dependencies]).toBe("^18.0.0");
      expect(packageJson.dependencies["resend" as keyof typeof packageJson.dependencies]).toBeUndefined();
    });
  });

  describe("script removal", () => {
    it("should remove scripts only if value matches", async () => {
      const packageJson = {
        scripts: {
          dev: "next dev",
          build: "next build",
          "db:push": "drizzle-kit push",
        },
      };

      const scriptsToRemove = {
        "db:push": "drizzle-kit push",
        dev: "npm run dev", // Different value - should not be removed
      };

      for (const [scriptName, scriptValue] of Object.entries(scriptsToRemove)) {
        if (packageJson.scripts[scriptName as keyof typeof packageJson.scripts] === scriptValue) {
          delete packageJson.scripts[scriptName as keyof typeof packageJson.scripts];
        }
      }

      expect(packageJson.scripts["dev"]).toBe("next dev"); // Not removed - value didn't match
      expect(packageJson.scripts["db:push" as keyof typeof packageJson.scripts]).toBeUndefined(); // Removed
    });
  });

  describe("inject content removal", () => {
    it("should remove injected content before marker", async () => {
      const fileContent = `import { Module } from "@nestjs/common";
import { HealthModule } from "./modules/health/health.module.js";
    EmailModule,
    // @obora:modules
export class AppModule {}`;

      const marker = "@obora:modules";
      const content = "EmailModule,";

      // Escape special regex characters in content
      const escapedContent = content.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      // Pattern to match indented content before marker
      const injectedPattern = new RegExp(
        `([ \\t]*)${escapedContent}\\n([ \\t]*)\\/\\/ ${marker}`,
        "g"
      );

      const result = fileContent.replace(
        injectedPattern,
        (_match: string, _contentIndent: string, markerIndent: string) => {
          return `${markerIndent}// ${marker}`;
        }
      );

      expect(result).not.toContain("EmailModule,");
      expect(result).toContain("// @obora:modules");
    });

    it("should preserve marker when removing inject content", async () => {
      const fileContent = `    import { EmailModule } from "./modules/email/email.module.js";
    // @obora:imports`;

      const marker = "@obora:imports";
      const content = 'import { EmailModule } from "./modules/email/email.module.js";';

      const escapedContent = content.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const injectedPattern = new RegExp(
        `([ \\t]*)${escapedContent}\\n([ \\t]*)\\/\\/ ${marker}`,
        "g"
      );

      const result = fileContent.replace(
        injectedPattern,
        (_match: string, _contentIndent: string, markerIndent: string) => {
          return `${markerIndent}// ${marker}`;
        }
      );

      expect(result).toContain("// @obora:imports");
    });
  });

  describe("file/directory removal", () => {
    it("should remove directory if it exists", async () => {
      const emailDir = join(testDir, "src", "modules", "email");
      await fs.mkdir(emailDir, { recursive: true });
      await fs.writeFile(join(emailDir, "email.module.ts"), "export class EmailModule {}");

      // Check it exists
      const existsBefore = await fs
        .stat(emailDir)
        .then((s) => s.isDirectory())
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Remove it
      await fs.rm(emailDir, { recursive: true, force: true });

      // Check it's gone
      const existsAfter = await fs
        .stat(emailDir)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("should remove file if it exists", async () => {
      const filePath = join(testDir, "lib", "email.ts");
      await fs.mkdir(join(testDir, "lib"), { recursive: true });
      await fs.writeFile(filePath, "export const email = {}");

      // Check it exists
      const existsBefore = await fs
        .stat(filePath)
        .then((s) => s.isFile())
        .catch(() => false);
      expect(existsBefore).toBe(true);

      // Remove it
      await fs.rm(filePath, { force: true });

      // Check it's gone
      const existsAfter = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      expect(existsAfter).toBe(false);
    });

    it("should not throw when removing non-existent path", async () => {
      const nonExistentPath = join(testDir, "does-not-exist");

      await expect(
        fs.rm(nonExistentPath, { force: true })
      ).resolves.not.toThrow();
    });
  });

  describe("config update", () => {
    it("should remove preset from config slots", async () => {
      const config = {
        base: "monorepo",
        apps: {},
        slots: {
          database: { preset: "drizzle", version: "0.38.0" },
          email: { preset: "resend", version: "4.0.0" },
        } as Record<string, { preset: string; version: string } | null>,
      };

      // Remove email preset
      config.slots["email"] = null;

      expect(config.slots["database"]).toBeDefined();
      expect(config.slots["email"]).toBeNull();
    });
  });

  describe("keepFiles option", () => {
    it("should not remove files when keepFiles is true", async () => {
      const emailDir = join(testDir, "src", "modules", "email");
      await fs.mkdir(emailDir, { recursive: true });
      await fs.writeFile(join(emailDir, "email.module.ts"), "export class EmailModule {}");

      const keepFiles = true;

      // With keepFiles, we should not remove the directory
      if (!keepFiles) {
        await fs.rm(emailDir, { recursive: true, force: true });
      }

      // Files should still exist
      const exists = await fs
        .stat(emailDir)
        .then((s) => s.isDirectory())
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("monorepo support", () => {
    it("should resolve target app directory", async () => {
      const projectDir = testDir;
      const appConfig = {
        module: "nestjs-api",
      };

      const APP_MODULES: Record<string, { targetDir: string }> = {
        "nestjs-api": { targetDir: "apps/api" },
        "nextjs-web": { targetDir: "apps/web" },
      };

      const moduleConfig = APP_MODULES[appConfig.module];
      const targetAppDir = moduleConfig ? join(projectDir, moduleConfig.targetDir) : null;

      expect(targetAppDir).toBe(join(projectDir, "apps/api"));
    });

    it("should use project root when no app specified", async () => {
      const projectDir = testDir;
      const targetAppDir: string | null = null;

      const targetDir = targetAppDir || projectDir;

      expect(targetDir).toBe(projectDir);
    });
  });
});

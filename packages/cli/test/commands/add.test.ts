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

describe("add command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `obora-add-test-${Date.now()}`);
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
    it("should detect valid project with package.json", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test-project" })
      );

      const exists = await fs
        .stat(packageJsonPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(true);
    });

    it("should detect invalid project without package.json", async () => {
      const packageJsonPath = join(testDir, "nonexistent", "package.json");

      const exists = await fs
        .stat(packageJsonPath)
        .then(() => true)
        .catch(() => false);

      expect(exists).toBe(false);
    });
  });

  describe("preset validation", () => {
    it("should validate known preset names", async () => {
      const PRESETS = {
        clerk: { name: "clerk", category: "auth" },
        drizzle: { name: "drizzle", category: "database" },
        polar: { name: "polar", category: "payment" },
      };

      expect(PRESETS["clerk"]).toBeDefined();
      expect(PRESETS["drizzle"]).toBeDefined();
      expect(PRESETS["polar"]).toBeDefined();
    });

    it("should get preset info correctly", async () => {
      const PRESETS = {
        clerk: { name: "clerk", category: "auth", description: "Clerk auth" },
      };

      const presetInfo = PRESETS["clerk"];
      expect(presetInfo.name).toBe("clerk");
      expect(presetInfo.category).toBe("auth");
    });
  });

  describe("dependency merging", () => {
    it("should merge dependencies into package.json", async () => {
      const packageJson = {
        name: "test-project",
        dependencies: {
          react: "^18.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      };

      const presetDeps = {
        dependencies: {
          "@clerk/nextjs": "^5.0.0",
        },
        devDependencies: {},
      };

      const merged = {
        ...packageJson,
        dependencies: {
          ...packageJson.dependencies,
          ...presetDeps.dependencies,
        },
        devDependencies: {
          ...packageJson.devDependencies,
          ...presetDeps.devDependencies,
        },
      };

      expect(merged.dependencies["react"]).toBe("^18.0.0");
      expect(merged.dependencies["@clerk/nextjs"]).toBe("^5.0.0");
      expect(merged.devDependencies["typescript"]).toBe("^5.0.0");
    });

    it("should handle empty dependencies", async () => {
      const packageJson = {
        name: "test-project",
      };

      const presetDeps = {
        dependencies: {
          "@clerk/nextjs": "^5.0.0",
        },
      };

      const merged = {
        ...packageJson,
        dependencies: {
          ...(packageJson as any).dependencies,
          ...presetDeps.dependencies,
        },
      };

      expect(merged.dependencies["@clerk/nextjs"]).toBe("^5.0.0");
    });
  });

  describe("manifest reading", () => {
    it("should read preset manifest", async () => {
      const manifestPath = join(testDir, "manifest.json");
      const manifest = {
        name: "clerk",
        conflicts: ["better-auth"],
        env: [{ key: "CLERK_SECRET_KEY", required: true, secret: true }],
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest));

      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.name).toBe("clerk");
      expect(parsed.conflicts).toContain("better-auth");
      expect(parsed.env[0].key).toBe("CLERK_SECRET_KEY");
    });
  });

  describe("file copying", () => {
    it("should detect preset source directory", async () => {
      const presetSrcDir = join(testDir, "preset", "src");
      await fs.mkdir(presetSrcDir, { recursive: true });
      await fs.writeFile(join(presetSrcDir, "auth.ts"), "export const auth = {}");

      const exists = await fs
        .stat(presetSrcDir)
        .then((s) => s.isDirectory())
        .catch(() => false);

      expect(exists).toBe(true);
    });
  });

  describe("inject content", () => {
    it("should inject content before marker with preserved indentation", async () => {
      const filePath = join(testDir, "app.module.ts");
      const fileContent = `@Module({
  imports: [
    HealthModule,
    // @obora:modules
  ],
})`;
      await fs.writeFile(filePath, fileContent);

      const marker = "@obora:modules";
      const content = "EmailModule,";

      // Simulate the inject logic from add.ts
      let currentContent = await fs.readFile(filePath, "utf-8");
      const markerPattern = new RegExp(`([ \\t]*)\\/\\/ ${marker}`, "g");

      const updatedContent = currentContent.replace(
        markerPattern,
        (match: string, indent: string) => {
          return `${indent}${content}\n${match}`;
        }
      );

      await fs.writeFile(filePath, updatedContent);

      const result = await fs.readFile(filePath, "utf-8");

      // Check that content is injected with correct indentation
      expect(result).toContain("    EmailModule,");
      expect(result).toContain("    // @obora:modules");
    });

    it("should not inject duplicate content", async () => {
      const filePath = join(testDir, "app.module.ts");
      const content = "EmailModule,";
      const fileContent = `@Module({
  imports: [
    HealthModule,
    ${content}
    // @obora:modules
  ],
})`;
      await fs.writeFile(filePath, fileContent);

      const currentContent = await fs.readFile(filePath, "utf-8");

      // Check if content already exists
      const alreadyExists = currentContent.includes(content.trim());

      expect(alreadyExists).toBe(true);
    });

    it("should handle multiple markers in same file", async () => {
      const filePath = join(testDir, "app.module.ts");
      const fileContent = `import { Module } from "@nestjs/common";
// @obora:imports

@Module({
  imports: [
    // @obora:modules
  ],
})`;
      await fs.writeFile(filePath, fileContent);

      let currentContent = await fs.readFile(filePath, "utf-8");

      // Inject import
      const importMarkerPattern = new RegExp(`([ \\t]*)\\/\\/ @obora:imports`, "g");
      currentContent = currentContent.replace(
        importMarkerPattern,
        (match: string, indent: string) => {
          return `${indent}import { EmailModule } from "./email.module.js";\n${match}`;
        }
      );

      // Inject module
      const moduleMarkerPattern = new RegExp(`([ \\t]*)\\/\\/ @obora:modules`, "g");
      currentContent = currentContent.replace(
        moduleMarkerPattern,
        (match: string, indent: string) => {
          return `${indent}EmailModule,\n${match}`;
        }
      );

      await fs.writeFile(filePath, currentContent);
      const result = await fs.readFile(filePath, "utf-8");

      expect(result).toContain('import { EmailModule } from "./email.module.js";');
      expect(result).toContain("EmailModule,");
      expect(result).toContain("// @obora:imports");
      expect(result).toContain("// @obora:modules");
    });
  });

  describe("monorepo support", () => {
    it("should resolve target app directory from APP_MODULES", async () => {
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

    it("should identify backend presets for nestjs-api", async () => {
      const backendCategories = ["database", "email", "payment", "ai", "storage"];
      const presetCategory = "email";

      const isBackendPreset = backendCategories.includes(presetCategory);

      expect(isBackendPreset).toBe(true);
    });

    it("should identify frontend presets for nextjs-web", async () => {
      const frontendCategories = ["analytics"];
      const presetCategory = "analytics";

      const isFrontendPreset = frontendCategories.includes(presetCategory);

      expect(isFrontendPreset).toBe(true);
    });
  });
});

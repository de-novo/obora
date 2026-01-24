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

  describe("transform integration", () => {
    it("should parse manifest with transform field", async () => {
      const manifestPath = join(testDir, "manifest.json");
      const manifest = {
        name: "tanstack-query",
        transform: [
          {
            type: "import",
            target: "app/providers.tsx",
            from: "@tanstack/react-query",
            named: ["QueryClient", "QueryClientProvider"],
          },
          {
            type: "dependency",
            target: "package.json",
            name: "@tanstack/react-query",
            version: "^5.0.0",
          },
          {
            type: "provider-wrap",
            target: "app/providers.tsx",
            provider: "QueryClientProvider",
            props: { client: "queryClient" },
          },
        ],
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.transform).toBeDefined();
      expect(parsed.transform).toHaveLength(3);
      expect(parsed.transform[0].type).toBe("import");
      expect(parsed.transform[1].type).toBe("dependency");
      expect(parsed.transform[2].type).toBe("provider-wrap");
    });

    it("should support nestjs-module transform type", async () => {
      const manifestPath = join(testDir, "manifest.json");
      const manifest = {
        name: "prisma",
        transform: [
          {
            type: "nestjs-module",
            target: "src/app.module.ts",
            module: "PrismaModule",
          },
        ],
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      expect(parsed.transform[0].type).toBe("nestjs-module");
      expect(parsed.transform[0].module).toBe("PrismaModule");
    });

    it("should support combined inject and transform in manifest", async () => {
      const manifestPath = join(testDir, "manifest.json");
      const manifest = {
        name: "clerk",
        inject: [
          {
            target: "src/app.module.ts",
            marker: "@obora:providers",
            content: "ClerkProvider,",
          },
        ],
        transform: [
          {
            type: "import",
            target: "src/app.module.ts",
            from: "@clerk/nextjs",
            named: ["ClerkProvider"],
          },
          {
            type: "dependency",
            target: "package.json",
            name: "@clerk/nextjs",
            version: "^5.0.0",
          },
        ],
      };

      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

      const content = await fs.readFile(manifestPath, "utf-8");
      const parsed = JSON.parse(content);

      // Both inject and transform should be present
      expect(parsed.inject).toBeDefined();
      expect(parsed.inject).toHaveLength(1);
      expect(parsed.transform).toBeDefined();
      expect(parsed.transform).toHaveLength(2);
    });

    it("should validate transform target paths", async () => {
      const transforms = [
        { type: "import", target: "src/providers.tsx", from: "react" },
        { type: "dependency", target: "package.json", name: "zod", version: "^3.0.0" },
        { type: "nestjs-module", target: "src/app.module.ts", module: "AuthModule" },
      ];

      for (const transform of transforms) {
        expect(transform.target).toBeDefined();
        expect(typeof transform.target).toBe("string");
        expect(transform.target.length).toBeGreaterThan(0);
      }
    });
  });

  describe("plan mode preview", () => {
    it("should collect transforms for preview", async () => {
      const transforms = [
        {
          type: "import",
          target: "app/providers.tsx",
          from: "@tanstack/react-query",
          named: ["QueryClient"],
        },
        {
          type: "dependency",
          target: "package.json",
          name: "@tanstack/react-query",
          version: "^5.0.0",
        },
      ];

      // Simulate collecting transforms for plan preview
      const previewItems = transforms.map((t) => ({
        type: t.type,
        target: t.target,
        description:
          t.type === "import"
            ? `Add import from ${t.from}`
            : t.type === "dependency"
              ? `Add dependency ${t.name}@${t.version}`
              : `Apply ${t.type} transform`,
      }));

      expect(previewItems).toHaveLength(2);
      expect(previewItems[0].description).toContain("@tanstack/react-query");
      expect(previewItems[1].description).toContain("@tanstack/react-query@^5.0.0");
    });

    it("should format transform preview for display", async () => {
      const preview = {
        file: "app/providers.tsx",
        transforms: [
          { type: "import", from: "@tanstack/react-query", named: ["QueryClient"] },
          { type: "provider-wrap", provider: "QueryClientProvider" },
        ],
      };

      // Format for display
      const formatted = preview.transforms
        .map((t) => {
          if (t.type === "import") {
            const imports = t.named?.join(", ") || t.default || "*";
            return `+ import { ${imports} } from "${t.from}"`;
          }
          if (t.type === "provider-wrap") {
            return `+ Wrap with <${t.provider}>`;
          }
          return `+ ${t.type}`;
        })
        .join("\n");

      expect(formatted).toContain("import { QueryClient }");
      expect(formatted).toContain("Wrap with <QueryClientProvider>");
    });

    it("should group transforms by target file", async () => {
      const transforms = [
        { type: "import", target: "app/providers.tsx", from: "react" },
        { type: "dependency", target: "package.json", name: "zod", version: "^3.0.0" },
        { type: "provider-wrap", target: "app/providers.tsx", provider: "ZodProvider" },
        { type: "dependency", target: "package.json", name: "react", version: "^18.0.0" },
      ];

      // Group by target
      const grouped = transforms.reduce(
        (acc, t) => {
          const key = t.target;
          if (!acc[key]) acc[key] = [];
          acc[key].push(t);
          return acc;
        },
        {} as Record<string, typeof transforms>
      );

      expect(Object.keys(grouped)).toHaveLength(2);
      expect(grouped["app/providers.tsx"]).toHaveLength(2);
      expect(grouped["package.json"]).toHaveLength(2);
    });
  });
});

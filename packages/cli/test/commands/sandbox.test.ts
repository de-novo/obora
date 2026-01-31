import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

// ============================================================================
// Test Configuration - Mirroring sandbox.ts types and logic
// ============================================================================

interface CategoryConfig {
  name: string;
  description: string;
  exclusive: boolean;
}

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  linting: { name: "linting", description: "Linting & Formatting", exclusive: true },
  database: { name: "database", description: "Database & ORM", exclusive: true },
  auth: { name: "auth", description: "Authentication", exclusive: true },
  api: { name: "api", description: "API Framework", exclusive: false },
  payment: { name: "payment", description: "Payment Processing", exclusive: true },
  analytics: { name: "analytics", description: "Analytics & Tracking", exclusive: false },
  "data-fetching": { name: "data-fetching", description: "Data Fetching", exclusive: false },
  state: { name: "state", description: "State Management", exclusive: false },
  i18n: { name: "i18n", description: "Internationalization", exclusive: false },
  theming: { name: "theming", description: "Themes & Color Modes", exclusive: false },
  ui: { name: "ui", description: "UI Components", exclusive: false },
  email: { name: "email", description: "Email Service", exclusive: true },
  ai: { name: "ai", description: "AI Integration", exclusive: false },
  storage: { name: "storage", description: "File Storage", exclusive: true },
  validation: { name: "validation", description: "Schema Validation", exclusive: true },
  testing: { name: "testing", description: "Testing Framework", exclusive: true },
  form: { name: "form", description: "Form Handling", exclusive: false },
};

type Category = keyof typeof CATEGORY_CONFIGS;

// Simulated APP_MODULES for testing
const APP_MODULES: Record<string, { targetDir: string; slots: string[] }> = {
  "nextjs-web": { targetDir: "apps/web", slots: ["linting", "auth", "database"] },
  "nestjs-api": { targetDir: "apps/api", slots: ["linting", "database"] },
  "shared-database": { targetDir: "packages/database", slots: ["database"] },
};

const APP_MODULE_NAMES = Object.keys(APP_MODULES);

type AppModuleName = keyof typeof APP_MODULES;

interface AppModuleInstance {
  name: string;
  module: AppModuleName;
  targetDir: string;
}

interface PresetInfo {
  name: string;
  category: Category;
  version: string;
}

// Simulated PRESETS for testing
const PRESETS: Record<string, PresetInfo> = {
  clerk: { name: "clerk", category: "auth", version: "1.0.0" },
  drizzle: { name: "drizzle", category: "database", version: "1.0.0" },
  prisma: { name: "prisma", category: "database", version: "1.0.0" },
  biome: { name: "biome", category: "linting", version: "1.0.0" },
  "tanstack-query": { name: "tanstack-query", category: "data-fetching", version: "1.0.0" },
  "next-intl": { name: "next-intl", category: "i18n", version: "1.0.0" },
  "next-themes": { name: "next-themes", category: "theming", version: "1.0.0" },
  zustand: { name: "zustand", category: "state", version: "1.0.0" },
};

// Preset aliases
const PRESET_ALIASES: Record<string, string> = {
  "clerk-nextjs": "clerk",
};

function resolvePresetName(presetName: string): string {
  return PRESET_ALIASES[presetName] ?? presetName;
}

// ============================================================================
// Functions from sandbox.ts (copied for testing)
// ============================================================================

function defaultAppInstance(moduleName: AppModuleName, base: "single" | "monorepo"): AppModuleInstance {
  const moduleConfig = APP_MODULES[moduleName as string];
  const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
  const targetDir = base === "single"
    ? "."
    : (moduleConfig?.targetDir?.startsWith("packages/")
      ? join("packages", defaultName)
      : join("apps", defaultName));
  return { name: defaultName, module: moduleName, targetDir };
}

function normalizeApps(
  apps: string[] | undefined,
  base: "single" | "monorepo"
): AppModuleInstance[] {
  if (!apps || apps.length === 0) {
    return [];
  }
  const normalized: AppModuleInstance[] = [];
  for (const app of apps) {
    const separator = app.includes(":") ? ":" : app.includes("=") ? "=" : null;
    const [rawModule, rawName] = separator ? app.split(separator) : [app, ""];
    const moduleName = rawModule.trim();
    if (APP_MODULE_NAMES.includes(moduleName)) {
      const moduleConfig = APP_MODULES[moduleName];
      const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
      const name = rawName?.trim() || defaultName;
      const targetDir = base === "single"
        ? "."
        : (moduleConfig?.targetDir?.startsWith("packages/")
          ? join("packages", name)
          : join("apps", name));
      normalized.push({ name, module: moduleName as AppModuleName, targetDir });
    } else {
      throw new Error(`Unknown app module: ${app}`);
    }
  }
  return normalized;
}

function emptyPresetSelection(): Record<Category, { preset: string; version: string } | null> {
  const selection = {} as Record<Category, { preset: string; version: string } | null>;
  for (const category of Object.keys(CATEGORY_CONFIGS) as Category[]) {
    selection[category] = null;
  }
  return selection;
}

function normalizePresets(
  presets: string[] | Record<string, string> | undefined
): Record<Category, { preset: string; version: string } | null> {
  const selection = emptyPresetSelection();
  if (!presets) {
    return selection;
  }

  const presetNames = Array.isArray(presets)
    ? presets
    : Object.values(presets);

  for (const rawName of presetNames) {
    const presetName = resolvePresetName(rawName);
    const info = PRESETS[presetName];
    if (!info) {
      throw new Error(`Unknown preset: ${presetName}`);
    }
    const category = info.category as Category;
    if (CATEGORY_CONFIGS[category]?.exclusive && selection[category]) {
      throw new Error(`Category "${category}" already has "${selection[category]!.preset}"`);
    }
    selection[category] = { preset: presetName, version: info.version };
  }

  return selection;
}

function deriveBestPracticeTargets(
  apps: AppModuleInstance[],
  presets: string[] | Record<string, string> | undefined
): Record<string, string> {
  const targets: Record<string, string> = {};
  if (!presets || apps.length === 0) {
    return targets;
  }
  const presetNames = Array.isArray(presets)
    ? presets
    : Object.values(presets);
  const normalized = new Set(presetNames.map((name) => resolvePresetName(name)));
  const hasNextjs = apps.some((app) => app.module === "nextjs-web");

  if (hasNextjs) {
    if (normalized.has("tanstack-query")) {
      targets["tanstack-query"] = "nextjs-auto";
    }
    if (normalized.has("next-intl")) {
      targets["next-intl"] = "nextjs-auto";
    }
    if (normalized.has("next-themes")) {
      targets["next-themes"] = "nextjs-auto";
    }
  }

  return targets;
}

interface SandboxCase {
  name?: string;
  base?: "single" | "monorepo";
  apps?: string[];
  presets?: string[] | Record<string, string>;
  presetTargets?: Record<string, string>;
  packageManager?: "pnpm" | "npm" | "yarn" | "bun";
}

async function loadCases(casesPath: string): Promise<SandboxCase[]> {
  if (!existsSync(casesPath)) {
    throw new Error(`Cases file not found: ${casesPath}`);
  }
  const raw = JSON.parse(await fs.readFile(casesPath, "utf-8"));
  if (Array.isArray(raw)) {
    return raw as SandboxCase[];
  }
  if (raw && Array.isArray(raw.cases)) {
    return raw.cases as SandboxCase[];
  }
  throw new Error("Invalid cases file format. Expected array or { cases: [] }");
}

// ============================================================================
// Tests
// ============================================================================

describe("sandbox command", () => {
  describe("defaultAppInstance", () => {
    it("should create default instance for single base", () => {
      const result = defaultAppInstance("nextjs-web", "single");
      expect(result.name).toBe("web");
      expect(result.module).toBe("nextjs-web");
      expect(result.targetDir).toBe(".");
    });

    it("should create default instance for monorepo base (apps/)", () => {
      const result = defaultAppInstance("nextjs-web", "monorepo");
      expect(result.name).toBe("web");
      expect(result.module).toBe("nextjs-web");
      expect(result.targetDir).toBe("apps/web");
    });

    it("should create default instance for monorepo base (packages/)", () => {
      const result = defaultAppInstance("shared-database", "monorepo");
      expect(result.name).toBe("database");
      expect(result.module).toBe("shared-database");
      expect(result.targetDir).toBe("packages/database");
    });
  });

  describe("normalizeApps", () => {
    it("should return empty array for undefined apps", () => {
      const result = normalizeApps(undefined, "single");
      expect(result).toEqual([]);
    });

    it("should return empty array for empty apps", () => {
      const result = normalizeApps([], "monorepo");
      expect(result).toEqual([]);
    });

    it("should normalize simple module names", () => {
      const result = normalizeApps(["nextjs-web", "nestjs-api"], "monorepo");
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        name: "web",
        module: "nextjs-web",
        targetDir: "apps/web",
      });
      expect(result[1]).toEqual({
        name: "api",
        module: "nestjs-api",
        targetDir: "apps/api",
      });
    });

    it("should handle colon separator for custom names", () => {
      const result = normalizeApps(["nextjs-web:frontend"], "monorepo");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "frontend",
        module: "nextjs-web",
        targetDir: "apps/frontend",
      });
    });

    it("should handle equals separator for custom names", () => {
      const result = normalizeApps(["nestjs-api=backend"], "monorepo");
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        name: "backend",
        module: "nestjs-api",
        targetDir: "apps/backend",
      });
    });

    it("should use current directory for single base", () => {
      const result = normalizeApps(["nextjs-web:myapp"], "single");
      expect(result[0].targetDir).toBe(".");
    });

    it("should throw for unknown module", () => {
      expect(() => normalizeApps(["unknown-module"], "single")).toThrow(
        "Unknown app module: unknown-module"
      );
    });
  });

  describe("emptyPresetSelection", () => {
    it("should create selection with all categories set to null", () => {
      const result = emptyPresetSelection();
      expect(Object.keys(result)).toEqual(Object.keys(CATEGORY_CONFIGS));
      for (const value of Object.values(result)) {
        expect(value).toBeNull();
      }
    });
  });

  describe("normalizePresets", () => {
    it("should return empty selection for undefined presets", () => {
      const result = normalizePresets(undefined);
      for (const value of Object.values(result)) {
        expect(value).toBeNull();
      }
    });

    it("should normalize array of preset names", () => {
      const result = normalizePresets(["clerk", "biome"]);
      expect(result.auth).toEqual({ preset: "clerk", version: "1.0.0" });
      expect(result.linting).toEqual({ preset: "biome", version: "1.0.0" });
      expect(result.database).toBeNull();
    });

    it("should normalize object of preset names", () => {
      const result = normalizePresets({
        auth: "clerk",
        linting: "biome",
      });
      expect(result.auth).toEqual({ preset: "clerk", version: "1.0.0" });
      expect(result.linting).toEqual({ preset: "biome", version: "1.0.0" });
    });

    it("should resolve preset aliases", () => {
      const result = normalizePresets(["clerk-nextjs"]);
      expect(result.auth).toEqual({ preset: "clerk", version: "1.0.0" });
    });

    it("should throw for unknown preset", () => {
      expect(() => normalizePresets(["unknown-preset"])).toThrow(
        "Unknown preset: unknown-preset"
      );
    });

    it("should throw for exclusive category conflict", () => {
      expect(() => normalizePresets(["drizzle", "prisma"])).toThrow(
        'Category "database" already has "drizzle"'
      );
    });

    it("should allow multiple non-exclusive presets", () => {
      const result = normalizePresets(["tanstack-query", "zustand"]);
      expect(result["data-fetching"]).toEqual({
        preset: "tanstack-query",
        version: "1.0.0",
      });
      expect(result.state).toEqual({ preset: "zustand", version: "1.0.0" });
    });
  });

  describe("deriveBestPracticeTargets", () => {
    it("should return empty targets for empty apps", () => {
      const result = deriveBestPracticeTargets([], ["tanstack-query"]);
      expect(result).toEqual({});
    });

    it("should return empty targets for undefined presets", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, undefined);
      expect(result).toEqual({});
    });

    it("should set nextjs-auto for tanstack-query when nextjs-web is present", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, ["tanstack-query"]);
      expect(result).toEqual({ "tanstack-query": "nextjs-auto" });
    });

    it("should set nextjs-auto for next-intl when nextjs-web is present", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, ["next-intl"]);
      expect(result).toEqual({ "next-intl": "nextjs-auto" });
    });

    it("should set nextjs-auto for next-themes when nextjs-web is present", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, ["next-themes"]);
      expect(result).toEqual({ "next-themes": "nextjs-auto" });
    });

    it("should set multiple targets for multiple nextjs presets", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, [
        "tanstack-query",
        "next-intl",
        "next-themes",
      ]);
      expect(result).toEqual({
        "tanstack-query": "nextjs-auto",
        "next-intl": "nextjs-auto",
        "next-themes": "nextjs-auto",
      });
    });

    it("should not set targets for non-nextjs apps", () => {
      const apps = normalizeApps(["nestjs-api"], "monorepo");
      const result = deriveBestPracticeTargets(apps, ["tanstack-query"]);
      expect(result).toEqual({});
    });

    it("should handle preset object format", () => {
      const apps = normalizeApps(["nextjs-web"], "monorepo");
      const result = deriveBestPracticeTargets(apps, {
        "data-fetching": "tanstack-query",
      });
      expect(result).toEqual({ "tanstack-query": "nextjs-auto" });
    });
  });

  describe("loadCases", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = join(tmpdir(), `obora-test-sandbox-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
    });

    afterEach(async () => {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    });

    it("should throw for non-existent file", async () => {
      await expect(loadCases(join(tempDir, "nonexistent.json"))).rejects.toThrow(
        "Cases file not found"
      );
    });

    it("should load array format", async () => {
      const casesPath = join(tempDir, "cases.json");
      const cases: SandboxCase[] = [
        { name: "case1", base: "single", apps: ["nextjs-web"] },
        { name: "case2", base: "monorepo", apps: ["nestjs-api"] },
      ];
      writeFileSync(casesPath, JSON.stringify(cases));

      const result = await loadCases(casesPath);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("case1");
      expect(result[1].name).toBe("case2");
    });

    it("should load object with cases array format", async () => {
      const casesPath = join(tempDir, "cases.json");
      const data = {
        cases: [
          { name: "case1", base: "single" },
          { name: "case2", base: "monorepo" },
        ],
      };
      writeFileSync(casesPath, JSON.stringify(data));

      const result = await loadCases(casesPath);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("case1");
    });

    it("should throw for invalid format", async () => {
      const casesPath = join(tempDir, "cases.json");
      writeFileSync(casesPath, JSON.stringify({ invalid: "format" }));

      await expect(loadCases(casesPath)).rejects.toThrow(
        "Invalid cases file format"
      );
    });

    it("should load cases with presets", async () => {
      const casesPath = join(tempDir, "cases.json");
      const cases: SandboxCase[] = [
        {
          name: "full-stack",
          base: "monorepo",
          apps: ["nextjs-web", "nestjs-api"],
          presets: ["clerk", "drizzle"],
          packageManager: "pnpm",
        },
      ];
      writeFileSync(casesPath, JSON.stringify(cases));

      const result = await loadCases(casesPath);
      expect(result[0].presets).toEqual(["clerk", "drizzle"]);
      expect(result[0].packageManager).toBe("pnpm");
    });

    it("should load cases with preset targets", async () => {
      const casesPath = join(tempDir, "cases.json");
      const cases: SandboxCase[] = [
        {
          name: "with-targets",
          apps: ["nextjs-web"],
          presets: ["tanstack-query"],
          presetTargets: { "tanstack-query": "nextjs-auto" },
        },
      ];
      writeFileSync(casesPath, JSON.stringify(cases));

      const result = await loadCases(casesPath);
      expect(result[0].presetTargets).toEqual({
        "tanstack-query": "nextjs-auto",
      });
    });
  });

  describe("resolvePresetName", () => {
    it("should resolve alias to canonical name", () => {
      expect(resolvePresetName("clerk-nextjs")).toBe("clerk");
    });

    it("should return original name if no alias", () => {
      expect(resolvePresetName("drizzle")).toBe("drizzle");
    });
  });
});

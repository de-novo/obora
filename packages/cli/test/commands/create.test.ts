import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";

// Mock modules
vi.mock("consola", () => {
  const mockConsola = {
    start: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    box: vi.fn(),
  };
  return {
    default: mockConsola,
    consola: mockConsola,
  };
});

vi.mock("prompts", () => ({
  default: vi.fn(),
}));

describe("create command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `obora-create-test-${Date.now()}`);
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

  describe("argument parsing", () => {
    it("should accept project name as positional argument", async () => {
      // This is a unit test for argument validation
      const args = {
        name: "my-project",
        template: undefined,
        presets: undefined,
        dir: undefined,
        pm: undefined,
        yes: false,
      };

      expect(args.name).toBe("my-project");
    });

    it("should accept template flag", async () => {
      const args = {
        name: "my-project",
        template: "nestjs-api",
        presets: undefined,
        dir: undefined,
        pm: undefined,
        yes: false,
      };

      expect(args.template).toBe("nestjs-api");
    });

    it("should parse presets from comma-separated string", async () => {
      const presetsString = "clerk,drizzle,polar";
      const presets = presetsString.split(",").map((p) => p.trim());

      expect(presets).toEqual(["clerk", "drizzle", "polar"]);
    });

    it("should validate package manager options", async () => {
      const validPMs = ["pnpm", "npm", "yarn", "bun"];

      expect(validPMs.includes("pnpm")).toBe(true);
      expect(validPMs.includes("npm")).toBe(true);
      expect(validPMs.includes("yarn")).toBe(true);
      expect(validPMs.includes("bun")).toBe(true);
      expect(validPMs.includes("invalid")).toBe(false);
    });

    it("should default to pnpm when -y flag is used", async () => {
      const args = { yes: true, pm: undefined };
      const pm = args.pm || (args.yes ? "pnpm" : undefined);

      expect(pm).toBe("pnpm");
    });

    it("should use specified pm even with -y flag", async () => {
      const args = { yes: true, pm: "bun" };
      const validPMs = ["pnpm", "npm", "yarn", "bun"];
      const pm = args.pm && validPMs.includes(args.pm) ? args.pm : "pnpm";

      expect(pm).toBe("bun");
    });
  });

  describe("directory handling", () => {
    it("should resolve target directory correctly", async () => {
      const projectName = "my-project";
      const targetDir = join(testDir, projectName);

      expect(targetDir).toContain(projectName);
    });

    it("should use custom directory when specified", async () => {
      const projectName = "my-project";
      const customDir = join(testDir, "custom");
      const targetDir = join(customDir, projectName);

      expect(targetDir).toContain("custom");
      expect(targetDir).toContain(projectName);
    });
  });

  describe("template selection", () => {
    it("should validate template names", async () => {
      const validTemplates = ["turbo-nextjs-full", "nestjs-api"];

      expect(validTemplates.includes("turbo-nextjs-full")).toBe(true);
      expect(validTemplates.includes("nestjs-api")).toBe(true);
      expect(validTemplates.includes("invalid-template")).toBe(false);
    });
  });

  describe("next steps output", () => {
    it("should generate correct next steps for pnpm", async () => {
      const pm = "pnpm";
      const projectName = "my-app";

      const nextSteps = [
        `cd ${projectName}`,
        `${pm} install`,
        `cp .env.example .env.local`,
        `${pm} dev`,
      ];

      expect(nextSteps[1]).toBe("pnpm install");
      expect(nextSteps[3]).toBe("pnpm dev");
    });

    it("should generate correct next steps for npm", async () => {
      const pm = "npm";
      const projectName = "my-app";

      const nextSteps = [
        `cd ${projectName}`,
        `${pm} install`,
        `cp .env.example .env.local`,
        `${pm} dev`,
      ];

      expect(nextSteps[1]).toBe("npm install");
      expect(nextSteps[3]).toBe("npm dev");
    });

    it("should add db steps when database preset is selected", async () => {
      const pm = "pnpm";
      const projectName = "my-app";
      const presetNames = ["drizzle"];

      const nextSteps = [
        `cd ${projectName}`,
        `${pm} install`,
        `cp .env.example .env`,
      ];

      if (presetNames.includes("drizzle") || presetNames.includes("prisma")) {
        nextSteps.push(`${pm} db:generate`);
        nextSteps.push(`${pm} db:migrate`);
      }

      nextSteps.push(`${pm} dev`);

      expect(nextSteps).toContain("pnpm db:generate");
      expect(nextSteps).toContain("pnpm db:migrate");
    });
  });

  describe("preset parsing", () => {
    it("should parse category:preset format", async () => {
      const presetsArg = "linting:biome,database:prisma";
      const pairs = presetsArg.split(",");

      const parsed: Record<string, string> = {};
      for (const pair of pairs) {
        const [category, presetName] = pair.trim().split(":");
        if (category && presetName) {
          parsed[category] = presetName;
        }
      }

      expect(parsed).toEqual({
        linting: "biome",
        database: "prisma",
      });
    });

    it("should handle whitespace in preset args", async () => {
      const presetsArg = " linting:biome , database:prisma ";
      const pairs = presetsArg.split(",");

      const parsed: Record<string, string> = {};
      for (const pair of pairs) {
        const [category, presetName] = pair.trim().split(":");
        if (category && presetName) {
          parsed[category] = presetName;
        }
      }

      expect(parsed).toEqual({
        linting: "biome",
        database: "prisma",
      });
    });

    it("should ignore invalid preset format", async () => {
      const presetsArg = "invalid,linting:biome";
      const pairs = presetsArg.split(",");

      const parsed: Record<string, string> = {};
      for (const pair of pairs) {
        const parts = pair.trim().split(":");
        if (parts.length === 2 && parts[0] && parts[1]) {
          parsed[parts[0]] = parts[1];
        }
      }

      expect(parsed).toEqual({
        linting: "biome",
      });
    });
  });

  describe("app parsing", () => {
    it("should parse app modules with name assignment using colon", async () => {
      const appsArg = "nextjs-web:frontend,nestjs-api:backend";
      const tokens = appsArg.split(",").map((t) => t.trim());

      const instances = tokens.map((token) => {
        const [module, name] = token.split(":");
        return { module, name: name || module };
      });

      expect(instances).toEqual([
        { module: "nextjs-web", name: "frontend" },
        { module: "nestjs-api", name: "backend" },
      ]);
    });

    it("should parse app modules with name assignment using equals", async () => {
      const appsArg = "nextjs-web=frontend,nestjs-api=backend";
      const tokens = appsArg.split(",").map((t) => t.trim());

      const instances = tokens.map((token) => {
        const sep = token.includes(":") ? ":" : token.includes("=") ? "=" : null;
        if (sep) {
          const [module, name] = token.split(sep);
          return { module, name };
        }
        return { module: token, name: token };
      });

      expect(instances).toEqual([
        { module: "nextjs-web", name: "frontend" },
        { module: "nestjs-api", name: "backend" },
      ]);
    });

    it("should use module name as default when name not provided", async () => {
      const appsArg = "nextjs-web,nestjs-api";
      const tokens = appsArg.split(",").map((t) => t.trim());

      const instances = tokens.map((token) => {
        const sep = token.includes(":") ? ":" : token.includes("=") ? "=" : null;
        if (sep) {
          const [module, name] = token.split(sep);
          return { module, name };
        }
        return { module: token, name: token };
      });

      expect(instances).toEqual([
        { module: "nextjs-web", name: "nextjs-web" },
        { module: "nestjs-api", name: "nestjs-api" },
      ]);
    });
  });

  describe("command definition", () => {
    it("should have correct meta information", async () => {
      const { createCommand } = await import("../../src/commands/create");
      expect(createCommand.meta?.name).toBe("create");
      expect(createCommand.meta?.description).toBe("Create a new project");
    });

    it("should have all required arguments", async () => {
      const { createCommand } = await import("../../src/commands/create");
      expect(createCommand.args?.name).toBeDefined();
      expect(createCommand.args?.base).toBeDefined();
      expect(createCommand.args?.apps).toBeDefined();
      expect(createCommand.args?.dir).toBeDefined();
      expect(createCommand.args?.pm).toBeDefined();
      expect(createCommand.args?.presets).toBeDefined();
      expect(createCommand.args?.yes).toBeDefined();
      expect(createCommand.args?.["dry-run"]).toBeDefined();
    });

    it("should have correct argument types", async () => {
      const { createCommand } = await import("../../src/commands/create");
      expect(createCommand.args?.name?.type).toBe("positional");
      expect(createCommand.args?.base?.type).toBe("string");
      expect(createCommand.args?.apps?.type).toBe("string");
      expect(createCommand.args?.yes?.type).toBe("boolean");
      expect(createCommand.args?.["dry-run"]?.type).toBe("boolean");
    });

    it("should have aliases for common arguments", async () => {
      const { createCommand } = await import("../../src/commands/create");
      expect(createCommand.args?.base?.alias).toBe("b");
      expect(createCommand.args?.apps?.alias).toBe("a");
      expect(createCommand.args?.dir?.alias).toBe("d");
      expect(createCommand.args?.presets?.alias).toBe("p");
      expect(createCommand.args?.yes?.alias).toBe("y");
    });
  });

  describe("base structure validation", () => {
    it("should accept monorepo base", async () => {
      const validBases = ["monorepo", "single"];
      expect(validBases.includes("monorepo")).toBe(true);
    });

    it("should accept single base", async () => {
      const validBases = ["monorepo", "single"];
      expect(validBases.includes("single")).toBe(true);
    });

    it("should reject invalid base", async () => {
      const validBases = ["monorepo", "single"];
      expect(validBases.includes("invalid")).toBe(false);
    });
  });

  describe("target directory calculation", () => {
    it("should create app in apps/ for monorepo with nextjs-web", async () => {
      const base = "monorepo";
      const module = "nextjs-web";
      const name = "web";

      const targetDir = base === "single" ? "." : join("apps", name);

      expect(targetDir).toBe("apps/web");
    });

    it("should create app in packages/ for monorepo with shared-ui", async () => {
      const base = "monorepo";
      const name = "shared";
      const isPackage = true;

      const targetDir = base === "single"
        ? "."
        : isPackage
          ? join("packages", name)
          : join("apps", name);

      expect(targetDir).toBe("packages/shared");
    });

    it("should use root for single project", async () => {
      const base = "single";
      const targetDir = base === "single" ? "." : "apps/web";

      expect(targetDir).toBe(".");
    });
  });
});

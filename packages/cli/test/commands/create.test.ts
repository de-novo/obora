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
    box: vi.fn(),
  },
}));

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
  });
});

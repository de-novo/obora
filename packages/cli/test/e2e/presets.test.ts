import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";
import { assembleProject, type AppModuleInstance } from "../../src/utils/assembler";
import { fileExists, readJson } from "../../src/utils/fs";

describe("E2E: Preset Combinations", () => {
  let testDir: string;
  const buildAppInstances = (
    modules: Array<"nestjs-api" | "nextjs-web">,
    base: "single" | "monorepo"
  ): AppModuleInstance[] => {
    return modules.map((module) => {
      const name = module === "nestjs-api" ? "api" : "web";
      const targetDir = base === "single" ? "." : `apps/${name}`;
      return { name, module, targetDir };
    });
  };

  beforeEach(async () => {
    testDir = join(tmpdir(), `obora-e2e-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Monorepo: nestjs-api + nextjs-web", () => {
    it("should assemble with drizzle + clerk", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          database: { preset: "drizzle", version: "0.45.0" },
          auth: { preset: "clerk", version: "1.25.0" },
        },
        packageManager: "pnpm",
      });

      // Verify directory structure
      expect(await fileExists(join(projectDir, "package.json"))).toBe(true);
      expect(await fileExists(join(projectDir, "apps/api/package.json"))).toBe(true);
      expect(await fileExists(join(projectDir, "apps/web/package.json"))).toBe(true);

      // Verify drizzle files in API
      expect(await fileExists(join(projectDir, "apps/api/src/db/client.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "apps/api/src/db/schema.ts"))).toBe(true);

      // Verify clerk files in API
      expect(await fileExists(join(projectDir, "apps/api/src/modules/auth/auth.module.ts"))).toBe(true);

      // Verify biome config at root
      expect(await fileExists(join(projectDir, "biome.json"))).toBe(true);

      // Verify dependencies
      const apiPkg = await readJson<any>(join(projectDir, "apps/api/package.json"));
      expect(apiPkg.dependencies["drizzle-orm"]).toBeDefined();
      expect(apiPkg.dependencies["@clerk/backend"]).toBeDefined();
    });

    it("should assemble with prisma + polar + resend", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          database: { preset: "prisma", version: "7.0.0" },
          payment: { preset: "polar", version: "1.0.0" },
          email: { preset: "resend", version: "4.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify prisma files
      expect(await fileExists(join(projectDir, "apps/api/prisma/schema.prisma"))).toBe(true);

      // Verify polar payment module
      expect(await fileExists(join(projectDir, "apps/api/src/modules/payment/payment.service.ts"))).toBe(true);

      // Verify resend email module
      expect(await fileExists(join(projectDir, "apps/api/src/modules/email/email.service.ts"))).toBe(true);

      // Verify dependencies (prisma uses @prisma/adapter-pg, not @prisma/client)
      const apiPkg = await readJson<any>(join(projectDir, "apps/api/package.json"));
      expect(apiPkg.dependencies["@prisma/adapter-pg"]).toBeDefined();
      expect(apiPkg.dependencies["@polar-sh/sdk"]).toBeDefined();
      expect(apiPkg.dependencies["resend"]).toBeDefined();
    });

    it("should assemble with paddle payment preset", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          database: { preset: "drizzle", version: "0.45.0" },
          payment: { preset: "paddle", version: "1.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify paddle payment module
      expect(await fileExists(join(projectDir, "apps/api/src/modules/payment/payment.service.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "apps/api/src/modules/payment/payment.controller.ts"))).toBe(true);

      // Verify dependencies
      const apiPkg = await readJson<any>(join(projectDir, "apps/api/package.json"));
      expect(apiPkg.dependencies["@paddle/paddle-node-sdk"]).toBeDefined();
    });

    it("should assemble with analytics presets (umami)", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          analytics: { preset: "umami", version: "2.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify analytics only in web app (nextjs-web has analytics slot)
      expect(await fileExists(join(projectDir, "apps/web/src/lib/analytics/index.ts"))).toBe(true);

      // API should NOT have analytics
      expect(await fileExists(join(projectDir, "apps/api/src/lib/analytics/index.ts"))).toBe(false);
    });

    it("should assemble with storage preset (uploadthing)", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          storage: { preset: "uploadthing", version: "7.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify storage only in API (nestjs-api has storage slot)
      expect(await fileExists(join(projectDir, "apps/api/src/modules/storage/storage.module.ts"))).toBe(true);

      // Web should NOT have storage module
      expect(await fileExists(join(projectDir, "apps/web/src/modules/storage/storage.module.ts"))).toBe(false);
    });

    it("should assemble with AI preset (vercel-ai)", async () => {
      const projectDir = join(testDir, "test-project");

      await assembleProject({
        base: "monorepo",
        projectName: "test-project",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          ai: { preset: "vercel-ai", version: "4.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify AI module in API
      expect(await fileExists(join(projectDir, "apps/api/src/modules/ai/ai.module.ts"))).toBe(true);

      // Verify dependencies
      const apiPkg = await readJson<any>(join(projectDir, "apps/api/package.json"));
      expect(apiPkg.dependencies["ai"]).toBeDefined();
    });
  });

  describe("Single: nestjs-api only", () => {
    it("should assemble single NestJS API with drizzle + clerk", async () => {
      const projectDir = join(testDir, "test-api");

      await assembleProject({
        base: "single",
        projectName: "test-api",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api"], "single"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          database: { preset: "drizzle", version: "0.45.0" },
          auth: { preset: "clerk", version: "1.25.0" },
        },
        packageManager: "pnpm",
      });

      // Verify single project structure (no apps/ directory)
      expect(await fileExists(join(projectDir, "package.json"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/main.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "apps"))).toBe(false);

      // Verify presets at root
      expect(await fileExists(join(projectDir, "src/db/client.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/auth/auth.module.ts"))).toBe(true);

      // Verify dependencies
      const pkg = await readJson<any>(join(projectDir, "package.json"));
      expect(pkg.dependencies["drizzle-orm"]).toBeDefined();
      expect(pkg.dependencies["@clerk/backend"]).toBeDefined();
    });

    it("should assemble single NestJS API with full stack", async () => {
      const projectDir = join(testDir, "test-api");

      await assembleProject({
        base: "single",
        projectName: "test-api",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api"], "single"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          database: { preset: "prisma", version: "7.0.0" },
          auth: { preset: "clerk", version: "1.25.0" },
          payment: { preset: "polar", version: "1.0.0" },
          email: { preset: "resend", version: "4.0.0" },
          storage: { preset: "uploadthing", version: "7.0.0" },
          ai: { preset: "vercel-ai", version: "4.0.0" },
          validation: { preset: "effect-schema", version: "3.19.0" },
        },
        packageManager: "pnpm",
      });

      // Verify all modules exist
      expect(await fileExists(join(projectDir, "prisma/schema.prisma"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/auth/auth.module.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/payment/payment.service.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/email/email.service.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/storage/storage.module.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/modules/ai/ai.module.ts"))).toBe(true);
    });
  });

  describe("Single: nextjs-web only", () => {
    it("should assemble single Next.js web with clerk-nextjs + umami", async () => {
      const projectDir = join(testDir, "test-web");

      await assembleProject({
        base: "single",
        projectName: "test-web",
        targetDir: projectDir,
        apps: buildAppInstances(["nextjs-web"], "single"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
          auth: { preset: "clerk-nextjs", version: "6.0.0" },
          analytics: { preset: "umami", version: "2.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify single project structure (Next.js uses app/ not src/app/)
      expect(await fileExists(join(projectDir, "package.json"))).toBe(true);
      expect(await fileExists(join(projectDir, "app/layout.tsx"))).toBe(true);

      // Verify clerk-nextjs files
      expect(await fileExists(join(projectDir, "middleware.ts"))).toBe(true);
      expect(await fileExists(join(projectDir, "src/lib/auth/index.ts"))).toBe(true);

      // Verify analytics (copied to src/lib/analytics per manifest)
      expect(await fileExists(join(projectDir, "src/lib/analytics/index.ts"))).toBe(true);

      // Verify dependencies
      const pkg = await readJson<any>(join(projectDir, "package.json"));
      expect(pkg.dependencies["@clerk/nextjs"]).toBeDefined();
    });
  });

  describe("Environment Variables", () => {
    it("should add env variables from presets", async () => {
      const projectDir = join(testDir, "test-env");

      await assembleProject({
        base: "monorepo",
        projectName: "test-env",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          database: { preset: "drizzle", version: "0.45.0" },
          payment: { preset: "polar", version: "1.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify .env.example exists and contains variables
      const envPath = join(projectDir, ".env.example");
      expect(await fileExists(envPath)).toBe(true);

      const envContent = await fs.readFile(envPath, "utf-8");
      expect(envContent).toContain("DATABASE_URL");
      expect(envContent).toContain("POLAR_ACCESS_TOKEN");
    });
  });

  describe("Linting Presets", () => {
    it("should apply eslint-prettier preset at root", async () => {
      const projectDir = join(testDir, "test-eslint");

      await assembleProject({
        base: "monorepo",
        projectName: "test-eslint",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "eslint-prettier", version: "9.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify ESLint files at root
      expect(await fileExists(join(projectDir, "eslint.config.js"))).toBe(true);
      expect(await fileExists(join(projectDir, ".prettierrc"))).toBe(true);

      // Verify biome.json is removed if it existed
      expect(await fileExists(join(projectDir, "biome.json"))).toBe(false);
    });

    it("should apply biome preset at root", async () => {
      const projectDir = join(testDir, "test-biome");

      await assembleProject({
        base: "monorepo",
        projectName: "test-biome",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api", "nextjs-web"], "monorepo"),
        presets: {
          linting: { preset: "biome", version: "1.9.0" },
        },
        packageManager: "pnpm",
      });

      // Verify biome config at root
      expect(await fileExists(join(projectDir, "biome.json"))).toBe(true);
    });
  });

  describe("Conflict Resolution", () => {
    it("should handle database preset swap (drizzle -> prisma)", async () => {
      const projectDir = join(testDir, "test-conflict");

      // First with drizzle
      await assembleProject({
        base: "monorepo",
        projectName: "test-conflict",
        targetDir: projectDir,
        apps: buildAppInstances(["nestjs-api"], "monorepo"),
        presets: {
          database: { preset: "prisma", version: "7.0.0" },
        },
        packageManager: "pnpm",
      });

      // Verify prisma files
      expect(await fileExists(join(projectDir, "apps/api/prisma/schema.prisma"))).toBe(true);

      // Verify drizzle files don't exist
      expect(await fileExists(join(projectDir, "apps/api/src/db/client.ts"))).toBe(false);
    });
  });
});

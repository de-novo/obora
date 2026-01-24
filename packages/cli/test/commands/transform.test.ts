import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";
import { runCommand } from "citty";
import { transformCommand } from "../../src/commands/transform";

describe("transform command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `transform-cmd-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("import transform", () => {
    it("should add import to file", async () => {
      const filePath = join(testDir, "test.ts");
      await fs.writeFile(filePath, `const x = 1;\n`);

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "import",
          "--file", filePath,
          "--from", "@nestjs/common",
          "--named", "Module,Injectable",
        ],
      });

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Module");
      expect(content).toContain("Injectable");
      expect(content).toContain("@nestjs/common");
    });

    it("should preview changes in dry-run mode", async () => {
      const filePath = join(testDir, "test.ts");
      const originalContent = `const x = 1;\n`;
      await fs.writeFile(filePath, originalContent);

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "import",
          "--file", filePath,
          "--from", "react",
          "--default", "React",
          "--dryRun",
        ],
      });

      // File should not be modified in dry-run
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe(originalContent);
    });
  });

  describe("dependency transform", () => {
    it("should add dependency to package.json", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test", dependencies: {} }, null, 2)
      );

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "dependency",
          "--file", packageJsonPath,
          "--name", "zod",
          "--version", "^3.0.0",
        ],
      });

      const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(content.dependencies["zod"]).toBe("^3.0.0");
    });

    it("should add devDependency with --dev flag", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test", devDependencies: {} }, null, 2)
      );

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "dependency",
          "--file", packageJsonPath,
          "--name", "vitest",
          "--version", "^2.0.0",
          "--dev",
        ],
      });

      const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(content.devDependencies["vitest"]).toBe("^2.0.0");
    });
  });

  describe("nestjs-module transform", () => {
    it("should add module to NestJS module file", async () => {
      const filePath = join(testDir, "app.module.ts");
      await fs.writeFile(
        filePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "nestjs-module",
          "--file", filePath,
          "--module", "PrismaModule",
        ],
      });

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("PrismaModule");
    });
  });

  describe("provider-wrap transform", () => {
    it("should wrap children with provider", async () => {
      const filePath = join(testDir, "providers.tsx");
      await fs.writeFile(
        filePath,
        `"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  );
}
`
      );

      await runCommand(transformCommand, {
        rawArgs: [
          "--type", "provider-wrap",
          "--file", filePath,
          "--provider", "QueryProvider",
        ],
      });

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<QueryProvider>");
      expect(content).toContain("</QueryProvider>");
    });
  });

  describe("error handling", () => {
    it("should error when file not found", async () => {
      const nonExistentPath = join(testDir, "nonexistent.ts");

      // Capture exit to prevent test from exiting
      const originalExit = process.exit;
      let exitCode: number | undefined;
      process.exit = ((code?: number) => {
        exitCode = code;
      }) as never;

      try {
        await runCommand(transformCommand, {
          rawArgs: [
            "--type", "import",
            "--file", nonExistentPath,
            "--from", "test",
          ],
        });
      } finally {
        process.exit = originalExit;
      }

      expect(exitCode).toBe(1);
    });
  });
});

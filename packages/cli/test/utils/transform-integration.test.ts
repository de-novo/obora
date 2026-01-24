import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";
import {
  addImport,
  addDependency,
  addNestJsModule,
  addProviderWrap,
  applyTransforms,
  parseImportStatement,
} from "../../src/utils/transform";
import type { TransformOperation } from "../../src/utils/transform";

describe("transform integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `transform-integration-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("NestJS Prisma preset scenario", () => {
    it("should apply import and nestjs-module transforms", async () => {
      // Setup: Create app.module.ts
      const appModulePath = join(testDir, "src/app.module.ts");
      await fs.mkdir(join(testDir, "src"), { recursive: true });
      await fs.writeFile(
        appModulePath,
        `import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      // Apply transforms (simulating preset)
      const importResult = await addImport(appModulePath, {
        from: "./prisma/prisma.module",
        named: ["PrismaModule"],
      });
      expect(importResult.success).toBe(true);
      expect(importResult.changed).toBe(true);

      const moduleResult = await addNestJsModule(appModulePath, {
        module: "PrismaModule",
      });
      expect(moduleResult.success).toBe(true);
      expect(moduleResult.changed).toBe(true);

      // Verify final content
      const content = await fs.readFile(appModulePath, "utf-8");
      expect(content).toContain("PrismaModule");
      expect(content).toContain("./prisma/prisma.module");
      // Should preserve existing imports
      expect(content).toContain("@nestjs/common");
      expect(content).toContain("ConfigModule");
      // Should have PrismaModule in imports array
      expect(content).toMatch(/imports:\s*\[.*PrismaModule.*\]/s);
    });

    it("should handle multiple module imports", async () => {
      const appModulePath = join(testDir, "app.module.ts");
      await fs.writeFile(
        appModulePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      // Add multiple modules (like auth + prisma presets)
      await addImport(appModulePath, { from: "./prisma/prisma.module", named: ["PrismaModule"] });
      await addNestJsModule(appModulePath, { module: "PrismaModule" });

      await addImport(appModulePath, { from: "./auth/auth.module", named: ["AuthModule"] });
      await addNestJsModule(appModulePath, { module: "AuthModule" });

      const content = await fs.readFile(appModulePath, "utf-8");
      expect(content).toContain("PrismaModule");
      expect(content).toContain("AuthModule");
      expect(content).toContain("imports:");
    });
  });

  describe("Next.js Provider preset scenario", () => {
    it("should apply import and provider-wrap transforms", async () => {
      // Setup: Create providers.tsx
      const providersPath = join(testDir, "app/providers.tsx");
      await fs.mkdir(join(testDir, "app"), { recursive: true });
      await fs.writeFile(
        providersPath,
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

      // Apply transforms (simulating TanStack Query preset)
      const importResult = await addImport(providersPath, {
        from: "@/lib/query",
        named: ["QueryProvider"],
      });
      expect(importResult.success).toBe(true);

      const wrapResult = await addProviderWrap(providersPath, {
        provider: "QueryProvider",
      });
      expect(wrapResult.success).toBe(true);
      expect(wrapResult.changed).toBe(true);

      // Verify final content
      const content = await fs.readFile(providersPath, "utf-8");
      expect(content).toContain("QueryProvider");
      expect(content).toContain("@/lib/query");
      expect(content).toContain("<QueryProvider>");
      expect(content).toContain("</QueryProvider>");
      expect(content).toContain("{children}");
    });

    it("should stack multiple providers correctly", async () => {
      const providersPath = join(testDir, "providers.tsx");
      await fs.writeFile(
        providersPath,
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

      // Add first provider (QueryProvider)
      await addImport(providersPath, { from: "@/lib/query", named: ["QueryProvider"] });
      await addProviderWrap(providersPath, { provider: "QueryProvider" });

      // Add second provider (ThemeProvider)
      await addImport(providersPath, { from: "next-themes", named: ["ThemeProvider"] });
      await addProviderWrap(providersPath, {
        provider: "ThemeProvider",
        props: { attribute: '"class"' },
      });

      const content = await fs.readFile(providersPath, "utf-8");
      expect(content).toContain("QueryProvider");
      expect(content).toContain("ThemeProvider");
    });
  });

  describe("applyTransforms batch operation", () => {
    it("should apply multiple transforms in sequence", async () => {
      // Setup files
      const appModulePath = join(testDir, "src/app.module.ts");
      const packageJsonPath = join(testDir, "package.json");
      await fs.mkdir(join(testDir, "src"), { recursive: true });

      await fs.writeFile(
        appModulePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test-project", dependencies: {} }, null, 2)
      );

      // Define transforms (simulating preset manifest)
      const operations: Array<{ target: string; operation: TransformOperation }> = [
        {
          target: "src/app.module.ts",
          operation: {
            type: "import",
            spec: { from: "./prisma/prisma.module", named: ["PrismaModule"] },
          },
        },
        {
          target: "src/app.module.ts",
          operation: {
            type: "nestjs-module",
            spec: { module: "PrismaModule" },
          },
        },
        {
          target: "package.json",
          operation: {
            type: "dependency",
            spec: { name: "@prisma/client", version: "^5.0.0" },
          },
        },
        {
          target: "package.json",
          operation: {
            type: "dependency",
            spec: { name: "prisma", version: "^5.0.0", dev: true },
          },
        },
      ];

      // Apply all transforms
      const results = await applyTransforms(operations, testDir);

      // Verify all succeeded
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.result.success)).toBe(true);

      // Verify app.module.ts
      const moduleContent = await fs.readFile(appModulePath, "utf-8");
      expect(moduleContent).toContain("PrismaModule");
      expect(moduleContent).toContain("./prisma/prisma.module");

      // Verify package.json
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(packageJson.dependencies["@prisma/client"]).toBe("^5.0.0");
      expect(packageJson.devDependencies["prisma"]).toBe("^5.0.0");
    });

    it("should continue on individual failures", async () => {
      // Only create package.json (no app.module.ts)
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test-project", dependencies: {} }, null, 2)
      );

      const operations: Array<{ target: string; operation: TransformOperation }> = [
        {
          target: "src/app.module.ts", // Does not exist
          operation: {
            type: "import",
            spec: { from: "./prisma/prisma.module", named: ["PrismaModule"] },
          },
        },
        {
          target: "package.json", // Exists
          operation: {
            type: "dependency",
            spec: { name: "@prisma/client", version: "^5.0.0" },
          },
        },
      ];

      const results = await applyTransforms(operations, testDir);

      expect(results).toHaveLength(2);
      expect(results[0].result.success).toBe(false);
      expect(results[0].result.error).toContain("File not found");
      expect(results[1].result.success).toBe(true);

      // Verify package.json was still updated
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(packageJson.dependencies["@prisma/client"]).toBe("^5.0.0");
    });
  });

  describe("idempotency", () => {
    it("should be idempotent for import transforms", async () => {
      const filePath = join(testDir, "test.ts");
      await fs.writeFile(filePath, `import { Module } from '@nestjs/common';\n`);

      // Apply same import twice
      const result1 = await addImport(filePath, {
        from: "./prisma/prisma.module",
        named: ["PrismaModule"],
      });
      const result2 = await addImport(filePath, {
        from: "./prisma/prisma.module",
        named: ["PrismaModule"],
      });

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);

      // Content should only have one import
      const content = await fs.readFile(filePath, "utf-8");
      const matches = content.match(/PrismaModule/g);
      expect(matches?.length).toBe(1);
    });

    it("should be idempotent for dependency transforms", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test", dependencies: {} }, null, 2)
      );

      // Apply same dependency twice
      const result1 = await addDependency(packageJsonPath, {
        name: "zod",
        version: "^3.0.0",
      });
      const result2 = await addDependency(packageJsonPath, {
        name: "zod",
        version: "^3.0.0",
      });

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);
    });

    it("should be idempotent for nestjs-module transforms", async () => {
      const filePath = join(testDir, "app.module.ts");
      await fs.writeFile(
        filePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
`
      );

      const result1 = await addNestJsModule(filePath, { module: "PrismaModule" });
      const result2 = await addNestJsModule(filePath, { module: "PrismaModule" });

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);
    });

    it("should be idempotent for provider-wrap transforms", async () => {
      const filePath = join(testDir, "providers.tsx");
      await fs.writeFile(
        filePath,
        `export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
`
      );

      const result1 = await addProviderWrap(filePath, { provider: "QueryProvider" });
      const result2 = await addProviderWrap(filePath, { provider: "QueryProvider" });

      expect(result1.changed).toBe(true);
      expect(result2.changed).toBe(false);
    });
  });

  describe("format preservation", () => {
    it("should preserve file formatting for imports", async () => {
      const filePath = join(testDir, "formatted.ts");
      const originalContent = `import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

// Comment to preserve
export class MyService {
  constructor() {}
}
`;
      await fs.writeFile(filePath, originalContent);

      await addImport(filePath, {
        from: "@nestjs/jwt",
        named: ["JwtService"],
      });

      const content = await fs.readFile(filePath, "utf-8");
      // Should preserve the comment
      expect(content).toContain("// Comment to preserve");
      // Should preserve the class structure
      expect(content).toContain("export class MyService");
    });

    it("should preserve JSON formatting for dependencies", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify(
          {
            name: "test-project",
            version: "1.0.0",
            dependencies: {
              existing: "^1.0.0",
            },
          },
          null,
          2
        )
      );

      await addDependency(packageJsonPath, {
        name: "new-dep",
        version: "^2.0.0",
      });

      const content = await fs.readFile(packageJsonPath, "utf-8");
      // Should have proper indentation
      expect(content).toContain('  "dependencies"');
      // Should preserve existing structure
      expect(content).toContain('"name": "test-project"');
      expect(content).toContain('"version": "1.0.0"');
    });
  });

  describe("parseImportStatement integration", () => {
    it("should correctly parse and apply complex import statements", async () => {
      const testCases = [
        "import { Module, Injectable } from '@nestjs/common'",
        "import React, { useState, useEffect } from 'react'",
        "import * as fs from 'fs'",
        "import DefaultExport from 'some-module'",
      ];

      for (const statement of testCases) {
        const spec = parseImportStatement(statement);
        expect(spec).not.toBeNull();

        // Create fresh file for each test
        const filePath = join(testDir, `test-${Date.now()}-${Math.random()}.ts`);
        await fs.writeFile(filePath, "");

        const result = await addImport(filePath, spec!);
        expect(result.success).toBe(true);
        expect(result.changed).toBe(true);

        const content = await fs.readFile(filePath, "utf-8");
        expect(content).toContain(spec!.from);
      }
    });
  });
});

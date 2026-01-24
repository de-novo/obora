import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";
import {
  addImport,
  addExport,
  addDependency,
  addNestJsModule,
  addProviderWrap,
  addLayoutComponent,
  updateJsonProperty,
  parseImportStatement,
  isImportStatement,
  applyTransformsWithRollback,
} from "../../src/utils/transform";

describe("transform utilities", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `transform-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("parseImportStatement", () => {
    it("should parse named imports", () => {
      const result = parseImportStatement(
        "import { Module, Injectable } from '@nestjs/common'"
      );
      expect(result).toEqual({
        from: "@nestjs/common",
        named: ["Module", "Injectable"],
      });
    });

    it("should parse default import", () => {
      const result = parseImportStatement("import React from 'react'");
      expect(result).toEqual({
        from: "react",
        default: "React",
      });
    });

    it("should parse namespace import", () => {
      const result = parseImportStatement("import * as fs from 'fs'");
      expect(result).toEqual({
        from: "fs",
        namespace: "fs",
      });
    });

    it("should parse mixed import", () => {
      const result = parseImportStatement(
        "import React, { useState, useEffect } from 'react'"
      );
      expect(result).toEqual({
        from: "react",
        default: "React",
        named: ["useState", "useEffect"],
      });
    });

    it("should return null for invalid statement", () => {
      const result = parseImportStatement("const x = 1");
      expect(result).toBeNull();
    });
  });

  describe("isImportStatement", () => {
    it("should return true for import statement", () => {
      expect(isImportStatement("import { x } from 'y'")).toBe(true);
      expect(isImportStatement("  import x from 'y'")).toBe(true);
    });

    it("should return false for non-import statement", () => {
      expect(isImportStatement("const x = 1")).toBe(false);
      expect(isImportStatement("export { x }")).toBe(false);
    });
  });

  describe("addImport", () => {
    it("should add import to empty file", async () => {
      const filePath = join(testDir, "empty.ts");
      await fs.writeFile(filePath, "");

      const result = await addImport(filePath, {
        from: "@nestjs/common",
        named: ["Module"],
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Module");
      expect(content).toContain("@nestjs/common");
    });

    it("should add import to file with existing imports", async () => {
      const filePath = join(testDir, "existing.ts");
      await fs.writeFile(
        filePath,
        `import { Injectable } from '@nestjs/common';

export class MyService {}
`
      );

      const result = await addImport(filePath, {
        from: "@nestjs/jwt",
        named: ["JwtService"],
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("JwtService");
      expect(content).toContain("@nestjs/jwt");
    });

    it("should return not changed if import already exists", async () => {
      const filePath = join(testDir, "duplicate.ts");
      await fs.writeFile(
        filePath,
        `import { Module } from '@nestjs/common';
`
      );

      const result = await addImport(filePath, {
        from: "@nestjs/common",
        named: ["Module"],
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should return error for non-existent file", async () => {
      const result = await addImport(join(testDir, "nonexistent.ts"), {
        from: "@nestjs/common",
        named: ["Module"],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const filePath = join(testDir, "dryrun.ts");
      const originalContent = `import { Injectable } from '@nestjs/common';

export class MyService {}
`;
      await fs.writeFile(filePath, originalContent);

      const result = await addImport(
        filePath,
        { from: "@nestjs/jwt", named: ["JwtService"] },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("JwtService");
      expect(result.preview).toContain("@nestjs/jwt");

      // File should not be modified
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });
  });

  describe("addDependency", () => {
    it("should add dependency to package.json", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test", dependencies: {} }, null, 2)
      );

      const result = await addDependency(packageJsonPath, {
        name: "@nestjs/jwt",
        version: "^10.0.0",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(content.dependencies["@nestjs/jwt"]).toBe("^10.0.0");
    });

    it("should add devDependency when dev flag is true", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test", devDependencies: {} }, null, 2)
      );

      const result = await addDependency(packageJsonPath, {
        name: "vitest",
        version: "^2.0.0",
        dev: true,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(content.devDependencies["vitest"]).toBe("^2.0.0");
    });

    it("should not change if dependency already exists", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify(
          {
            name: "test",
            dependencies: { "@nestjs/jwt": "^10.0.0" },
          },
          null,
          2
        )
      );

      const result = await addDependency(packageJsonPath, {
        name: "@nestjs/jwt",
        version: "^10.0.0",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should create dependencies object if not exists", async () => {
      const packageJsonPath = join(testDir, "package.json");
      await fs.writeFile(
        packageJsonPath,
        JSON.stringify({ name: "test" }, null, 2)
      );

      const result = await addDependency(packageJsonPath, {
        name: "zod",
        version: "^3.0.0",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(packageJsonPath, "utf-8"));
      expect(content.dependencies["zod"]).toBe("^3.0.0");
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const packageJsonPath = join(testDir, "package.json");
      const originalContent = JSON.stringify(
        { name: "test", dependencies: {} },
        null,
        2
      );
      await fs.writeFile(packageJsonPath, originalContent);

      const result = await addDependency(
        packageJsonPath,
        { name: "axios", version: "^1.0.0" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("axios");
      expect(result.preview).toContain("1.0.0");

      // File should not be modified
      const fileContent = await fs.readFile(packageJsonPath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });
  });

  describe("addNestJsModule", () => {
    it("should add module to empty imports array", async () => {
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

      const result = await addNestJsModule(filePath, { module: "PrismaModule" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("imports: [PrismaModule]");
    });

    it("should add module to existing imports array", async () => {
      const filePath = join(testDir, "app.module.ts");
      await fs.writeFile(
        filePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      const result = await addNestJsModule(filePath, { module: "PrismaModule" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("ConfigModule");
      expect(content).toContain("PrismaModule");
    });

    it("should not add module if already exists", async () => {
      const filePath = join(testDir, "app.module.ts");
      await fs.writeFile(
        filePath,
        `import { Module } from '@nestjs/common';

@Module({
  imports: [PrismaModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
`
      );

      const result = await addNestJsModule(filePath, { module: "PrismaModule" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should return error for non-existent file", async () => {
      const result = await addNestJsModule(join(testDir, "nonexistent.ts"), {
        module: "PrismaModule",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const filePath = join(testDir, "app.module.ts");
      const originalContent = `import { Module } from '@nestjs/common';

@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
`;
      await fs.writeFile(filePath, originalContent);

      const result = await addNestJsModule(
        filePath,
        { module: "AuthModule" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("AuthModule");
      expect(result.preview).toContain("ConfigModule");

      // File should not be modified
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });
  });

  describe("addProviderWrap", () => {
    it("should wrap {children} with provider", async () => {
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

      const result = await addProviderWrap(filePath, { provider: "QueryProvider" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<QueryProvider>");
      expect(content).toContain("</QueryProvider>");
    });

    it("should not add provider if already wraps children", async () => {
      const filePath = join(testDir, "providers.tsx");
      await fs.writeFile(
        filePath,
        `"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
    </QueryProvider>
  );
}
`
      );

      const result = await addProviderWrap(filePath, { provider: "QueryProvider" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should add provider with props", async () => {
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

      const result = await addProviderWrap(filePath, {
        provider: "ThemeProvider",
        props: { attribute: '"class"', defaultTheme: '"system"' },
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<ThemeProvider");
      expect(content).toContain("</ThemeProvider>");
    });

    it("should auto-create providers.tsx with default template when file does not exist", async () => {
      const filePath = join(testDir, "new-providers.tsx");

      const result = await addProviderWrap(filePath, { provider: "QueryProvider" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      // File should be created
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // File should contain the provider
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('"use client"');
      expect(content).toContain("export function Providers");
      expect(content).toContain("<QueryProvider>");
      expect(content).toContain("</QueryProvider>");
    });

    it("should preview auto-creation without actually creating file in dry-run mode", async () => {
      const filePath = join(testDir, "dry-run-providers.tsx");

      const result = await addProviderWrap(
        filePath,
        { provider: "AuthProvider" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("<AuthProvider>");
      expect(result.preview).toContain("</AuthProvider>");

      // File should NOT be created in dry-run mode
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it("should auto-create providers.tsx with props", async () => {
      const filePath = join(testDir, "new-providers-with-props.tsx");

      const result = await addProviderWrap(filePath, {
        provider: "ThemeProvider",
        props: { attribute: '"class"' },
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('<ThemeProvider attribute={"class"}');
      expect(content).toContain("</ThemeProvider>");
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const filePath = join(testDir, "providers.tsx");
      const originalContent = `"use client";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
    </>
  );
}
`;
      await fs.writeFile(filePath, originalContent);

      const result = await addProviderWrap(
        filePath,
        { provider: "AuthProvider" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("<AuthProvider>");
      expect(result.preview).toContain("</AuthProvider>");

      // File should not be modified
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });
  });

  describe("addExport", () => {
    it("should add named export to file", async () => {
      const filePath = join(testDir, "index.ts");
      await fs.writeFile(
        filePath,
        `export const config = {};
`
      );

      const result = await addExport(filePath, { exported: "UserService" });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("export { UserService }");
    });

    it("should add re-export from module", async () => {
      const filePath = join(testDir, "index.ts");
      await fs.writeFile(filePath, "");

      const result = await addExport(filePath, {
        exported: "UserService",
        from: "./user.service",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('export { UserService } from "./user.service"');
    });

    it("should add star re-export", async () => {
      const filePath = join(testDir, "index.ts");
      await fs.writeFile(filePath, "");

      const result = await addExport(filePath, {
        exported: "*",
        from: "./utils",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain('export * from "./utils"');
    });

    it("should add default export", async () => {
      const filePath = join(testDir, "index.ts");
      await fs.writeFile(
        filePath,
        `const MyComponent = () => {};
`
      );

      const result = await addExport(filePath, {
        exported: "MyComponent",
        default: true,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("export default MyComponent");
    });

    it("should not add export if already exists", async () => {
      const filePath = join(testDir, "index.ts");
      await fs.writeFile(
        filePath,
        `export { UserService } from "./user.service";
`
      );

      const result = await addExport(filePath, {
        exported: "UserService",
        from: "./user.service",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const filePath = join(testDir, "index.ts");
      const originalContent = `export const config = {};
`;
      await fs.writeFile(filePath, originalContent);

      const result = await addExport(
        filePath,
        { exported: "UserService", from: "./user.service" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain('export { UserService } from "./user.service"');

      // File should not be modified
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });

    it("should return error for non-existent file", async () => {
      const result = await addExport(join(testDir, "nonexistent.ts"), {
        exported: "UserService",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });
  });

  describe("updateJsonProperty", () => {
    it("should set property in JSON file", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ name: "test" }, null, 2)
      );

      const result = await updateJsonProperty(filePath, {
        path: "version",
        value: "1.0.0",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.version).toBe("1.0.0");
    });

    it("should set nested property", async () => {
      const filePath = join(testDir, "tsconfig.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ compilerOptions: {} }, null, 2)
      );

      const result = await updateJsonProperty(filePath, {
        path: "compilerOptions.strict",
        value: true,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.compilerOptions.strict).toBe(true);
    });

    it("should create nested path if not exists", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify({}, null, 2));

      const result = await updateJsonProperty(filePath, {
        path: "deeply.nested.value",
        value: 42,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.deeply.nested.value).toBe(42);
    });

    it("should merge arrays when merge option is true", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ include: ["src/**/*.ts"] }, null, 2)
      );

      const result = await updateJsonProperty(filePath, {
        path: "include",
        value: ["test/**/*.ts"],
        merge: true,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.include).toContain("src/**/*.ts");
      expect(content.include).toContain("test/**/*.ts");
    });

    it("should merge objects when merge option is true", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ scripts: { build: "tsc" } }, null, 2)
      );

      const result = await updateJsonProperty(filePath, {
        path: "scripts",
        value: { test: "vitest" },
        merge: true,
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = JSON.parse(await fs.readFile(filePath, "utf-8"));
      expect(content.scripts.build).toBe("tsc");
      expect(content.scripts.test).toBe("vitest");
    });

    it("should not change if value is already the same", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(
        filePath,
        JSON.stringify({ version: "1.0.0" }, null, 2)
      );

      const result = await updateJsonProperty(filePath, {
        path: "version",
        value: "1.0.0",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);
    });

    it("should return preview without writing file in dry-run mode", async () => {
      const filePath = join(testDir, "config.json");
      const originalContent = JSON.stringify({ name: "test" }, null, 2);
      await fs.writeFile(filePath, originalContent);

      const result = await updateJsonProperty(
        filePath,
        { path: "version", value: "2.0.0" },
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);
      expect(result.preview).toBeDefined();
      expect(result.preview).toContain("2.0.0");

      // File should not be modified
      const fileContent = await fs.readFile(filePath, "utf-8");
      expect(fileContent).toBe(originalContent);
    });

    it("should return error for non-existent file", async () => {
      const result = await updateJsonProperty(join(testDir, "nonexistent.json"), {
        path: "version",
        value: "1.0.0",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should return error for invalid path", async () => {
      const filePath = join(testDir, "config.json");
      await fs.writeFile(filePath, JSON.stringify({ count: 5 }, null, 2));

      const result = await updateJsonProperty(filePath, {
        path: "count.nested",
        value: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("is not an object");
    });
  });

  describe("applyTransformsWithRollback", () => {
    it("should apply transforms successfully", async () => {
      const filePath = join(testDir, "service.ts");
      await fs.writeFile(filePath, `export class UserService {}\n`);

      const result = await applyTransformsWithRollback(
        [
          {
            target: filePath,
            operation: {
              type: "import",
              spec: { from: "@nestjs/common", named: ["Injectable"] },
            },
          },
        ],
        testDir
      );

      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      expect(result.backups.length).toBe(1);
      expect(result.results.length).toBe(1);
      expect(result.results[0].result.success).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Injectable");
    });

    it("should rollback all changes when a transform fails", async () => {
      const successFile = join(testDir, "success.ts");
      const failFile = join(testDir, "nonexistent", "fail.ts"); // Will fail - directory doesn't exist

      const originalContent = `export class Success {}\n`;
      await fs.writeFile(successFile, originalContent);

      const result = await applyTransformsWithRollback(
        [
          {
            target: successFile,
            operation: {
              type: "import",
              spec: { from: "@nestjs/common", named: ["Injectable"] },
            },
          },
          {
            target: failFile,
            operation: {
              type: "import",
              spec: { from: "@nestjs/common", named: ["Module"] },
            },
          },
        ],
        testDir
      );

      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);

      // First file should be rolled back to original content
      const restoredContent = await fs.readFile(successFile, "utf-8");
      expect(restoredContent).toBe(originalContent);
    });

    it("should skip rollback logic in dry-run mode", async () => {
      const filePath = join(testDir, "dryrun.ts");
      const originalContent = `export class Test {}\n`;
      await fs.writeFile(filePath, originalContent);

      const result = await applyTransformsWithRollback(
        [
          {
            target: filePath,
            operation: {
              type: "import",
              spec: { from: "lodash", named: ["debounce"] },
            },
          },
        ],
        testDir,
        { dryRun: true }
      );

      expect(result.success).toBe(true);
      expect(result.backups).toHaveLength(0);

      // File should not be modified
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toBe(originalContent);
    });

    it("should handle multiple operations on same file", async () => {
      const filePath = join(testDir, "multi.ts");
      await fs.writeFile(filePath, `export class Multi {}\n`);

      const result = await applyTransformsWithRollback(
        [
          {
            target: filePath,
            operation: {
              type: "import",
              spec: { from: "@nestjs/common", named: ["Injectable"] },
            },
          },
          {
            target: filePath,
            operation: {
              type: "import",
              spec: { from: "@nestjs/jwt", named: ["JwtService"] },
            },
          },
        ],
        testDir
      );

      expect(result.success).toBe(true);
      expect(result.rolledBack).toBe(false);
      // Should deduplicate backups for same file
      expect(result.backups.length).toBe(1);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Injectable");
      expect(content).toContain("JwtService");
    });

    it("should restore file that did not exist before transform", async () => {
      // This tests the case where a transform might create a file that didn't exist
      const filePath = join(testDir, "new-file.ts");

      // Ensure file doesn't exist
      try {
        await fs.unlink(filePath);
      } catch {
        // File doesn't exist, which is expected
      }

      const result = await applyTransformsWithRollback(
        [
          {
            target: filePath,
            operation: {
              type: "import",
              spec: { from: "@nestjs/common", named: ["Module"] },
            },
          },
        ],
        testDir
      );

      // This operation should fail because file doesn't exist
      expect(result.success).toBe(false);
      expect(result.rolledBack).toBe(true);

      // Backup should record that file didn't exist
      expect(result.backups[0].content).toBeNull();
    });
  });

  describe("addLayoutComponent", () => {
    it("should add component at body-end position", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "UmamiScript",
        position: "body-end",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<UmamiScript />");
      expect(content).toMatch(/<UmamiScript \/>\s*<\/body>/);
    });

    it("should add component at body-start position", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "Toaster",
        position: "body-start",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(true);

      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<Toaster />");
      expect(content).toMatch(/<body[^>]*>\s*<Toaster \/>/);
    });

    it("should add component with props", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "Analytics",
        position: "body-end",
        props: { debug: "true", id: '"my-id"' },
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("debug={true}");
      expect(content).toContain('id={"my-id"}');
    });

    it("should add non-self-closing component", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html>
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "Provider",
        position: "body-start",
        selfClosing: false,
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<Provider>");
    });

    it("should not add duplicate component", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html>
      <body>
        <UmamiScript />
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "UmamiScript",
        position: "body-end",
      });

      expect(result.success).toBe(true);
      expect(result.changed).toBe(false);

      const content = await fs.readFile(filePath, "utf-8");
      // Should only have one occurrence
      const matches = content.match(/<UmamiScript/g);
      expect(matches?.length).toBe(1);
    });

    it("should handle html-start position", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "Script",
        position: "html-start",
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<Script />");
      expect(content).toMatch(/<html[^>]*>\s*<Script \/>/);
    });

    it("should handle html-end position", async () => {
      const filePath = join(testDir, "layout.tsx");
      await fs.writeFile(
        filePath,
        `export default function Layout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
`
      );

      const result = await addLayoutComponent(filePath, {
        component: "Analytics",
        position: "html-end",
      });

      expect(result.success).toBe(true);
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("<Analytics />");
      expect(content).toMatch(/<Analytics \/>\s*<\/html>/);
    });
  });
});

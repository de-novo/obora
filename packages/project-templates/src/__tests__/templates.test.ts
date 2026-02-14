import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_MODULE_TEMPLATES,
  BASE_TEMPLATES,
  getAppTemplatePath,
  getBaseTemplatePath,
  getTemplatesDir,
} from "../index.js";

interface AppManifestContract {
  name: string;
  type: "app" | "package";
  targetDir: string;
  slots: string[];
}

describe("project template paths", () => {
  it("getTemplatesDir() should resolve to existing directory", () => {
    const templatesDir = getTemplatesDir();
    expect(existsSync(templatesDir)).toBe(true);
  });

  it("getBaseTemplatePath(monorepo/single) should point to existing directories", () => {
    const monorepoPath = getBaseTemplatePath("monorepo");
    const singlePath = getBaseTemplatePath("single");

    expect(existsSync(monorepoPath)).toBe(true);
    expect(existsSync(singlePath)).toBe(true);
  });
});

describe("base template required files", () => {
  it("monorepo template should include required scaffold files", () => {
    const basePath = getBaseTemplatePath("monorepo");

    expect(existsSync(join(basePath, "package.json"))).toBe(true);
    expect(existsSync(join(basePath, "pnpm-workspace.yaml"))).toBe(true);
    expect(existsSync(join(basePath, "turbo.json"))).toBe(true);
  });

  it("single template should include required scaffold files", () => {
    const basePath = getBaseTemplatePath("single");

    expect(existsSync(join(basePath, "package.json"))).toBe(true);
  });
});

describe("preset-engine contract compatibility (basic)", () => {
  it("all app templates should have package.json in files/", () => {
    for (const appName of Object.keys(APP_MODULE_TEMPLATES)) {
      const appPath = getAppTemplatePath(appName as keyof typeof APP_MODULE_TEMPLATES);
      expect(existsSync(join(appPath, "package.json"))).toBe(true);
    }
  });

  it("app manifests should expose fields required by preset-engine AppModuleConfig", () => {
    const templatesDir = getTemplatesDir();
    const appTemplateNames = readdirSync(join(templatesDir, "apps"));

    for (const name of appTemplateNames) {
      const manifestPath = join(templatesDir, "apps", name, "manifest.json");
      const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as AppManifestContract;

      expect(parsed.name).toBe(name);
      expect(["app", "package"]).toContain(parsed.type);
      expect(parsed.targetDir).toBeTypeOf("string");
      expect(parsed.targetDir.length).toBeGreaterThan(0);
      expect(Array.isArray(parsed.slots)).toBe(true);
    }
  });

  it("base template registry entries should map to an existing manifest", () => {
    const templatesDir = getTemplatesDir();

    for (const baseName of Object.keys(BASE_TEMPLATES)) {
      const manifestPath = join(templatesDir, "base", baseName, "manifest.json");
      expect(existsSync(manifestPath)).toBe(true);
    }
  });
});

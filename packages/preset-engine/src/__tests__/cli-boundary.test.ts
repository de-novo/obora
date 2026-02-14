import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AppModuleConfig } from "../types.js";

interface AppManifest {
  name: string;
  type: "app";
  description: string;
  targetDir: string;
  features: string[];
  slots: string[];
}

describe("preset-engine <-> template/CLI boundary", () => {
  it("template app manifests are compatible with preset-engine AppModuleConfig", () => {
    const templatesAppsDir = join(process.cwd(), "..", "project-templates", "templates", "apps");
    const appDirs = readdirSync(templatesAppsDir);

    for (const appDir of appDirs) {
      const manifestPath = join(templatesAppsDir, appDir, "manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as AppManifest;

      const moduleConfig: AppModuleConfig = {
        name: manifest.name,
        description: manifest.description,
        features: manifest.features,
        targetDir: manifest.targetDir,
        slots: manifest.slots,
      };

      expect(moduleConfig.name).toBe(appDir);
      expect(moduleConfig.targetDir.length).toBeGreaterThan(0);
      expect(Array.isArray(moduleConfig.slots)).toBe(true);
    }
  });
});

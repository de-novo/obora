import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { PluginLoader } from "../plugin-loader.js";
import type { PluginDescriptor } from "../plugin-types.js";

interface MockPluginOptions {
  name: string;
  version?: string;
  obora?: {
    type: string;
    exports: string;
    name: string;
  };
  moduleContent?: string;
}

async function createMockPackage(basePath: string, packageName: string, options: MockPluginOptions) {
  const pkgPath = join(basePath, packageName);
  await mkdir(join(pkgPath, "dist"), { recursive: true });

  const packageJson = {
    name: options.name,
    version: options.version ?? "1.0.0",
    ...(options.obora ? { obora: options.obora } : {}),
  };

  await writeFile(join(pkgPath, "package.json"), JSON.stringify(packageJson, null, 2), "utf-8");

  const moduleContent =
    options.moduleContent ??
    'module.exports = { name: "fake-tool", type: "tool", execute: () => {} };\n';
  await writeFile(join(pkgPath, "dist", "index.js"), moduleContent, "utf-8");

  return pkgPath;
}

describe("PluginLoader", () => {
  let testDir: string;
  let nodeModulesPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "obora-sdk-plugin-loader-"));
    nodeModulesPath = join(testDir, "node_modules");
    await mkdir(nodeModulesPath, { recursive: true });

    await createMockPackage(nodeModulesPath, "fake-plugin-tool", {
      name: "fake-plugin-tool",
      obora: {
        type: "tool",
        exports: "./dist/index.js",
        name: "fake-tool",
      },
      moduleContent: 'module.exports = { name: "fake-tool", type: "tool", execute: () => "ok" };\n',
    });

    await createMockPackage(nodeModulesPath, "fake-plugin-pattern", {
      name: "fake-plugin-pattern",
      obora: {
        type: "pattern",
        exports: "./dist/index.js",
        name: "fake-pattern",
      },
      moduleContent: 'module.exports = { name: "fake-pattern", type: "pattern" };\n',
    });

    await createMockPackage(nodeModulesPath, "not-a-plugin", {
      name: "not-a-plugin",
    });

    const scopePath = join(nodeModulesPath, "@scope");
    await mkdir(scopePath, { recursive: true });
    await createMockPackage(scopePath, "scoped-plugin", {
      name: "@scope/scoped-plugin",
      obora: {
        type: "tool",
        exports: "./dist/index.js",
        name: "scoped-tool",
      },
      moduleContent: 'module.exports = { name: "scoped-tool", type: "tool", execute: () => {} };\n',
    });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("scan() discovers valid plugins and skips non-plugins", async () => {
    const loader = new PluginLoader({ searchPaths: [nodeModulesPath], cwd: testDir });

    const descriptors = await loader.scan();
    const packageNames = descriptors.map((item) => item.packageName).sort();

    expect(packageNames).toEqual([
      "@scope/scoped-plugin",
      "fake-plugin-pattern",
      "fake-plugin-tool",
    ]);
  });

  it("scan() skips packages with invalid obora metadata", async () => {
    const invalidPath = join(testDir, "invalid-node_modules");
    await mkdir(invalidPath, { recursive: true });

    await createMockPackage(invalidPath, "bad-plugin", {
      name: "bad-plugin",
      obora: {
        type: "invalid-type",
        exports: "./dist/index.js",
        name: "bad-plugin",
      },
    });

    const loader = new PluginLoader({ searchPaths: [invalidPath], cwd: testDir });
    await expect(loader.scan()).resolves.toEqual([]);
  });

  it("scan() handles scoped packages", async () => {
    const loader = new PluginLoader({ searchPaths: [nodeModulesPath], cwd: testDir });

    const descriptors = await loader.scan();
    expect(descriptors.some((item) => item.packageName === "@scope/scoped-plugin")).toBe(true);
  });

  it("scan() handles missing search paths gracefully", async () => {
    const loader = new PluginLoader({ searchPaths: [join(testDir, "missing-node_modules")], cwd: testDir });
    await expect(loader.scan()).resolves.toEqual([]);
  });

  it("load() returns LoadedPlugin for valid descriptor", async () => {
    const loader = new PluginLoader({ searchPaths: [nodeModulesPath], cwd: testDir });
    const descriptors = await loader.scan();

    const target = descriptors.find((item) => item.packageName === "fake-plugin-tool");
    expect(target).toBeDefined();

    const loaded = await loader.load(target as PluginDescriptor);
    expect(loaded.descriptor.packageName).toBe("fake-plugin-tool");
    expect(loaded.module).toMatchObject({
      default: {
        name: "fake-tool",
      },
    });
  });

  it("load() throws SDK_9002 when module path is invalid", async () => {
    const loader = new PluginLoader({ searchPaths: [nodeModulesPath], cwd: testDir });
    const descriptors = await loader.scan();
    const target = descriptors.find((item) => item.packageName === "fake-plugin-tool");

    expect(target).toBeDefined();
    const badDescriptor: PluginDescriptor = {
      ...(target as PluginDescriptor),
      metadata: {
        ...(target as PluginDescriptor).metadata,
        exports: "./dist/missing.js",
      },
    };

    await expect(loader.load(badDescriptor)).rejects.toMatchObject({ code: "SDK_9002" });
  });

  it("scanAndLoad() combines scan and load", async () => {
    const loader = new PluginLoader({ searchPaths: [nodeModulesPath], cwd: testDir });

    const loaded = await loader.scanAndLoad();
    expect(loaded).toHaveLength(3);
    expect(loaded.map((item) => item.descriptor.packageName).sort()).toEqual([
      "@scope/scoped-plugin",
      "fake-plugin-pattern",
      "fake-plugin-tool",
    ]);
  });
});

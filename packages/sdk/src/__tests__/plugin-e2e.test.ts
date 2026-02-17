import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PluginManager } from "../plugin-manager.js";
import type { PluginDescriptor, PluginType } from "../plugin-types.js";

interface MockPluginOptions {
  packageName: string;
  pluginName: string;
  type: PluginType;
  marker?: string;
}

async function createMockPlugin(basePath: string, options: MockPluginOptions): Promise<void> {
  const pkgPath = join(basePath, options.packageName);
  await mkdir(join(pkgPath, "dist"), { recursive: true });

  await writeFile(
    join(pkgPath, "package.json"),
    JSON.stringify(
      {
        name: options.packageName,
        version: "1.0.0",
        obora: {
          type: options.type,
          exports: "./dist/index.js",
          name: options.pluginName,
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  await writeFile(
    join(pkgPath, "dist", "index.js"),
    `module.exports = { marker: "${options.marker ?? options.packageName}" };\n`,
    "utf-8",
  );
}

describe("PluginManager E2E", () => {
  let testDir: string;
  let nodeModulesPath: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "obora-sdk-plugin-e2e-"));
    nodeModulesPath = join(testDir, "node_modules");
    await mkdir(nodeModulesPath, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("discover-and-register E2E", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin",
      pluginName: "tool-a",
      type: "tool",
    });
    await createMockPlugin(nodeModulesPath, {
      packageName: "agent-plugin",
      pluginName: "agent-a",
      type: "agent",
    });
    await createMockPlugin(nodeModulesPath, {
      packageName: "policy-plugin",
      pluginName: "policy-a",
      type: "policy-rule",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    const loaded = await manager.discoverAndRegister();

    expect(loaded).toHaveLength(3);
    expect(manager.registry.getAll()).toHaveLength(3);
    expect(manager.getPlugin("tool", "tool-a")).toBeDefined();
    expect(manager.getPlugin("agent", "agent-a")).toBeDefined();
    expect(manager.getPlugin("policy", "policy-a")).toBeDefined();
  });

  it("override E2E", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin-v1",
      pluginName: "dup-tool",
      type: "tool",
      marker: "v1",
    });
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin-v2",
      pluginName: "dup-tool",
      type: "tool",
      marker: "v2",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    const descriptors = await manager.loader.scan();
    const v1 = descriptors.find((d) => d.packageName === "tool-plugin-v1");
    const v2 = descriptors.find((d) => d.packageName === "tool-plugin-v2");

    expect(v1).toBeDefined();
    expect(v2).toBeDefined();

    await manager.loadAndRegister(v1 as PluginDescriptor);
    const replaced = await manager.loadAndRegister(v2 as PluginDescriptor, { override: true });

    expect(manager.getPlugin("tool", "dup-tool")).toBe(replaced);
    expect(replaced.descriptor.packageName).toBe("tool-plugin-v2");
  });

  it("conflict E2E", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin-v1",
      pluginName: "dup-tool",
      type: "tool",
    });
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin-v2",
      pluginName: "dup-tool",
      type: "tool",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    const descriptors = await manager.loader.scan();
    const [v1, v2] = descriptors.sort((a, b) => a.packageName.localeCompare(b.packageName));

    await manager.loadAndRegister(v1 as PluginDescriptor);

    await expect(manager.loadAndRegister(v2 as PluginDescriptor)).rejects.toMatchObject({
      code: "SDK_9003",
    });
  });

  it("type alias resolution E2E", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "policy-plugin",
      pluginName: "policy-a",
      type: "policy-rule",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    await manager.discoverAndRegister();

    const policies = manager.getByType("policy");
    expect(policies).toHaveLength(1);
    expect(policies[0].descriptor.metadata.type).toBe("policy-rule");
  });

  it("unregister E2E", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "policy-plugin",
      pluginName: "policy-a",
      type: "policy-rule",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    await manager.discoverAndRegister();

    expect(manager.unregister("policy", "policy-a")).toBe(true);
    expect(manager.getPlugin("policy", "policy-a")).toBeUndefined();
  });

  it("loadAndRegister single plugin", async () => {
    await createMockPlugin(nodeModulesPath, {
      packageName: "tool-plugin",
      pluginName: "tool-a",
      type: "tool",
    });

    const manager = new PluginManager({ searchPaths: [nodeModulesPath], cwd: testDir });
    const descriptors = await manager.loader.scan();

    expect(descriptors).toHaveLength(1);
    const loaded = await manager.loadAndRegister(descriptors[0] as PluginDescriptor);

    expect(loaded.descriptor.metadata.name).toBe("tool-a");
    expect(manager.getPlugin("tool", "tool-a")).toBe(loaded);
  });
});

import { describe, expect, it } from "vitest";

import { resolvePluginType } from "../plugin-type-map.js";
import { PluginRegistry } from "../plugin-registry.js";
import type { LoadedPlugin, PluginType } from "../plugin-types.js";

function makeLoadedPlugin(type: PluginType, name: string, moduleValue: unknown = {}): LoadedPlugin {
  return {
    descriptor: {
      packageName: `@test/${name}`,
      version: "1.0.0",
      packagePath: `/tmp/${name}`,
      metadata: {
        type,
        exports: "./dist/index.js",
        name,
      },
    },
    module: moduleValue,
  };
}

describe("PluginRegistry", () => {
  it("register() stores plugin correctly", () => {
    const registry = new PluginRegistry();
    const plugin = makeLoadedPlugin("tool", "example-tool");

    registry.register(plugin);

    expect(registry.get("tool", "example-tool")).toBe(plugin);
    expect(registry.has("tool", "example-tool")).toBe(true);
  });

  it("register() rejects same-type same-name conflicts by default", () => {
    const registry = new PluginRegistry();
    registry.register(makeLoadedPlugin("tool", "dup-tool", { v: 1 }));

    expect(() => registry.register(makeLoadedPlugin("tool", "dup-tool", { v: 2 }))).toThrowError(
      /Plugin conflict/,
    );

    try {
      registry.register(makeLoadedPlugin("tool", "dup-tool", { v: 3 }));
    } catch (error) {
      expect((error as { code?: string }).code).toBe("SDK_9003");
    }
  });

  it("register() with override:true replaces existing plugin", () => {
    const registry = new PluginRegistry();
    const oldPlugin = makeLoadedPlugin("tool", "replaceable", { v: 1 });
    const newPlugin = makeLoadedPlugin("tool", "replaceable", { v: 2 });

    registry.register(oldPlugin);
    registry.register(newPlugin, { override: true });

    expect(registry.get("tool", "replaceable")).toBe(newPlugin);
    expect(registry.getAll("tool")).toEqual([newPlugin]);
  });

  it("unregister() removes plugin and returns true/false", () => {
    const registry = new PluginRegistry();
    registry.register(makeLoadedPlugin("agent", "agent-a"));

    expect(registry.unregister("agent", "agent-a")).toBe(true);
    expect(registry.unregister("agent", "agent-a")).toBe(false);
  });

  it("get()/has()/getAll()/clear() work correctly", () => {
    const registry = new PluginRegistry();
    const tool = makeLoadedPlugin("tool", "tool-a");
    const agent = makeLoadedPlugin("agent", "agent-a");

    registry.register(tool);
    registry.register(agent);

    expect(registry.get("tool", "tool-a")).toBe(tool);
    expect(registry.has("agent", "agent-a")).toBe(true);
    expect(registry.getAll()).toHaveLength(2);

    registry.clear();

    expect(registry.getAll()).toEqual([]);
    expect(registry.has("tool", "tool-a")).toBe(false);
  });

  it("getAll() supports type filter", () => {
    const registry = new PluginRegistry();
    const toolA = makeLoadedPlugin("tool", "tool-a");
    const toolB = makeLoadedPlugin("tool", "tool-b");
    const patternA = makeLoadedPlugin("pattern", "pattern-a");

    registry.register(toolA);
    registry.register(toolB);
    registry.register(patternA);

    expect(registry.getAll("tool")).toEqual([toolA, toolB]);
    expect(registry.getAll("pattern")).toEqual([patternA]);
  });

  it("resolvePluginType() resolves aliases and canonical types", () => {
    expect(resolvePluginType("policy")).toBe("policy-rule");
    expect(resolvePluginType("consensus-rule")).toBe("consensus-rule");
  });

  it("resolvePluginType() throws on unknown type", () => {
    expect(() => resolvePluginType("nope")).toThrowError(/Unknown plugin type/);
  });
});

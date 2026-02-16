import { describe, expect, it, vi } from "vitest";

import { PatternRegistry } from "../../patterns/PatternRegistry.js";
import { PipelinePattern } from "../../patterns/builtin/PipelinePattern.js";
import { PluginLoader } from "../PluginLoader.js";
import { PluginRegistry } from "../PluginRegistry.js";
import {
  createBuiltinPlugins,
  FileWriteToolPlugin,
  registerBuiltinPlugins,
} from "../builtins.js";
import { validatePlugin } from "../validator.js";

describe("plugin validation", () => {
  it("rejects missing required fields", () => {
    const result = validatePlugin({ type: "tool" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("plugin.name is required");
    expect(result.errors).toContain("plugin.version is required");
  });

  it("validates required interface methods by plugin type", () => {
    const result = validatePlugin({
      name: "bad-tool",
      version: "1.0.0",
      type: "tool",
      schema: {},
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("plugin.execute is required for type 'tool'");
  });
});

describe("PluginRegistry", () => {
  it("registers and retrieves plugins by type and name", async () => {
    const registry = new PluginRegistry();
    const plugin = createBuiltinPlugins().find((item) => item.type === "pattern" && item.name === "pipeline");

    if (!plugin) {
      throw new Error("pipeline plugin must exist");
    }

    await registry.register(plugin);

    expect(registry.has("pattern", "pipeline")).toBe(true);
    expect(registry.get("pattern", "pipeline").name).toBe("pipeline");
    expect(registry.list("pattern")).toHaveLength(1);
  });

  it("supports replacement and unload lifecycle", async () => {
    const registry = new PluginRegistry();
    const onUnload = vi.fn(async () => {});

    await registry.register({
      name: "identity-transform",
      version: "1.0.0",
      type: "state-transform",
      transform: (value: unknown) => value,
      onUnload,
    });

    await registry.register(
      {
        name: "identity-transform",
        version: "2.0.0",
        type: "state-transform",
        transform: (value: unknown) => ({ wrapped: value }),
      },
      { replace: true }
    );

    expect(onUnload).toHaveBeenCalledTimes(1);
    expect(registry.get("state-transform", "identity-transform").version).toBe("2.0.0");
  });
});

describe("PluginLoader", () => {
  it("loads and unloads plugin instances dynamically", async () => {
    const registry = new PluginRegistry();
    const loader = new PluginLoader(registry);
    const plugin = new FileWriteToolPlugin(process.cwd());

    await loader.load(plugin);
    expect(loader.listLoaded()).toContain("file-write");
    expect(registry.has("tool", "file-write")).toBe(true);

    await loader.unload("file-write");
    expect(loader.listLoaded()).not.toContain("file-write");
    expect(registry.has("tool", "file-write")).toBe(false);
  });
});

describe("builtin plugin bootstrap", () => {
  it("registers all 8 plugin types as built-ins", async () => {
    const registry = new PluginRegistry();
    await registerBuiltinPlugins(registry);

    const types = new Set(registry.list().map((plugin) => plugin.type));
    expect(types).toEqual(
      new Set([
        "agent",
        "tool",
        "pattern",
        "policy-rule",
        "recovery-strategy",
        "consensus-rule",
        "audit-store",
        "state-transform",
      ])
    );
  });
});

describe("PatternRegistry + PipelinePattern", () => {
  it("executes pipeline pattern sequentially", async () => {
    const registry = new PatternRegistry();
    registry.register(new PipelinePattern());

    const result = await registry.get("pipeline").execute({
      input: 1,
      steps: [(value) => Number(value) + 2, (value) => Number(value) * 3],
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe(9);
    expect(result.metadata?.steps).toBe(2);
  });
});

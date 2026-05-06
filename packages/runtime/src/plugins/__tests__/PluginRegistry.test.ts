import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { PatternRegistry } from "../../patterns/PatternRegistry.js";
import { PipelinePattern } from "../../patterns/builtin/PipelinePattern.js";
import { PluginLoader } from "../PluginLoader.js";
import { PluginRegistry } from "../PluginRegistry.js";
import {
  AllowAllPolicyRulePlugin,
  BuiltinAgentPlugin,
  createBuiltinPlugins,
  FileWriteToolPlugin,
  IdentityStateTransformPlugin,
  InMemoryAuditStorePlugin,
  MajorityConsensusRulePlugin,
  registerBuiltinPlugins,
  RetryRecoveryStrategyPlugin,
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

  it("returns an optional composite pattern plugin when a pattern registry is provided", () => {
    const patternRegistry = new PatternRegistry();
    const plugins = createBuiltinPlugins({ patternRegistry });

    expect(plugins.some((plugin) => plugin.type === "pattern" && plugin.name === "composite")).toBe(true);
  });

  it("exercises simple builtin plugin contracts", async () => {
    expect(new BuiltinAgentPlugin().createAgent({ role: "writer" })).toEqual({
      kind: "builtin-agent",
      config: { role: "writer" },
    });
    expect(new AllowAllPolicyRulePlugin().evaluate()).toEqual({ type: "allow" });
    await expect(new RetryRecoveryStrategyPlugin().handle()).resolves.toEqual({ status: "recovered" });
    expect(new IdentityStateTransformPlugin().transform({ unchanged: true })).toEqual({ unchanged: true });
  });

  it("evaluates majority consensus votes", () => {
    const rule = new MajorityConsensusRulePlugin();

    expect(rule.evaluate([{ approved: true }, { approved: false }, { approved: true }])).toEqual({
      status: "pass",
      approved: 2,
      total: 3,
    });
    expect(rule.evaluate([{ approved: false }, null, { approved: true }])).toEqual({
      status: "fail",
      approved: 1,
      total: 3,
    });
  });

  it("records and queries audit events through the in-memory audit store plugin", async () => {
    const store = new InMemoryAuditStorePlugin();
    const event = {
      id: "audit-1",
      executionId: "exec-1",
      timestamp: new Date("2026-05-06T00:00:00.000Z"),
      type: "step_end" as const,
      data: { stepId: "step-1" },
    };

    await store.record(event);

    await expect(store.query({ executionId: "exec-1" })).resolves.toEqual([event]);
    await expect(store.query({ executionId: "other" })).resolves.toEqual([]);
  });

  it("writes files inside the configured sandbox root", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-file-write-"));
    try {
      const plugin = new FileWriteToolPlugin(root);
      const result = await plugin.execute({
        path: "nested/output.txt",
        content: "hello runtime",
      });

      expect(result).toEqual({
        path: join(root, "nested/output.txt"),
        bytes: Buffer.byteLength("hello runtime", "utf8"),
      });
      await expect(readFile(join(root, "nested/output.txt"), "utf8")).resolves.toBe("hello runtime");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects invalid file-write parameters and paths outside the sandbox root", async () => {
    const root = await mkdtemp(join(tmpdir(), "obora-file-write-"));
    try {
      const plugin = new FileWriteToolPlugin(root);

      await expect(plugin.execute(null)).rejects.toThrow("file-write params must be an object");
      await expect(plugin.execute({ path: " ", content: "x" })).rejects.toThrow(
        "file-write params.path must be a non-empty string"
      );
      await expect(plugin.execute({ path: "output.txt", content: 1 })).rejects.toThrow(
        "file-write params.content must be a string"
      );
      await expect(plugin.execute({ path: "../outside.txt", content: "x" })).rejects.toThrow(
        "outside sandbox root"
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("PatternRegistry + PipelinePattern", () => {
  it("executes pipeline pattern sequentially", async () => {
    const registry = new PatternRegistry();
    registry.register(new PipelinePattern());

    const result = await registry.get("pipeline").execute({
      pattern: "pipeline",
      input: 1,
      steps: [(value) => Number(value) + 2, (value) => Number(value) * 3],
    });

    expect(result.success).toBe(true);
    expect(result.output).toBe(9);
    expect(result.metadata?.steps).toBe(2);
  });

  it("can resolve pattern plugins through PluginRegistry facade", async () => {
    const pluginRegistry = new PluginRegistry();
    await registerBuiltinPlugins(pluginRegistry);

    const registry = new PatternRegistry(pluginRegistry);
    expect(registry.has("pipeline")).toBe(true);

    const result = await registry.get("pipeline").execute({
      pattern: "pipeline",
      input: 3,
      steps: [(value) => Number(value) + 1],
    });

    expect(result.output).toBe(4);
    expect(registry.list().some((pattern) => pattern.name === "pipeline")).toBe(true);
  });
});

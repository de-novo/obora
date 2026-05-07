import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FileAuthManager } from "../../auth/index.js";
import { AgentConfigResolver } from "../../agents/config-resolver.js";
import { buildAgentResolutionSnapshot } from "../../agents/resolution-snapshot.js";

async function withIsolatedResolver(
  testFn: (ctx: {
    homeDir: string;
    projectDir: string;
    cwdBefore: string;
    homeBefore: string | undefined;
  }) => Promise<void>
) {
  const homeDir = await mkdtemp(join(tmpdir(), "obora-agents-home-"));
  const projectDir = await mkdtemp(join(tmpdir(), "obora-agents-project-"));
  const cwdBefore = process.cwd();
  const homeBefore = process.env.HOME;

  process.env.HOME = homeDir;
  process.chdir(projectDir);

  try {
    await testFn({ homeDir, projectDir, cwdBefore, homeBefore });
  } finally {
    process.chdir(cwdBefore);
    if (homeBefore === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = homeBefore;
    }
  }
}

describe("agent resolution snapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures layered provenance from auth/global/project/provider/agent config", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([
      {
        provider: "anthropic",
        type: "apiKey",
        apiKey: "anthropic-key",
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await withIsolatedResolver(async ({ homeDir, projectDir }) => {
      await mkdir(join(homeDir, ".obora"), { recursive: true });
      await writeFile(
        join(homeDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  temperature: 0.3",
          "providers:",
          "  anthropic:",
          "    defaultModel: claude-opus-4-6",
          "    maxTokens: 8192",
          "agents:",
          "  reviewer:",
          "    systemPrompt: Global reviewer",
        ].join("\n"),
        "utf-8"
      );

      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  temperature: 0.4",
          "providers:",
          "  anthropic:",
          "    timeout: 90",
          "agents:",
          "  reviewer:",
          "    baseUrl: https://project.example.test/v1",
        ].join("\n"),
        "utf-8"
      );

      const resolver = await AgentConfigResolver.create(projectDir);
      const snapshot = resolver.snapshot("reviewer");

      expect(snapshot.status).toBe("resolved");
      expect(snapshot.resolved).toMatchObject({
        provider: "anthropic",
        model: "claude-opus-4-6",
        temperature: 0.4,
        maxTokens: 8192,
        timeout: 90,
        systemPrompt: "Global reviewer",
        baseUrl: "https://project.example.test/v1",
      });
      expect(snapshot.layers.map((layer) => layer.kind)).toEqual([
        "builtin-defaults",
        "auth-aware-defaults",
        "global-defaults",
        "project-defaults",
        "global-provider",
        "project-provider",
        "global-agent",
        "project-agent",
      ]);
      expect(snapshot.layers[0]?.applied).toMatchObject({
        provider: "pi-mono",
        model: "pi-mono-1",
      });
      expect(snapshot.layers[1]?.applied).toMatchObject({ provider: "anthropic" });
      expect(snapshot.warnings).toEqual([]);
    });
  });

  it("returns structured unresolved snapshot when provider/model cannot be determined", () => {
    const snapshot = buildAgentResolutionSnapshot({
      agentName: "missing-agent",
      globalConfig: {},
      projectConfig: {},
      authAwareDefaults: {},
      builtinDefaults: {} as never,
    });

    expect(snapshot.status).toBe("unresolved");
    expect(snapshot.failure).toEqual({
      code: "provider-model-required",
      message: "Unable to resolve agent config for 'missing-agent': provider/model is required",
    });
    expect(snapshot.warnings).toContain("provider/model is required");
    expect(snapshot.resolved).toEqual({});
  });

  it("does not include execution-only sources in adapters snapshots", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedResolver(async ({ projectDir }) => {
      const resolver = await AgentConfigResolver.create(projectDir);
      const snapshot = resolver.snapshot("default");

      expect("executionSources" in snapshot).toBe(false);
    });
  });

  it("lists visible agent inventory without forcing resolution", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedResolver(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "agents:",
          "  reviewer:",
          "    provider: openai",
          "    model: gpt-5",
          "  critic:",
          "    provider: anthropic",
        ].join("\n"),
        "utf-8"
      );

      const resolver = await AgentConfigResolver.create(projectDir);

      expect(resolver.listAgentInventory()).toEqual([
        { name: "critic", source: "config" },
        { name: "reviewer", source: "config" },
      ]);
    });
  });

  it("exposes default fallback inventory when no named agents are configured", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedResolver(async ({ projectDir }) => {
      const resolver = await AgentConfigResolver.create(projectDir);

      expect(resolver.listAgentInventory()).toEqual([
        { name: "default", source: "default-fallback" },
      ]);
    });
  });

  it("resolves concrete agent configs and applies step-level provider/model overrides", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedResolver(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  temperature: 0.45",
          "  timeout: 60",
          "agents:",
          "  critic:",
          "    provider: anthropic",
          "    model: claude-opus-4-6",
          "  reviewer:",
          "    provider: openai",
          "    model: gpt-5",
          "    maxTokens: 2048",
        ].join("\n"),
        "utf-8"
      );

      const resolver = await AgentConfigResolver.create(projectDir);

      expect(resolver.resolve("reviewer")).toMatchObject({
        provider: "openai",
        model: "gpt-5",
        temperature: 0.45,
        timeout: 60,
        maxTokens: 2048,
      });
      expect(resolver.resolveForStep("reviewer")).toEqual(resolver.resolve("reviewer"));
      expect(resolver.resolveForStep("reviewer", { model: "gpt-5.2" })).toMatchObject({
        provider: "openai",
        model: "gpt-5.2",
      });
      expect(resolver.resolveForStep("reviewer", { provider: "anthropic" })).toMatchObject({
        provider: "anthropic",
        model: "gpt-5",
      });
      expect(resolver.listAgents().map((entry) => entry.name)).toEqual(["critic", "reviewer"]);
    });
  });
});

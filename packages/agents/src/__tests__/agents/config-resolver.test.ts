import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentConfigResolver } from "../../agents/config-resolver";

const cleanupPaths: string[] = [];

async function setupConfig(dir: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(dir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, "utf-8");
}

afterEach(async () => {
  await Promise.all(cleanupPaths.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("AgentConfigResolver", () => {
  it("uses auth-aware provider/model defaults when no config defaults exist", async () => {
    const originalHome = process.env.HOME;
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "obora-home-"));
    const tempProject = await mkdtemp(path.join(os.tmpdir(), "obora-project-"));
    cleanupPaths.push(tempHome, tempProject);

    try {
      process.env.HOME = tempHome;

      await setupConfig(
        tempHome,
        ".obora/auth.json",
        JSON.stringify({
          version: 1,
          providers: {
            openai: {
              provider: "openai",
              type: "apiKey",
              apiKey: "test-key",
              addedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            anthropic: {
              provider: "anthropic",
              type: "apiKey",
              apiKey: "test-key",
              addedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        })
      );

      const resolver = await AgentConfigResolver.create(tempProject);
      const resolved = resolver.resolve("default");

      expect(resolved.provider).toBe("anthropic");
      expect(resolved.model).toBe("claude-opus-4-1-20250805");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("resolves using 7-step merge with provider shallow merge", async () => {
    const originalHome = process.env.HOME;
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "obora-home-"));
    const tempProject = await mkdtemp(path.join(os.tmpdir(), "obora-project-"));
    cleanupPaths.push(tempHome, tempProject);

    try {
      process.env.HOME = tempHome;

      await setupConfig(
        tempHome,
        ".obora/config.yaml",
        `defaults:\n  provider: openai\n  model: global-default\n  timeout: 90\nproviders:\n  openai:\n    baseUrl: https://global.example\n    defaultModel: gpt-global\nagents:\n  reviewer:\n    systemPrompt: global prompt\n`
      );

      await setupConfig(
        tempProject,
        ".obora/config.yaml",
        `defaults:\n  maxTokens: 1024\nproviders:\n  openai:\n    defaultModel: gpt-project\nagents:\n  reviewer:\n    provider: anthropic\n    model: claude-opus-4-6\n    temperature: 0.1\n`
      );

      const resolver = await AgentConfigResolver.create(tempProject);
      const resolved = resolver.resolve("reviewer");

      expect(resolved.provider).toBe("anthropic");
      expect(resolved.model).toBe("claude-opus-4-6");
      expect(resolved.baseUrl).toBe("https://global.example");
      expect(resolved.maxTokens).toBe(1024);
      expect(resolved.systemPrompt).toBe("global prompt");
      expect(resolved.temperature).toBe(0.1);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("applies step override precedence while inheriting provider for model-only override", async () => {
    const originalHome = process.env.HOME;
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "obora-home-"));
    const tempProject = await mkdtemp(path.join(os.tmpdir(), "obora-project-"));
    cleanupPaths.push(tempHome, tempProject);

    try {
      process.env.HOME = tempHome;

      await setupConfig(
        tempHome,
        ".obora/config.yaml",
        `defaults:\n  provider: openai\n  model: gpt-4o-mini\nagents:\n  reviewer:\n    provider: anthropic\n    model: claude-3-5-sonnet-latest\n`
      );

      const resolver = await AgentConfigResolver.create(tempProject);

      const modelOnly = resolver.resolveForStep("reviewer", { model: "claude-haiku-4" });
      expect(modelOnly.provider).toBe("anthropic");
      expect(modelOnly.model).toBe("claude-haiku-4");

      const providerOnly = resolver.resolveForStep("reviewer", { provider: "openai" });
      expect(providerOnly.provider).toBe("openai");
      expect(providerOnly.model).toBe("claude-3-5-sonnet-latest");

      const full = resolver.resolveForStep("reviewer", { provider: "openai", model: "gpt-4.1" });
      expect(full.provider).toBe("openai");
      expect(full.model).toBe("gpt-4.1");
    } finally {
      process.env.HOME = originalHome;
    }
  });

  it("lists agents from global and project maps", async () => {
    const originalHome = process.env.HOME;
    const tempHome = await mkdtemp(path.join(os.tmpdir(), "obora-home-"));
    const tempProject = await mkdtemp(path.join(os.tmpdir(), "obora-project-"));
    cleanupPaths.push(tempHome, tempProject);

    try {
      process.env.HOME = tempHome;

      await setupConfig(
        tempHome,
        ".obora/config.yaml",
        `agents:\n  architect:\n    provider: openai\n    model: gpt-4o\n`
      );
      await setupConfig(
        tempProject,
        ".obora/config.yaml",
        `agents:\n  reviewer:\n    provider: anthropic\n    model: claude-opus-4-6\n`
      );

      const resolver = await AgentConfigResolver.create(tempProject);
      const list = resolver.listAgents();

      expect(list.map((x) => x.name)).toEqual(["architect", "reviewer"]);
    } finally {
      process.env.HOME = originalHome;
    }
  });
});

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadConfig, resolveProviderConfig } from "../config-loader.js";
import { OboraErrorCode } from "../runtime.js";

async function withIsolatedDirs(testFn: (ctx: { homeDir: string; projectDir: string; cwdBefore: string; homeBefore: string | undefined }) => Promise<void>) {
  const homeDir = await mkdtemp(join(tmpdir(), "obora-home-"));
  const projectDir = await mkdtemp(join(tmpdir(), "obora-project-"));
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

describe("config-loader", () => {
  afterEach(() => {
    delete process.env.TEST_ANTHROPIC_KEY;
    delete process.env.TEST_ZAI_KEY;
  });

  it("loads explicit --config path", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, "custom.yaml");
      await writeFile(explicit, "defaults:\n  provider: anthropic\n", "utf-8");

      const loaded = await loadConfig(explicit);
      expect(loaded?.defaults?.provider).toBe("anthropic");
    });
  });

  it("deep-merges global and project config at providers/agents level", async () => {
    await withIsolatedDirs(async ({ homeDir, projectDir }) => {
      await mkdir(join(homeDir, ".obora"), { recursive: true });
      await writeFile(
        join(homeDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  provider: anthropic",
          "  model: claude-opus-4-6",
          "providers:",
          "  anthropic:",
          "    authRef: env:TEST_ANTHROPIC_KEY",
          "    defaultModel: claude-opus-4-6",
          "    baseUrl: https://api.anthropic.com",
          "  openai:",
          "    authRef: env:TEST_OPENAI_KEY",
          "    defaultModel: gpt-5",
          "agents:",
          "  planner:",
          "    provider: anthropic",
          "    model: claude-opus-4-6",
        ].join("\n"),
        "utf-8",
      );

      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  model: claude-opus-4-5",
          "providers:",
          "  anthropic:",
          "    defaultModel: claude-opus-4-5",
          "agents:",
          "  planner:",
          "    model: claude-opus-4-5",
        ].join("\n"),
        "utf-8",
      );

      process.env.TEST_ANTHROPIC_KEY = "anthropic-key";

      const loaded = await loadConfig();
      expect(loaded?.defaults?.provider).toBe("anthropic");
      expect(loaded?.defaults?.model).toBe("claude-opus-4-5");
      expect(loaded?.providers?.anthropic?.authRef).toBe("env:TEST_ANTHROPIC_KEY");
      expect(loaded?.providers?.anthropic?.defaultModel).toBe("claude-opus-4-5");
      expect(loaded?.providers?.anthropic?.baseUrl).toBe("https://api.anthropic.com");
      expect(loaded?.providers?.openai?.defaultModel).toBe("gpt-5");
      expect(loaded?.agents?.planner?.provider).toBe("anthropic");
      expect(loaded?.agents?.planner?.model).toBe("claude-opus-4-5");

      const provider = loaded ? resolveProviderConfig(loaded) : undefined;
      expect(provider?.apiKey).toBe("anthropic-key");
      expect(provider?.model).toBe("claude-opus-4-5");
    });
  });

  it("throws OboraError when YAML parse fails", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, "broken.yaml");
      await writeFile(explicit, "defaults: [", "utf-8");

      await expect(loadConfig(explicit)).rejects.toThrowError(
        expect.objectContaining({
          code: OboraErrorCode.SDK_INVALID_CONFIG,
          message: expect.stringContaining(explicit),
        }),
      );
    });
  });

  it.each([
    ["null", "null", "null"],
    ["scalar string", "just-a-string", "string"],
    ["scalar number", "123", "number"],
    ["array", "- item1\n- item2", "array"],
  ])("throws OboraError when YAML root is %s", async (_label, content, typeName) => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, `invalid-${typeName}.yaml`);
      await writeFile(explicit, content, "utf-8");

      await expect(loadConfig(explicit)).rejects.toThrowError(
        expect.objectContaining({
          code: OboraErrorCode.SDK_INVALID_CONFIG,
          message: `Config must be a YAML object (mapping), got: ${typeName}`,
        }),
      );
    });
  });

  it("throws OboraError when explicit --config path does not exist", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, "missing.yaml");
      await expect(loadConfig(explicit)).rejects.toThrowError(
        expect.objectContaining({
          code: OboraErrorCode.SDK_INVALID_CONFIG,
          message: expect.stringContaining(explicit),
        }),
      );
    });
  });

  it("warns in verbose mode when provider is missing", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, "custom.yaml");
      await writeFile(explicit, "defaults:\n  provider: missing\n", "utf-8");
      const loaded = await loadConfig(explicit);
      const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const resolved = loaded ? resolveProviderConfig(loaded, "missing", { verbose: true }) : undefined;
      expect(resolved).toBeUndefined();
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("missing"));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining(explicit));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("Next action: export MISSING_API_KEY=..."));
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("providers.missing.authRef"));
      warn.mockRestore();
    });
  });

  it("loads nearest parent .obora/config.yaml when running from a nested directory", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  provider: zai",
          "  model: glm-4.7",
          "providers:",
          "  zai:",
          "    authRef: env:TEST_ZAI_KEY",
          "    defaultModel: glm-4.7",
        ].join("\n"),
        "utf-8",
      );

      const nestedDir = join(projectDir, ".sandbox", "01-hello-world");
      await mkdir(nestedDir, { recursive: true });
      process.chdir(nestedDir);
      process.env.TEST_ZAI_KEY = "zai-key";

      const loaded = await loadConfig();
      expect(loaded?.defaults?.provider).toBe("zai");
      expect(loaded?.defaults?.model).toBe("glm-4.7");

      const provider = loaded ? resolveProviderConfig(loaded) : undefined;
      expect(provider?.apiKey).toBe("zai-key");
      expect(provider?.model).toBe("glm-4.7");
    });
  });

  it("returns undefined when no config files exist", async () => {
    await withIsolatedDirs(async () => {
      const loaded = await loadConfig();
      expect(loaded).toBeUndefined();
    });
  });
});

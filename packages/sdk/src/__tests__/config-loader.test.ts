import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadConfig, resolveProviderConfig } from "../config-loader.js";

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
  });

  it("loads explicit --config path", async () => {
    await withIsolatedDirs(async ({ projectDir }) => {
      const explicit = join(projectDir, "custom.yaml");
      await writeFile(explicit, "defaults:\n  provider: anthropic\n", "utf-8");

      const loaded = await loadConfig(explicit);
      expect(loaded?.defaults?.provider).toBe("anthropic");
    });
  });

  it("merges global then project override", async () => {
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
        ].join("\n"),
        "utf-8",
      );

      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  model: claude-opus-4-5",
          "agents:",
          "  planner:",
          "    provider: anthropic",
          "    model: claude-opus-4-5",
        ].join("\n"),
        "utf-8",
      );

      process.env.TEST_ANTHROPIC_KEY = "anthropic-key";

      const loaded = await loadConfig();
      expect(loaded?.defaults?.provider).toBe("anthropic");
      expect(loaded?.defaults?.model).toBe("claude-opus-4-5");
      expect(loaded?.agents?.planner?.model).toBe("claude-opus-4-5");

      const provider = loaded ? resolveProviderConfig(loaded) : undefined;
      expect(provider?.apiKey).toBe("anthropic-key");
      expect(provider?.model).toBe("claude-opus-4-6");
    });
  });

  it("returns undefined when no config files exist", async () => {
    await withIsolatedDirs(async () => {
      const loaded = await loadConfig();
      expect(loaded).toBeUndefined();
    });
  });
});

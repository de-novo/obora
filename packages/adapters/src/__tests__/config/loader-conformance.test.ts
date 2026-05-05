import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getGlobalConfigPath,
  getProjectConfigPath,
  loadConfigFile,
  validateConfig,
} from "../../config/loader";

describe("config loader conformance", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("validates defaults, providers, agents, and review model arrays", () => {
    const config = validateConfig("config.yaml", {
      defaults: {
        provider: "openai",
        model: "gpt-4o-mini",
        temperature: 0.2,
        maxTokens: 1024,
        timeout: 120,
        systemPrompt: "Default prompt",
        baseUrl: "https://api.test/v1",
        reviewModels: [
          { name: "reviewer", provider: "anthropic", model: "claude-opus" },
        ],
      },
      providers: {
        openai: {
          baseUrl: "https://api.openai.test/v1",
          defaultModel: "gpt-4o-mini",
          timeout: 60,
          maxTokens: 2048,
        },
      },
      agents: {
        writer: {
          provider: "google",
          model: "gemini",
          reviewModels: [
            { provider: "openai", model: "gpt-4o-mini" },
          ],
        },
      },
    });

    expect(config.defaults).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
      reviewModels: [{ name: "reviewer", provider: "anthropic", model: "claude-opus" }],
    });
    expect(config.providers?.openai).toEqual({
      baseUrl: "https://api.openai.test/v1",
      defaultModel: "gpt-4o-mini",
      timeout: 60,
      maxTokens: 2048,
    });
    expect(config.agents?.writer).toEqual({
      provider: "google",
      model: "gemini",
      reviewModels: [{ provider: "openai", model: "gpt-4o-mini" }],
    });
  });

  it("rejects invalid root, provider, agent, and review model shapes", () => {
    expect(() => validateConfig("config.yaml", [])).toThrow("root must be an object");
    expect(() =>
      validateConfig("config.yaml", { providers: { openai: "bad" } })
    ).toThrow("providers.openai must be an object");
    expect(() =>
      validateConfig("config.yaml", { providers: { openai: { timeout: "slow" } } })
    ).toThrow("providers.openai.timeout must be a number");
    expect(() => validateConfig("config.yaml", { agents: { writer: "bad" } })).toThrow(
      "agents.writer must be an object"
    );
    expect(() =>
      validateConfig("config.yaml", { agents: { writer: { provider: 1 } } })
    ).toThrow("agents.writer.provider must be a string");
    expect(() =>
      validateConfig("config.yaml", { agents: { writer: { reviewModels: "bad" } } })
    ).toThrow("agents.writer.reviewModels must be an array");
    expect(() =>
      validateConfig("config.yaml", {
        agents: { writer: { reviewModels: [{ provider: "openai" }] } },
      })
    ).toThrow("agents.writer.reviewModels[0].provider and agents.writer.reviewModels[0].model are required");
    expect(() =>
      validateConfig("config.yaml", {
        agents: { writer: { reviewModels: ["bad"] } },
      })
    ).toThrow("agents.writer.reviewModels[0] must be an object");
  });

  it("loads missing, empty, null, and YAML config files without external state", async () => {
    const dir = await mkdtemp(join(tmpdir(), "obora-adapters-config-"));
    tempDirs.push(dir);

    const missing = join(dir, "missing.yaml");
    await expect(loadConfigFile(missing)).resolves.toEqual({});

    const empty = join(dir, "empty.yaml");
    writeFileSync(empty, "   \n");
    await expect(loadConfigFile(empty)).resolves.toEqual({});

    const nullYaml = join(dir, "null.yaml");
    writeFileSync(nullYaml, "null\n");
    await expect(loadConfigFile(nullYaml)).resolves.toEqual({});

    const configPath = join(dir, "config.yaml");
    writeFileSync(
      configPath,
      [
        "defaults:",
        "  provider: openai",
        "  model: gpt-4o-mini",
        "providers:",
        "  openai:",
        "    defaultModel: gpt-4o-mini",
      ].join("\n")
    );

    await expect(loadConfigFile(configPath)).resolves.toMatchObject({
      defaults: { provider: "openai", model: "gpt-4o-mini" },
      providers: { openai: { defaultModel: "gpt-4o-mini" } },
    });
  });

  it("resolves global and project config paths deterministically", () => {
    const cwd = join(tmpdir(), "obora-project");
    mkdirSync(cwd, { recursive: true });
    tempDirs.push(cwd);

    expect(getProjectConfigPath(cwd)).toBe(join(cwd, ".obora", "config.yaml"));
    expect(getGlobalConfigPath()).toMatch(/\.obora\/config\.yaml$/);
  });
});

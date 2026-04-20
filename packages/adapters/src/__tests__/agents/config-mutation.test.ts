import { access, mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { applyAgentOverride, previewAgentOverride } from "../../agents/config-mutation.js";
import { listPiAIModels } from "../../llm/pi-ai-adapter.js";

async function withIsolatedMutationContext(
  testFn: (ctx: {
    homeDir: string;
    projectDir: string;
    cwdBefore: string;
    homeBefore: string | undefined;
  }) => Promise<void>
) {
  const homeDir = await mkdtemp(join(tmpdir(), "obora-agents-mutation-home-"));
  const projectDir = await mkdtemp(join(tmpdir(), "obora-agents-mutation-project-"));
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

describe("agent config mutation preview", () => {
  afterEach(() => {
    delete process.env.HOME;
  });

  it("builds project-scope set preview and preserves unrelated top-level config", async () => {
    const openaiModels = listPiAIModels("openai");
    const currentModel = openaiModels[0] ?? "gpt-4o-mini";
    const nextModel = openaiModels.find((model) => model !== currentModel) ?? currentModel;

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  temperature: 0.4",
          "persistence:",
          "  enabled: true",
          "agents:",
          "  reviewer:",
          `    provider: openai`,
          `    model: ${currentModel}`,
          "    timeout: 90",
        ].join("\n"),
        "utf-8"
      );

      const preview = await previewAgentOverride({
        action: "set",
        scope: "project",
        cwd: projectDir,
        agentName: "reviewer",
        provider: "openai",
        model: nextModel,
      });

      expect(preview).toMatchObject({
        action: "set",
        scope: "project",
        agentName: "reviewer",
        targetPath: join(projectDir, ".obora", "config.yaml"),
        before: {
          provider: "openai",
          model: currentModel,
          timeout: 90,
        },
        after: {
          provider: "openai",
          model: nextModel,
          timeout: 90,
        },
        warnings: [],
      });
      expect(preview.nextConfigDocument).toMatchObject({
        defaults: {
          temperature: 0.4,
        },
        persistence: {
          enabled: true,
        },
        agents: {
          reviewer: {
            provider: "openai",
            model: nextModel,
            timeout: 90,
          },
        },
      });
    });
  });

  it("supports model-only preview when target config already owns provider", async () => {
    const openaiModels = listPiAIModels("openai");
    const currentModel = openaiModels[0] ?? "gpt-4o-mini";
    const nextModel = openaiModels.find((model) => model !== currentModel) ?? currentModel;

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "agents:",
          "  reviewer:",
          "    provider: openai",
          `    model: ${currentModel}`,
          "    timeout: 90",
        ].join("\n"),
        "utf-8"
      );

      const preview = await previewAgentOverride({
        action: "set",
        scope: "project",
        cwd: projectDir,
        agentName: "reviewer",
        model: nextModel,
      });

      expect(preview.before).toMatchObject({
        provider: "openai",
        model: currentModel,
        timeout: 90,
      });
      expect(preview.after).toMatchObject({
        provider: "openai",
        model: nextModel,
        timeout: 90,
      });
    });
  });

  it("supports provider-only preview when target config already owns model", async () => {
    const openaiModel = listPiAIModels("openai")[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "agents:",
          "  reviewer:",
          "    provider: openai",
          `    model: ${openaiModel}`,
          "    timeout: 90",
        ].join("\n"),
        "utf-8"
      );

      const preview = await previewAgentOverride({
        action: "set",
        scope: "project",
        cwd: projectDir,
        agentName: "reviewer",
        provider: "openai",
      });

      expect(preview.before).toMatchObject({
        provider: "openai",
        model: openaiModel,
        timeout: 90,
      });
      expect(preview.after).toMatchObject({
        provider: "openai",
        model: openaiModel,
        timeout: 90,
      });
    });
  });

  it("builds global-scope reset preview and preserves sibling agents plus unrelated keys", async () => {
    const openaiModel = listPiAIModels("openai")[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ homeDir, projectDir }) => {
      await mkdir(join(homeDir, ".obora"), { recursive: true });
      await writeFile(
        join(homeDir, ".obora", "config.yaml"),
        [
          "dlq:",
          "  enabled: true",
          "agents:",
          "  reviewer:",
          "    provider: openai",
          `    model: ${openaiModel}`,
          "  critic:",
          "    provider: openai",
          `    model: ${openaiModel}`,
        ].join("\n"),
        "utf-8"
      );

      const preview = await previewAgentOverride({
        action: "reset",
        scope: "global",
        cwd: projectDir,
        agentName: "reviewer",
      });

      expect(preview).toMatchObject({
        action: "reset",
        scope: "global",
        agentName: "reviewer",
        targetPath: join(homeDir, ".obora", "config.yaml"),
        before: {
          provider: "openai",
          model: openaiModel,
        },
        after: null,
        warnings: [],
      });
      expect(preview.nextConfigDocument).toMatchObject({
        dlq: {
          enabled: true,
        },
        agents: {
          critic: {
            provider: "openai",
            model: openaiModel,
          },
        },
      });
      expect(
        (preview.nextConfigDocument.agents as Record<string, unknown>).reviewer
      ).toBeUndefined();
    });
  });

  it("rejects invalid mutation scopes", async () => {
    await withIsolatedMutationContext(async ({ projectDir }) => {
      await expect(
        previewAgentOverride({
          action: "reset",
          scope: "workspace",
          cwd: projectDir,
          agentName: "reviewer",
        })
      ).rejects.toThrow("Invalid agents scope: workspace. Supported scopes: project, global");
    });
  });

  it("rejects partial set overrides when the target layer does not already own the missing field", async () => {
    const openaiModel = listPiAIModels("openai")[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        ["agents:", "  reviewer:", "    timeout: 90"].join("\n"),
        "utf-8"
      );

      await expect(
        previewAgentOverride({
          action: "set",
          scope: "project",
          cwd: projectDir,
          agentName: "reviewer",
          model: openaiModel,
        })
      ).rejects.toThrow(
        "Model-only override requires an existing provider in target config; pass --provider explicitly"
      );

      await expect(
        previewAgentOverride({
          action: "set",
          scope: "project",
          cwd: projectDir,
          agentName: "reviewer",
          provider: "openai",
        })
      ).rejects.toThrow(
        "Provider-only override requires an existing model in target config; pass --model explicitly"
      );
    });
  });

  it("rejects unsupported provider and model override targets", async () => {
    await withIsolatedMutationContext(async ({ projectDir }) => {
      await expect(
        previewAgentOverride({
          action: "set",
          scope: "project",
          cwd: projectDir,
          agentName: "reviewer",
          provider: "not-a-provider",
          model: "no-model",
        })
      ).rejects.toThrow("Unsupported agent provider override: not-a-provider");

      await expect(
        previewAgentOverride({
          action: "set",
          scope: "project",
          cwd: projectDir,
          agentName: "reviewer",
          provider: "openai",
          model: "definitely-not-a-real-openai-model",
        })
      ).rejects.toThrow(
        "Unsupported agent model override for provider openai: definitely-not-a-real-openai-model"
      );
    });
  });

  it("writes project-scope set overrides into a missing config file", async () => {
    const openaiModels = listPiAIModels("openai");
    const targetModel = openaiModels[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ projectDir }) => {
      const result = await applyAgentOverride({
        action: "set",
        scope: "project",
        cwd: projectDir,
        agentName: "reviewer",
        provider: "openai",
        model: targetModel,
      });

      expect(result.targetPath).toBe(join(projectDir, ".obora", "config.yaml"));
      expect(result.before).toBeNull();
      expect(result.after).toMatchObject({
        provider: "openai",
        model: targetModel,
      });

      const written = await readFile(join(projectDir, ".obora", "config.yaml"), "utf-8");
      expect(written).toContain("agents:");
      expect(written).toContain("reviewer:");
      expect(written).toContain(`model: ${targetModel}`);
    });
  });

  it("writes reset updates while preserving unrelated config keys", async () => {
    const openaiModel = listPiAIModels("openai")[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        [
          "defaults:",
          "  timeout: 120",
          "providers:",
          "  openai:",
          `    defaultModel: ${openaiModel}`,
          "agents:",
          "  reviewer:",
          "    provider: openai",
          `    model: ${openaiModel}`,
          "  critic:",
          "    provider: openai",
          `    model: ${openaiModel}`,
        ].join("\n"),
        "utf-8"
      );

      const result = await applyAgentOverride({
        action: "reset",
        scope: "project",
        cwd: projectDir,
        agentName: "reviewer",
      });

      expect(result.before).toMatchObject({
        provider: "openai",
        model: openaiModel,
      });
      expect(result.after).toBeNull();

      const written = await readFile(join(projectDir, ".obora", "config.yaml"), "utf-8");
      expect(written).toContain("defaults:");
      expect(written).toContain("timeout: 120");
      expect(written).toContain("providers:");
      expect(written).toContain(`defaultModel: ${openaiModel}`);
      expect(written).toContain("critic:");
      expect(written).not.toContain("reviewer:");
    });
  });

  it("cleans up temp files when atomic rename fails", async () => {
    const openaiModel = listPiAIModels("openai")[0] ?? "gpt-4o-mini";

    await withIsolatedMutationContext(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        ["agents:", "  reviewer:", "    provider: openai", `    model: ${openaiModel}`].join("\n"),
        "utf-8"
      );

      const targetPath = join(projectDir, ".obora", "config.yaml");
      const tempPath = `${targetPath}.tmp`;
      const original = await readFile(targetPath, "utf-8");

      await expect(
        applyAgentOverride(
          {
            action: "set",
            scope: "project",
            cwd: projectDir,
            agentName: "reviewer",
            provider: "openai",
            model: openaiModel,
          },
          {
            rename: async () => {
              throw new Error("disk locked");
            },
          }
        )
      ).rejects.toThrow("Failed to write agent override: disk locked");

      await expect(access(tempPath)).rejects.toThrow();
      expect(await readFile(targetPath, "utf-8")).toBe(original);
    });
  });
});

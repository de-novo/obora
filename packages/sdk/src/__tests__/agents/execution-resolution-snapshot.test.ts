import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FileAuthManager } from "@obora/adapters";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentFactory } from "../../runtime.js";
import { buildExecutionAgentSnapshot } from "../../agents/execution-resolution-snapshot.js";

async function withIsolatedProject(
  testFn: (ctx: {
    homeDir: string;
    projectDir: string;
    cwdBefore: string;
    homeBefore: string | undefined;
  }) => Promise<void>
) {
  const homeDir = await mkdtemp(join(tmpdir(), "obora-sdk-home-"));
  const projectDir = await mkdtemp(join(tmpdir(), "obora-sdk-project-"));
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

describe("execution-agent-resolution-snapshot", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds execution-only sources on top of the adapters base snapshot", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedProject(async ({ projectDir }) => {
      const agentsPath = join(projectDir, "agents.yaml");
      await writeFile(
        agentsPath,
        [
          "agents:",
          "  reviewer:",
          "    role: YAML Reviewer",
          "    provider: anthropic",
          "    model: claude-sonnet-4-5",
          "  yaml-only:",
          "    role: YAML Only",
        ].join("\n"),
        "utf-8"
      );

      const runtimeAgents = new Map<string, AgentFactory>([
        ["runtime-reviewer", () => ({ role: "Runtime Reviewer" })],
      ]);

      const snapshot = await buildExecutionAgentSnapshot({
        cwd: projectDir,
        agentName: "reviewer",
        agentsPath,
        workflow: {
          name: "workflow-agent-snapshot",
          agents: {
            reviewer: {
              role: "Workflow Reviewer",
              provider: "openai",
              model: "gpt-5",
            },
            "workflow-only": {
              role: "Workflow Only",
            },
          },
          steps: [],
        },
        runtimeAgents,
      });

      expect(snapshot.base.agentName).toBe("reviewer");
      expect(snapshot.base.status).toBe("resolved");
      expect(snapshot.executionSources.map((source) => source.kind)).toEqual([
        "agents-path",
        "workflow-agents",
        "runtime-registration",
      ]);
      expect(snapshot.executionSources[0]?.agentNames).toEqual(["reviewer", "yaml-only"]);
      expect(snapshot.executionSources[1]?.agentNames).toEqual(["reviewer", "workflow-only"]);
      expect(snapshot.executionSources[2]?.agentNames).toEqual(["runtime-reviewer"]);
      expect(snapshot.effectiveExecutionView).toEqual({
        agentName: "reviewer",
        hasAgentsPathEntry: true,
        hasWorkflowAgentEntry: true,
        hasRuntimeRegistration: false,
      });
    });
  });

  it("keeps base config provenance separate from execution sources", async () => {
    vi.spyOn(FileAuthManager.prototype, "listProviders").mockResolvedValue([]);

    await withIsolatedProject(async ({ projectDir }) => {
      await mkdir(join(projectDir, ".obora"), { recursive: true });
      await writeFile(
        join(projectDir, ".obora", "config.yaml"),
        ["agents:", "  reviewer:", "    provider: openai", "    model: gpt-4o-mini"].join("\n"),
        "utf-8"
      );

      const snapshot = await buildExecutionAgentSnapshot({
        cwd: projectDir,
        agentName: "reviewer",
        agentsPath: undefined,
        workflow: {
          name: "runtime-only-agent-snapshot",
          steps: [],
        },
        runtimeAgents: new Map<string, AgentFactory>([
          ["reviewer", () => ({ role: "Runtime Reviewer" })],
        ]),
      });

      expect(snapshot.base.layers.length).toBeGreaterThan(0);
      expect(snapshot.executionSources.map((source) => source.kind)).toEqual([
        "runtime-registration",
      ]);
      expect("executionSources" in snapshot.base).toBe(false);
      expect(snapshot.effectiveExecutionView.hasRuntimeRegistration).toBe(true);
    });
  });
});

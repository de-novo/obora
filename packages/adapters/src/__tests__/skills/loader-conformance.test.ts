import { describe, expect, it, vi } from "vitest";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import { SkillLoader } from "../../skills/loader";
import { SkillRegistry } from "../../skills/registry";
import type { LoadedSkill, OboraSkill, SkillContext } from "../../skills/types";

class StaticSkillRegistry extends SkillRegistry {
  constructor(private readonly entries: LoadedSkill[]) {
    super({ cwd: "/repo", localSkillsDir: "/missing-local", globalSkillsDir: "/missing-global" });
  }

  override listAvailableSync(): LoadedSkill[] {
    return this.entries;
  }
}

function createTool(name: string): AgentTool {
  return {
    name,
    label: name,
    description: `${name} tool`,
    parameters: Type.Object({}, { additionalProperties: true }),
    execute: async () => ({
      content: [{ type: "text", text: `${name} executed` }],
      details: {},
    }),
  };
}

function loadedSkill(
  name: string,
  options: Partial<OboraSkill> & { source?: LoadedSkill["source"] } = {}
): LoadedSkill {
  return {
    source: options.source ?? "local",
    skill: {
      name,
      description: `${name} skill`,
      version: "1.0.0",
      tools: options.tools ?? [],
      systemPrompt: options.systemPrompt,
      dependencies: options.dependencies,
      setup: options.setup,
      teardown: options.teardown,
    },
  };
}

describe("skill loader conformance", () => {
  it("loads dependencies first, de-duplicates visits, and assembles tools/prompts", async () => {
    const setupEvents: string[] = [];
    const context: SkillContext = { cwd: "/repo", agentId: "agent-1" };
    const base = loadedSkill("base", {
      systemPrompt: "Base prompt",
      tools: [createTool("base-tool")],
      setup: async (ctx) => {
        setupEvents.push(`base:${ctx.cwd}:${ctx.agentId}`);
      },
    });
    const dependency = loadedSkill("dependency", {
      dependencies: ["base"],
      systemPrompt: "Dependency prompt",
      tools: [createTool("dependency-tool")],
      setup: async () => {
        setupEvents.push("dependency");
      },
    });
    const requested = loadedSkill("requested", {
      dependencies: ["dependency", "base"],
      systemPrompt: "Requested prompt",
      setup: async () => {
        setupEvents.push("requested");
      },
    });
    const loader = new SkillLoader(new StaticSkillRegistry([requested, dependency, base]));

    const result = await loader.loadSkills(["requested", "dependency"], context);

    expect(result.loaded.map((entry) => entry.skill.name)).toEqual([
      "base",
      "dependency",
      "requested",
    ]);
    expect(result.tools.map((tool) => tool.name)).toEqual(["base-tool", "dependency-tool"]);
    expect(result.systemPrompt).toBe("Base prompt\n\nDependency prompt\n\nRequested prompt");
    expect(setupEvents).toEqual(["base:/repo:agent-1", "dependency", "requested"]);
  });

  it("tears down loaded skills in reverse activation order", async () => {
    const teardown = vi.fn(async (): Promise<void> => {});
    const first = loadedSkill("first", { teardown });
    const second = loadedSkill("second", { dependencies: ["first"], teardown });
    const loader = new SkillLoader(new StaticSkillRegistry([first, second]));

    const result = await loader.loadSkills(["second"], { cwd: "/repo" });
    await loader.teardown(result.loaded);

    expect(teardown).toHaveBeenCalledTimes(2);
    expect(result.loaded.map((entry) => entry.skill.name)).toEqual(["first", "second"]);
  });

  it("fails fast when requested skills or dependencies are missing", async () => {
    const loader = new SkillLoader(new StaticSkillRegistry([
      loadedSkill("needs-missing", { dependencies: ["missing"] }),
    ]));

    await expect(loader.loadSkills(["missing"], { cwd: "/repo" })).rejects.toThrow(
      "Skill not found: missing"
    );
    await expect(loader.loadSkills(["needs-missing"], { cwd: "/repo" })).rejects.toThrow(
      "Skill not found: missing"
    );
  });

  it("scan delegates to the configured registry without side effects", async () => {
    const entries = [loadedSkill("local"), loadedSkill("global", { source: "global" })];
    const loader = new SkillLoader(new StaticSkillRegistry(entries));

    await expect(loader.scan()).resolves.toEqual(entries);
  });
});

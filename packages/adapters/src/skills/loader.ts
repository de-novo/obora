import type { LoadedSkill, OboraSkill, SkillContext } from "./types";
import { SkillRegistry } from "./registry";

export interface SkillActivationResult {
  loaded: LoadedSkill[];
  tools: OboraSkill["tools"];
  systemPrompt: string;
}

export class SkillLoader {
  constructor(private readonly registry: SkillRegistry = new SkillRegistry()) {}

  async scan(): Promise<LoadedSkill[]> {
    return this.registry.listAvailableSync();
  }

  async loadSkills(names: string[], context: SkillContext): Promise<SkillActivationResult> {
    const all = this.registry.listAvailableSync();
    const byName = new Map(all.map((entry) => [entry.skill.name, entry]));

    const visited = new Set<string>();
    const ordered: LoadedSkill[] = [];

    const visit = (name: string) => {
      if (visited.has(name)) return;
      const entry = byName.get(name);
      if (!entry) {
        throw new Error(`Skill not found: ${name}`);
      }
      visited.add(name);
      (entry.skill.dependencies ?? []).forEach((dependency) => visit(dependency));
      ordered.push(entry);
    };

    names.forEach((name) => visit(name));

    await ordered.reduce<Promise<void>>(async (previousSetup, entry) => {
      await previousSetup;
      if (entry.skill.setup) {
        await entry.skill.setup(context);
      }
    }, Promise.resolve());

    return {
      loaded: ordered,
      tools: ordered.flatMap((entry) => entry.skill.tools),
      systemPrompt: ordered
        .map((entry) => entry.skill.systemPrompt)
        .filter((line): line is string => Boolean(line))
        .join("\n\n"),
    };
  }

  async teardown(skills: LoadedSkill[]): Promise<void> {
    await [...skills].reverse().reduce<Promise<void>>(async (previousTeardown, entry) => {
      await previousTeardown;
      if (entry.skill.teardown) {
        await entry.skill.teardown();
      }
    }, Promise.resolve());
  }
}

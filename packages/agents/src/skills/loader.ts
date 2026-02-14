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
      for (const dependency of entry.skill.dependencies ?? []) {
        visit(dependency);
      }
      ordered.push(entry);
    };

    for (const name of names) {
      visit(name);
    }

    for (const entry of ordered) {
      if (entry.skill.setup) {
        await entry.skill.setup(context);
      }
    }

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
    for (const entry of [...skills].reverse()) {
      if (entry.skill.teardown) {
        await entry.skill.teardown();
      }
    }
  }
}

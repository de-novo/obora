import { Command } from "commander";
import { SkillRegistry } from "@obora-kit/agents";

export function createSkillsCommand(): Command {
  const skills = new Command("skills").description("Manage obora skills");

  skills
    .command("list")
    .description("List available skills")
    .action(async () => {
      const registry = new SkillRegistry({ cwd: process.cwd() });
      const list = registry.listAvailableSync();
      for (const entry of list) {
        console.log(`${entry.skill.name}\t${entry.skill.version}\t${entry.source}`);
      }
    });

  skills
    .command("add <name>")
    .description("Install a skill from npm into .obora/skills")
    .action(async (name: string) => {
      const registry = new SkillRegistry({ cwd: process.cwd() });
      await registry.installFromNpm(name, { cwd: process.cwd() });
      console.log(`installed skill: ${name}`);
    });

  skills
    .command("remove <name>")
    .description("Remove an installed skill from .obora/skills")
    .action(async (name: string) => {
      const registry = new SkillRegistry({ cwd: process.cwd() });
      await registry.removeFromNpm(name, { cwd: process.cwd() });
      console.log(`removed skill: ${name}`);
    });

  return skills;
}

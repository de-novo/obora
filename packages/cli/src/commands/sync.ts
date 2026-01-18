import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { existsSync } from "node:fs";
import {
  syncAll,
  syncSkills,
  syncAgents,
  syncRules,
  syncCommands,
  syncScripts,
  syncSettings,
  listAvailableSkills,
  listAvailableAgents,
} from "../utils/skills";

export const syncCommand = defineCommand({
  meta: {
    name: "sync",
    description: "Sync obora assets (skills, agents, rules, commands, scripts, hooks)",
  },
  args: {
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory (default: current directory)",
    },
    force: {
      type: "boolean",
      alias: "f",
      description: "Overwrite existing files",
      default: false,
    },
    type: {
      type: "string",
      alias: "t",
      description: "Sync specific type: skills, agents, rules, commands, scripts, settings, or all",
      default: "all",
    },
    list: {
      type: "boolean",
      alias: "l",
      description: "List available assets instead of syncing",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.dir || process.cwd());

    // List mode
    if (args.list) {
      consola.info("Available obora assets:\n");

      const skills = await listAvailableSkills();
      consola.info("Skills:");
      skills.forEach((s) => consola.info(`  - ${s}`));

      console.log();
      const agents = await listAvailableAgents();
      consola.info("Agents:");
      agents.forEach((a) => consola.info(`  - ${a}`));

      console.log();
      consola.info("Also includes: rules, commands, scripts, settings.json (hooks)");
      return;
    }

    // Check if .claude directory exists
    const claudeDir = resolve(projectPath, ".claude");
    if (!existsSync(claudeDir)) {
      consola.warn("No .claude directory found. Run 'obora init' first.");
      return;
    }

    const options = { force: args.force };

    switch (args.type) {
      case "skills":
        await syncSkills(projectPath, options);
        consola.success("Skills synced");
        break;
      case "agents":
        await syncAgents(projectPath, options);
        consola.success("Agents synced");
        break;
      case "rules":
        await syncRules(projectPath, options);
        consola.success("Rules synced");
        break;
      case "commands":
        await syncCommands(projectPath, options);
        consola.success("Commands synced");
        break;
      case "scripts":
        await syncScripts(projectPath, options);
        consola.success("Scripts synced");
        break;
      case "settings":
        await syncSettings(projectPath, options);
        consola.success("Settings synced");
        break;
      case "all":
      default:
        await syncAll(projectPath, options);
        consola.success("\nSync complete!");
        break;
    }
  },
});

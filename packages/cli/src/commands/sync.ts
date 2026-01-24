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
import { Errors, showError } from "../utils/errors";
import {
  withSpinner,
  runTasks,
  runPreflightChecks,
  showResults,
  type TaskStep,
} from "../utils/progress";

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
    "dry-run": {
      type: "boolean",
      description: "Preview what would be synced without making changes",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.dir || process.cwd());
    const isDryRun = args["dry-run"] as boolean;

    // Dry-run mode
    if (isDryRun) {
      consola.info("[dry-run] Preview mode - no changes will be made\n");

      const skills = await listAvailableSkills();
      const agents = await listAvailableAgents();

      consola.info("[dry-run] Would sync the following assets:\n");

      if (args.type === "all" || args.type === "skills") {
        consola.info("Skills:");
        skills.forEach((s) => consola.info(`  → .claude/skills/obora/${s}/`));
        console.log();
      }

      if (args.type === "all" || args.type === "agents") {
        consola.info("Agents:");
        agents.forEach((a) => consola.info(`  → .claude/agents/${a}.md`));
        console.log();
      }

      if (args.type === "all" || args.type === "rules") {
        consola.info("Rules:");
        consola.info("  → .claude/rules/ (multiple files)");
        console.log();
      }

      if (args.type === "all" || args.type === "commands") {
        consola.info("Commands:");
        consola.info("  → .claude/commands/ (multiple files)");
        console.log();
      }

      if (args.type === "all" || args.type === "scripts") {
        consola.info("Scripts:");
        consola.info("  → .claude/scripts/obora/ (multiple files)");
        console.log();
      }

      if (args.type === "all" || args.type === "settings") {
        consola.info("Settings:");
        consola.info("  → .claude/settings.json (hooks)");
        console.log();
      }

      consola.success("[dry-run] Preview complete. Run without --dry-run to apply changes.");
      return;
    }

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

    // Pre-flight checks
    const claudeDir = resolve(projectPath, ".claude");
    const { passed } = await runPreflightChecks([
      {
        name: ".claude directory exists",
        check: () => existsSync(claudeDir),
        required: true,
      },
    ]);

    if (!passed) {
      showError(Errors.projectNotInitialized(projectPath));
      process.exit(1);
    }

    const options = { force: args.force };

    // Single type sync
    if (args.type !== "all") {
      const syncFunctions: Record<string, () => Promise<unknown>> = {
        skills: () => syncSkills(projectPath, options),
        agents: () => syncAgents(projectPath, options),
        rules: () => syncRules(projectPath, options),
        commands: () => syncCommands(projectPath, options),
        scripts: () => syncScripts(projectPath, options),
        settings: () => syncSettings(projectPath, options),
      };

      const syncFn = syncFunctions[args.type];
      if (!syncFn) {
        consola.error(`Unknown sync type: ${args.type}`);
        consola.info("Available types: skills, agents, rules, commands, scripts, settings, all");
        process.exit(1);
      }

      await withSpinner(
        `Syncing ${args.type}...`,
        syncFn,
        {
          successText: `${args.type} synced`,
          showTime: true,
        }
      );
      return;
    }

    // Sync all assets with progress
    const tasks: TaskStep[] = [
      { name: "Syncing skills", task: () => syncSkills(projectPath, options) },
      { name: "Syncing agents", task: () => syncAgents(projectPath, options) },
      { name: "Syncing rules", task: () => syncRules(projectPath, options) },
      { name: "Syncing commands", task: () => syncCommands(projectPath, options) },
      { name: "Syncing scripts", task: () => syncScripts(projectPath, options) },
      { name: "Syncing settings", task: () => syncSettings(projectPath, options) },
    ];

    consola.log(""); // Empty line before tasks
    const results = await runTasks(tasks, {
      showTime: true,
      continueOnError: true,
    });

    // Show summary
    showResults(results);

    if (results.failed === 0) {
      consola.success("\nSync complete!");
    } else {
      consola.warn(`\nSync completed with ${results.failed} error(s)`);
      process.exit(1);
    }
  },
});

import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import {
  hasOboraConfig,
  readOboraConfig,
  readOboraHistory,
} from "../utils/project-config";
import { BASES, APP_MODULES, PRESETS } from "../utils/constants";

export const statusCommand = defineCommand({
  meta: {
    name: "status",
    description: "Show current project configuration status",
  },
  args: {
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory",
      default: ".",
    },
    json: {
      type: "boolean",
      description: "Output as JSON",
      default: false,
    },
    history: {
      type: "boolean",
      alias: "h",
      description: "Show history",
      default: false,
    },
  },
  async run({ args }) {
    const projectDir = resolve(args.dir);

    // Check if it's an obora project
    if (!hasOboraConfig(projectDir)) {
      consola.error(
        "No .obora/config.json found. This is not an obora project."
      );
      consola.info("Use 'obora create' to start a new obora project.");
      process.exit(1);
    }

    // Read config
    const config = await readOboraConfig(projectDir);
    if (!config) {
      consola.error("Failed to read .obora/config.json");
      process.exit(1);
    }

    // JSON output mode
    if (args.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }

    // Get base info
    const baseInfo = BASES[config.base];

    // Build status display
    const lines: string[] = [];

    lines.push(`Base: ${config.base}${baseInfo ? ` - ${baseInfo.description}` : ""}`);
    lines.push(`Package Manager: ${config.packageManager}`);
    lines.push(`Created: ${new Date(config.createdAt).toLocaleDateString()}`);
    lines.push(`Updated: ${new Date(config.updatedAt).toLocaleDateString()}`);

    // Show apps
    if (config.apps && Object.keys(config.apps).length > 0) {
      lines.push("");
      lines.push("Apps:");
      for (const [appName, appConfig] of Object.entries(config.apps)) {
        const appInfo = APP_MODULES[appName];
        lines.push(`  ${appName} v${appConfig.version}${appInfo ? ` - ${appInfo.description}` : ""}`);
      }
    }

    // Show slots with their status
    if (config.slots && Object.keys(config.slots).length > 0) {
      lines.push("");
      lines.push("Presets:");

      for (const [slotName, slotConfig] of Object.entries(config.slots)) {
        if (slotConfig) {
          const presetInfo = PRESETS[slotConfig.preset];
          lines.push(
            `  ${slotName}: ${slotConfig.preset} v${slotConfig.version}` +
              (presetInfo ? ` - ${presetInfo.description}` : "")
          );
        } else {
          lines.push(`  ${slotName}: (empty)`);
        }
      }
    }

    consola.box(lines.join("\n"));

    // Show history if requested
    if (args.history) {
      const history = await readOboraHistory(projectDir);

      if (history.entries.length === 0) {
        consola.info("No history entries.");
      } else {
        console.log("\nHistory:");
        for (const entry of history.entries.slice(-10)) {
          const date = new Date(entry.timestamp).toLocaleString();
          let description = "";

          switch (entry.action) {
            case "create":
              description = "Project created";
              break;
            case "add":
              description = `Added ${entry.preset} to ${entry.target}`;
              break;
            case "remove":
              description = `Removed ${entry.preset} from ${entry.target}`;
              break;
            case "upgrade":
              description = `Upgraded ${entry.preset} from ${entry.fromVersion} to ${entry.toVersion}`;
              break;
            case "add-app":
              description = `Added app ${entry.target}`;
              break;
            case "remove-app":
              description = `Removed app ${entry.target}`;
              break;
          }

          console.log(`  [${date}] ${entry.action}: ${description}`);
        }
      }
    }
  },
});

import { defineCommand } from "citty";
import consola from "consola";
import {
  getPreference,
  setPreference,
  getAllPreferences,
  clearAllPreferences,
  type GlobalPreferences,
  type GlobalPreferenceKey,
} from "../utils/global-config";

const VALID_KEYS: GlobalPreferenceKey[] = [
  "packageManager",
  "defaultBase",
  "preferredPresets",
  "telemetry",
  "defaultApps",
];

const VALID_PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;
const VALID_BASES = ["single", "monorepo"] as const;

function parseValue(
  key: GlobalPreferenceKey,
  value: string
): GlobalPreferences[GlobalPreferenceKey] {
  switch (key) {
    case "packageManager":
      if (!VALID_PACKAGE_MANAGERS.includes(value as typeof VALID_PACKAGE_MANAGERS[number])) {
        throw new Error(`Invalid package manager. Must be one of: ${VALID_PACKAGE_MANAGERS.join(", ")}`);
      }
      return value as GlobalPreferences["packageManager"];

    case "defaultBase":
      if (!VALID_BASES.includes(value as typeof VALID_BASES[number])) {
        throw new Error(`Invalid base. Must be one of: ${VALID_BASES.join(", ")}`);
      }
      return value as GlobalPreferences["defaultBase"];

    case "preferredPresets":
    case "defaultApps":
      return value.split(",").map((s) => s.trim()).filter(Boolean) as string[];

    case "telemetry":
      if (value !== "true" && value !== "false") {
        throw new Error("Telemetry must be 'true' or 'false'");
      }
      return value === "true";

    default:
      return undefined;
  }
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

export const configCommand = defineCommand({
  meta: {
    name: "config",
    description: "Manage global obora preferences",
  },
  args: {
    key: {
      type: "positional",
      description: "Preference key to get/set",
      required: false,
    },
    value: {
      type: "positional",
      description: "Value to set (omit to get current value)",
      required: false,
    },
    list: {
      type: "boolean",
      alias: "l",
      description: "List all preferences",
      default: false,
    },
    reset: {
      type: "boolean",
      description: "Reset all preferences to defaults",
      default: false,
    },
    delete: {
      type: "boolean",
      alias: "d",
      description: "Delete a preference",
      default: false,
    },
  },
  async run({ args }) {
    // List all preferences
    if (args.list) {
      const prefs = getAllPreferences();
      const entries = Object.entries(prefs);

      if (entries.length === 0) {
        consola.info("No preferences set.");
        consola.info(`\nAvailable keys: ${VALID_KEYS.join(", ")}`);
        return;
      }

      consola.info("Global preferences:\n");
      for (const [key, value] of entries) {
        consola.log(`  ${key}: ${formatValue(value)}`);
      }
      return;
    }

    // Reset all preferences
    if (args.reset) {
      clearAllPreferences();
      consola.success("All preferences have been reset.");
      return;
    }

    // No key provided - show help
    if (!args.key) {
      consola.info("Usage:");
      consola.log("  obora config <key>           Get a preference value");
      consola.log("  obora config <key> <value>   Set a preference value");
      consola.log("  obora config --list          List all preferences");
      consola.log("  obora config --delete <key>  Delete a preference");
      consola.log("  obora config --reset         Reset all preferences");
      consola.info(`\nAvailable keys: ${VALID_KEYS.join(", ")}`);
      consola.info("\nExamples:");
      consola.log("  obora config packageManager pnpm");
      consola.log("  obora config defaultBase monorepo");
      consola.log("  obora config preferredPresets biome,drizzle,clerk");
      consola.log("  obora config defaultApps nextjs-web,nestjs-api");
      consola.log("  obora config telemetry false");
      return;
    }

    const key = args.key as GlobalPreferenceKey;

    // Validate key
    if (!VALID_KEYS.includes(key)) {
      consola.error(`Invalid key: ${key}`);
      consola.info(`Valid keys: ${VALID_KEYS.join(", ")}`);
      return;
    }

    // Delete preference
    if (args.delete) {
      const { deletePreference } = await import("../utils/global-config");
      deletePreference(key);
      consola.success(`Deleted preference: ${key}`);
      return;
    }

    // Get preference
    if (!args.value) {
      const value = getPreference(key);
      if (value === undefined) {
        consola.info(`${key}: (not set)`);
      } else {
        consola.info(`${key}: ${formatValue(value)}`);
      }
      return;
    }

    // Set preference
    try {
      const parsedValue = parseValue(key, args.value as string);
      setPreference(key, parsedValue);
      consola.success(`Set ${key} = ${formatValue(parsedValue)}`);
    } catch (error) {
      consola.error((error as Error).message);
    }
  },
});

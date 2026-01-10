import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import {
  promptProjectName,
  promptBase,
  promptAppModules,
  promptPresetsForModules,
  promptPackageManager,
  promptConfirm,
  BASES,
  APP_MODULES,
  PRESETS,
  type BaseName,
  type AppModuleName,
  type Category,
  dirExists,
} from "../utils";
import { assembleProject } from "../utils/assembler";
import {
  createInitialConfig,
  writeOboraConfig,
  addHistoryEntry,
} from "../utils/project-config";

/**
 * Parse --presets argument string into preset selections
 * Format: "category:preset,category:preset"
 * Example: "linting:biome,database:prisma"
 */
function parsePresetsArg(
  presetsArg: string | undefined
): Record<string, { preset: string; version: string } | null> | null {
  if (!presetsArg) return null;

  const selections: Record<string, { preset: string; version: string } | null> = {};
  const pairs = presetsArg.split(",");

  for (const pair of pairs) {
    const [category, presetName] = pair.trim().split(":");
    if (!category || !presetName) continue;

    const preset = PRESETS[presetName];
    if (preset && preset.category === category) {
      selections[category] = {
        preset: presetName,
        version: preset.version,
      };
    } else {
      consola.warn(`Invalid preset: ${category}:${presetName}`);
    }
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

export const createCommand = defineCommand({
  meta: {
    name: "create",
    description: "Create a new project",
  },
  args: {
    name: {
      type: "positional",
      description: "Project name",
      required: false,
    },
    base: {
      type: "string",
      alias: "b",
      description: "Base structure (monorepo, single)",
    },
    apps: {
      type: "string",
      alias: "a",
      description: "App modules (comma-separated: nextjs-web,nestjs-api)",
    },
    dir: {
      type: "string",
      alias: "d",
      description: "Directory to create project in",
    },
    pm: {
      type: "string",
      description: "Package manager (pnpm, npm, yarn, bun)",
    },
    presets: {
      type: "string",
      alias: "p",
      description: "Preset selections (comma-separated: linting:biome,database:prisma)",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts (uses defaults)",
      default: false,
    },
  },
  async run({ args }) {
    consola.start("Creating new project...\n");

    // 1. Get project name
    const projectName = args.name || (await promptProjectName());

    // 2. Get base structure
    let base: BaseName;
    if (args.base && args.base in BASES) {
      base = args.base as BaseName;
    } else if (args.yes) {
      base = "monorepo";
      consola.info(`Using default base: ${base}`);
    } else {
      base = await promptBase();
    }

    // 3. Get app modules
    let appModules: AppModuleName[];
    if (args.apps) {
      appModules = args.apps.split(",").filter((a: string) => a in APP_MODULES) as AppModuleName[];
      if (appModules.length === 0) {
        consola.error("No valid app modules specified");
        process.exit(1);
      }
    } else if (args.yes) {
      appModules = ["nextjs-web"];
      consola.info(`Using default apps: ${appModules.join(", ")}`);
    } else {
      appModules = await promptAppModules();
    }

    // 4. Get presets based on app modules
    let slotSelections: Record<string, { preset: string; version: string } | null>;

    // Check if --presets was provided
    const parsedPresets = parsePresetsArg(args.presets);
    if (parsedPresets) {
      // Merge parsed presets with defaults for remaining slots
      const baseSelections = await promptPresetsForModules(appModules, true); // Use defaults for base
      slotSelections = { ...baseSelections, ...parsedPresets };

      for (const [category, selection] of Object.entries(parsedPresets)) {
        if (selection) {
          consola.info(`Using preset ${category}: ${selection.preset}`);
        }
      }
    } else {
      slotSelections = await promptPresetsForModules(appModules, args.yes);
    }

    // 5. Determine output directory
    const targetDir = args.dir
      ? resolve(args.dir, projectName)
      : resolve(process.cwd(), projectName);

    // 6. Check if directory exists
    if (await dirExists(targetDir)) {
      if (!args.yes) {
        const overwrite = await promptConfirm(
          `Directory ${projectName} already exists. Overwrite?`
        );
        if (!overwrite) {
          consola.info("Cancelled");
          return;
        }
      }
    }

    // 7. Get package manager
    type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
    const validPMs: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];
    let pm: PackageManager;

    if (args.pm && validPMs.includes(args.pm as PackageManager)) {
      pm = args.pm as PackageManager;
    } else if (args.yes) {
      pm = "pnpm";
    } else {
      pm = await promptPackageManager();
    }

    // 8. Build apps config for .obora/config.json
    const appsConfig: Record<string, { module: string; version: string }> = {};
    for (const moduleName of appModules) {
      appsConfig[moduleName] = {
        module: moduleName,
        version: "1.0.0",
      };
    }

    // 9. Display summary
    const selectedPresets = Object.entries(slotSelections)
      .filter(([_, v]) => v !== null)
      .map(([k, v]) => `${k}: ${v?.preset}`)
      .join(", ");

    consola.box(
      `Project: ${projectName}\n` +
        `Base: ${base}\n` +
        `Apps: ${appModules.join(", ")}\n` +
        `Presets: ${selectedPresets || "none"}\n` +
        `Directory: ${targetDir}\n` +
        `Package Manager: ${pm}`
    );

    if (!args.yes) {
      const confirmed = await promptConfirm("Proceed with project creation?");
      if (!confirmed) {
        consola.info("Cancelled");
        return;
      }
    }

    // 10. Assemble project
    try {
      await assembleProject({
        base,
        projectName,
        targetDir,
        apps: appModules,
        presets: slotSelections,
        packageManager: pm,
      });

      // 11. Generate .obora/config.json
      const oboraConfig = createInitialConfig(base, pm, appsConfig, slotSelections);
      await writeOboraConfig(targetDir, oboraConfig);
      await addHistoryEntry(targetDir, {
        action: "create",
      });

      consola.success("Generated .obora/config.json");

      // 12. Next steps
      const nextSteps = [
        `cd ${projectName}`,
        `${pm} install`,
        `cp .env.example .env`,
      ];

      // Add preset-specific steps
      const presetNames = Object.values(slotSelections)
        .filter((v) => v !== null)
        .map((v) => v?.preset);

      if (presetNames.includes("drizzle") || presetNames.includes("prisma")) {
        nextSteps.push(`${pm} db:generate`);
        nextSteps.push(`${pm} db:migrate`);
      }

      nextSteps.push(`${pm} dev`);

      consola.box(
        `Project ready!\n\n` +
          `Next steps:\n` +
          nextSteps.map((step) => `  ${step}`).join("\n")
      );
    } catch (error) {
      consola.error("Failed to create project:", error);
      process.exit(1);
    }
  },
});

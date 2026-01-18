import { defineCommand } from "citty";
import { consola } from "consola";
import { join, resolve } from "pathe";
import {
  APP_MODULES,
  BASES,
  dirExists,
  displayValidationResults,
  PRESETS,
  promptAppModules,
  promptBase,
  promptConfirm,
  promptPackageManager,
  promptPresetsForModules,
  promptProjectName,
  resolvePresetName,
  validateAndResolvePresets,
  type AppModuleName,
  type BaseName
} from "../utils";
import { assembleProject, type AppModuleInstance } from "../utils/assembler";
import {
  addHistoryEntry,
  createInitialConfig,
  updatePresetLockfile,
  writeOboraConfig,
} from "../utils/project-config";
import { getPreference } from "../utils/global-config";

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

    const normalizedPresetName = resolvePresetName(presetName);
    const preset = PRESETS[normalizedPresetName];
    if (preset && preset.category === category) {
      selections[category] = {
        preset: normalizedPresetName,
        version: preset.version,
      };
    } else {
      consola.warn(`Invalid preset: ${category}:${presetName}`);
    }
  }

  return Object.keys(selections).length > 0 ? selections : null;
}

function defaultAppInstance(moduleName: AppModuleName, base: BaseName): AppModuleInstance {
  const moduleConfig = APP_MODULES[moduleName];
  const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
  const targetDir = base === "single"
    ? "."
    : (moduleConfig?.targetDir?.startsWith("packages/")
      ? join("packages", defaultName)
      : join("apps", defaultName));
  return { name: defaultName, module: moduleName, targetDir };
}

function parseAppInstances(appsArg: string, base: BaseName): AppModuleInstance[] {
  const tokens = appsArg.split(",").map((token) => token.trim()).filter(Boolean);
  const instances: AppModuleInstance[] = [];
  for (const token of tokens) {
    const separator = token.includes(":") ? ":" : token.includes("=") ? "=" : null;
    const [rawModule, rawName] = separator ? token.split(separator) : [token, ""];
    const moduleName = rawModule.trim() as AppModuleName;
    if (!APP_MODULES[moduleName]) {
      continue;
    }
    const moduleConfig = APP_MODULES[moduleName];
    const defaultName = moduleConfig?.targetDir?.split("/").pop() || moduleName;
    const name = rawName?.trim() || defaultName;
    const targetDir = base === "single"
      ? "."
      : (moduleConfig?.targetDir?.startsWith("packages/")
        ? join("packages", name)
        : join("apps", name));
    instances.push({ name, module: moduleName, targetDir });
  }
  return instances;
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
    "dry-run": {
      type: "boolean",
      description: "Show what would be created without actually creating",
      default: false,
    },
  },
  async run({ args }) {
    consola.start("Creating new project...\n");

    // 1. Get project name
    const projectName = args.name || (await promptProjectName());

    // 2. Get base structure (check global preference)
    let base: BaseName;
    if (args.base && args.base in BASES) {
      base = args.base as BaseName;
    } else if (args.yes) {
      const globalBase = getPreference("defaultBase");
      base = globalBase || "monorepo";
      consola.info(`Using default base: ${base}`);
    } else {
      base = await promptBase();
    }

    // 3. Get app modules (check global preference)
    let appInstances: AppModuleInstance[];
    if (args.apps) {
      appInstances = parseAppInstances(args.apps, base);
      if (appInstances.length === 0) {
        consola.error("No valid app modules specified");
        process.exit(1);
      }
    } else if (args.yes) {
      const globalApps = getPreference("defaultApps");
      if (globalApps && globalApps.length > 0) {
        appInstances = globalApps
          .filter((app) => APP_MODULES[app as AppModuleName])
          .map((app) => defaultAppInstance(app as AppModuleName, base));
      } else {
        appInstances = [defaultAppInstance("nextjs-web", base)];
      }
      consola.info(`Using default apps: ${appInstances.map((app) => app.module).join(", ")}`);
    } else {
      const selectedModules = await promptAppModules();
      appInstances = selectedModules.map((moduleName) => defaultAppInstance(moduleName, base));
    }

    // 4. Get presets based on app modules
    let slotSelections: Record<string, { preset: string; version: string } | null>;

    // Check if --presets was provided
    const parsedPresets = parsePresetsArg(args.presets);
    if (parsedPresets) {
      // Merge parsed presets with defaults for remaining slots
      const baseSelections = await promptPresetsForModules(
        appInstances.map((app) => app.module),
        true
      ); // Use defaults for base
      slotSelections = { ...baseSelections, ...parsedPresets };

      for (const [category, selection] of Object.entries(parsedPresets)) {
        if (selection) {
          consola.info(`Using preset ${category}: ${selection.preset}`);
        }
      }
    } else {
      slotSelections = await promptPresetsForModules(
        appInstances.map((app) => app.module),
        args.yes
      );
    }

    // 4.5. Validate and resolve preset dependencies
    const {
      resolved,
      added,
      conflicts,
      missingCapabilities,
      capabilityConflicts,
    } = await validateAndResolvePresets(slotSelections);
    slotSelections = resolved;

    // Display validation results (auto-added presets, conflicts)
    displayValidationResults(added, conflicts, missingCapabilities, capabilityConflicts);

    // If there are conflicts, ask user to confirm
    const hasCompatibilityIssues =
      conflicts.length > 0 ||
      missingCapabilities.length > 0 ||
      capabilityConflicts.length > 0;
    if (hasCompatibilityIssues && !args.yes) {
      const continueWithConflicts = await promptConfirm(
        "There are preset compatibility issues. Continue anyway?"
      );
      if (!continueWithConflicts) {
        consola.info("Cancelled");
        return;
      }
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

    // 7. Get package manager (check global preference)
    type PackageManager = "pnpm" | "npm" | "yarn" | "bun";
    const validPMs: PackageManager[] = ["pnpm", "npm", "yarn", "bun"];
    let pm: PackageManager;

    if (args.pm && validPMs.includes(args.pm as PackageManager)) {
      pm = args.pm as PackageManager;
    } else if (args.yes) {
      const globalPm = getPreference("packageManager");
      pm = globalPm || "pnpm";
    } else {
      pm = await promptPackageManager();
    }

    // 8. Build apps config for .obora/config.json
    const appsConfig: Record<string, { module: string; version: string; path?: string }> = {};
    for (const appInstance of appInstances) {
      appsConfig[appInstance.name] = {
        module: appInstance.module,
        version: "1.0.0",
        path: join(targetDir, appInstance.targetDir),
      };
    }

    // 9. Display summary
    const selectedPresets = Object.entries(slotSelections)
      .filter(([_, v]) => v !== null)
      .map(([k, v]) => `${k}: ${v?.preset}`)
      .join(", ");

    const isDryRun = args["dry-run"] as boolean;

    consola.box(
      `${isDryRun ? "[DRY RUN] " : ""}Project: ${projectName}\n` +
        `Base: ${base}\n` +
        `Apps: ${appInstances.map((app) => `${app.name}(${app.module})`).join(", ")}\n` +
        `Presets: ${selectedPresets || "none"}\n` +
        `Directory: ${targetDir}\n` +
        `Package Manager: ${pm}`
    );

    // Dry run - show what would be created
    if (isDryRun) {
      consola.info("\nDry run mode - no files will be created.\n");
      consola.info("Would create:");
      consola.info(`  Base template: ${base}`);
      for (const app of appInstances) {
        consola.info(`  App module: ${app.module} (${app.name})`);
      }
      for (const [category, selection] of Object.entries(slotSelections)) {
        if (selection) {
          consola.info(`  Preset: ${category}/${selection.preset}`);
        }
      }
      consola.info(`  Config: .obora/config.json`);
      consola.info(`  Env: .env.example`);
      return;
    }

    if (!args.yes) {
      const confirmed = await promptConfirm("Proceed with project creation?");
      if (!confirmed) {
        consola.info("Cancelled");
        return;
      }
    }

    // 10. Assemble project
    try {
      consola.start("Copying base template...");
      const assemblyResult = await assembleProject({
        base,
        projectName,
        targetDir,
        apps: appInstances,
        presets: slotSelections,
        packageManager: pm,
      });
      consola.success("Project files created");

      // 11. Generate .obora/config.json
      consola.start("Generating config...");
      const oboraConfig = createInitialConfig(targetDir, base, pm, appsConfig, slotSelections);
      await writeOboraConfig(targetDir, oboraConfig);
      await updatePresetLockfile(targetDir, oboraConfig);
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

      const postInstallSteps = assemblyResult.postInstall || [];
      const postInstallBlock = postInstallSteps.length > 0
        ? `\n\nPreset guidance:\n${postInstallSteps.map((step) => `  - ${step}`).join("\n")}`
        : "";

      consola.box(
        `Project ready!\n\n` +
          `Next steps:\n` +
          nextSteps.map((step) => `  ${step}`).join("\n") +
          `\n\nPreset lockfile:\n  .obora/presets.lock.json` +
          postInstallBlock
      );
    } catch (error) {
      if (error instanceof Error) {
        consola.error(`Failed to create project: ${error.message}`);
        if (error.message.includes("ENOENT")) {
          consola.info("Hint: Check if template or preset files exist");
        } else if (error.message.includes("EACCES")) {
          consola.info("Hint: Check write permissions for target directory");
        } else if (error.message.includes("EEXIST")) {
          consola.info("Hint: Target directory already exists. Use --yes to overwrite");
        }
      } else {
        consola.error("Failed to create project:", error);
      }
      process.exit(1);
    }
  },
});

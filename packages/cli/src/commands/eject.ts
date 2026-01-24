import { defineCommand } from "citty";
import consola from "consola";
import prompts from "prompts";
import { resolve, join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import {
  readOboraConfig,
  writeOboraConfig,
  addHistoryEntry,
  type SlotConfig,
} from "../utils/project-config";
import { Errors, showError } from "../utils/errors";
import { withSpinner } from "../utils/progress";

/**
 * Eject configuration for each preset
 * Maps preset name to array of files that can be ejected
 */
interface EjectableFile {
  /** Source path relative to preset directory */
  source: string;
  /** Destination path relative to project root (or app root for monorepo) */
  destination: string;
  /** Description of the file */
  description: string;
}

const EJECTABLE_FILES: Record<string, EjectableFile[]> = {
  tailwind: [
    {
      source: "tailwind.config.ts",
      destination: "tailwind.config.ts",
      description: "Tailwind CSS configuration",
    },
    {
      source: "postcss.config.js",
      destination: "postcss.config.js",
      description: "PostCSS configuration",
    },
  ],
  shadcn: [
    {
      source: "components.json",
      destination: "components.json",
      description: "shadcn/ui configuration",
    },
  ],
  drizzle: [
    {
      source: "drizzle.config.ts",
      destination: "drizzle.config.ts",
      description: "Drizzle ORM configuration",
    },
  ],
  prisma: [
    {
      source: "prisma/schema.prisma",
      destination: "prisma/schema.prisma",
      description: "Prisma schema",
    },
  ],
  "clerk-nextjs": [
    {
      source: "middleware.ts",
      destination: "src/middleware.ts",
      description: "Clerk authentication middleware",
    },
  ],
  "better-auth-nextjs": [
    {
      source: "middleware.ts",
      destination: "src/middleware.ts",
      description: "Better Auth middleware",
    },
    {
      source: "auth-client.ts",
      destination: "src/lib/auth-client.ts",
      description: "Better Auth client configuration",
    },
  ],
  stripe: [
    {
      source: "stripe.config.ts",
      destination: "src/lib/stripe.ts",
      description: "Stripe configuration",
    },
  ],
  sentry: [
    {
      source: "sentry.config.ts",
      destination: "sentry.client.config.ts",
      description: "Sentry client configuration",
    },
  ],
  posthog: [
    {
      source: "posthog.config.ts",
      destination: "src/lib/posthog.ts",
      description: "PostHog configuration",
    },
  ],
};

/**
 * Get the preset directory path
 */
function getPresetPath(preset: string, category: string): string {
  // This would typically resolve to the installed preset location
  // For now, we'll use a relative path from the CLI package
  return resolve(__dirname, "..", "..", "..", "..", "presets", category, preset, "files");
}

/**
 * Find which category a preset belongs to
 */
function findPresetCategory(
  slots: Record<string, SlotConfig | null>,
  presetName: string
): string | null {
  for (const [category, slot] of Object.entries(slots)) {
    if (slot && slot.preset === presetName) {
      return category;
    }
  }
  return null;
}

/**
 * Check if a file already exists at the destination
 */
async function checkExistingFiles(
  projectPath: string,
  files: EjectableFile[]
): Promise<{ existing: string[]; canEject: string[] }> {
  const existing: string[] = [];
  const canEject: string[] = [];

  for (const file of files) {
    const destPath = join(projectPath, file.destination);
    if (existsSync(destPath)) {
      existing.push(file.destination);
    } else {
      canEject.push(file.destination);
    }
  }

  return { existing, canEject };
}

/**
 * Copy ejectable files to the project
 */
async function ejectFiles(
  projectPath: string,
  presetPath: string,
  files: EjectableFile[],
  overwrite: boolean
): Promise<string[]> {
  const ejectedFiles: string[] = [];

  for (const file of files) {
    const sourcePath = join(presetPath, file.source);
    const destPath = join(projectPath, file.destination);

    // Check if source exists
    if (!existsSync(sourcePath)) {
      consola.warn(`Source file not found: ${file.source}`);
      continue;
    }

    // Check if destination exists and we're not overwriting
    if (existsSync(destPath) && !overwrite) {
      consola.warn(`Skipping ${file.destination} (already exists)`);
      continue;
    }

    // Ensure destination directory exists
    const destDir = dirname(destPath);
    if (!existsSync(destDir)) {
      await mkdir(destDir, { recursive: true });
    }

    // Copy the file
    await copyFile(sourcePath, destPath);
    ejectedFiles.push(file.destination);
    consola.success(`Ejected: ${file.destination}`);
  }

  return ejectedFiles;
}

/**
 * Create a customizable version of the config file
 */
async function createCustomConfig(
  projectPath: string,
  preset: string,
  files: EjectableFile[]
): Promise<void> {
  // Add a header comment to ejected files to indicate they are customizable
  for (const file of files) {
    const filePath = join(projectPath, file.destination);
    if (!existsSync(filePath)) continue;

    const content = await readFile(filePath, "utf-8");
    const ext = file.destination.split(".").pop();

    let header = "";
    if (ext === "ts" || ext === "js" || ext === "tsx" || ext === "jsx") {
      header = `/**
 * This file has been ejected from the '${preset}' preset.
 * You can now customize it freely. It will not be overwritten by 'obora upgrade'.
 *
 * @ejected ${new Date().toISOString()}
 */

`;
    } else if (ext === "json") {
      // JSON doesn't support comments, skip header
      continue;
    } else if (ext === "prisma") {
      header = `// This file has been ejected from the '${preset}' preset.
// You can now customize it freely. It will not be overwritten by 'obora upgrade'.
// @ejected ${new Date().toISOString()}

`;
    }

    if (header && !content.startsWith("/**\n * This file has been ejected")) {
      await writeFile(filePath, header + content, "utf-8");
    }
  }
}

export const ejectCommand = defineCommand({
  meta: {
    name: "eject",
    description: "Eject preset configuration files for customization",
  },
  args: {
    preset: {
      type: "positional",
      description: "Preset to eject (e.g., tailwind, shadcn, drizzle)",
      required: false,
    },
    all: {
      type: "boolean",
      description: "Eject all files from the preset",
      default: false,
    },
    force: {
      type: "boolean",
      description: "Overwrite existing files",
      alias: "f",
      default: false,
    },
    list: {
      type: "boolean",
      description: "List ejectable files without ejecting",
      alias: "l",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Preview what would be ejected without making changes",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(".");

    // Read config
    const config = await readOboraConfig(projectPath);
    if (!config) {
      showError(Errors.projectNotInitialized(projectPath));
      return;
    }

    // List mode: show all ejectable presets and their files
    if (args.list && !args.preset) {
      consola.info("Ejectable presets and files:\n");

      const installedPresets = Object.values(config.slots)
        .filter((slot): slot is SlotConfig => slot !== null)
        .map((slot) => slot.preset);

      for (const preset of installedPresets) {
        const files = EJECTABLE_FILES[preset];
        if (!files) continue;

        const slot = Object.values(config.slots).find(
          (s): s is SlotConfig => s !== null && s.preset === preset
        );
        const ejectedIndicator = slot?.ejected ? " (ejected)" : "";

        consola.log(`  ${preset}${ejectedIndicator}:`);
        for (const file of files) {
          consola.log(`    - ${file.destination}: ${file.description}`);
        }
        consola.log("");
      }
      return;
    }

    // Get preset name
    let presetName = args.preset as string | undefined;

    if (!presetName) {
      // Show interactive selection
      const installedPresets = Object.values(config.slots)
        .filter((slot): slot is SlotConfig => slot !== null)
        .filter((slot) => EJECTABLE_FILES[slot.preset])
        .map((slot) => ({
          title: `${slot.preset}${slot.ejected ? " (already ejected)" : ""}`,
          value: slot.preset,
          disabled: slot.ejected,
        }));

      if (installedPresets.length === 0) {
        consola.warn("No ejectable presets found in this project.");
        consola.info("Ejectable presets: " + Object.keys(EJECTABLE_FILES).join(", "));
        return;
      }

      const response = await prompts({
        type: "select",
        name: "preset",
        message: "Select a preset to eject:",
        choices: installedPresets,
      });

      if (!response.preset) {
        consola.info("Eject cancelled.");
        return;
      }

      presetName = response.preset;
    }

    // Validate preset - presetName is guaranteed to be defined here
    const presetToEject = presetName!;
    const category = findPresetCategory(config.slots, presetToEject);
    if (!category) {
      showError(Errors.presetNotFound(presetToEject));
      return;
    }

    const slot = config.slots[category] as SlotConfig;
    if (slot.ejected) {
      consola.warn(`Preset '${presetToEject}' has already been ejected.`);
      consola.info(`Ejected files: ${slot.ejectedFiles?.join(", ")}`);
      return;
    }

    const ejectableFiles = EJECTABLE_FILES[presetToEject];
    if (!ejectableFiles) {
      showError(Errors.operationFailed("eject", `Preset '${presetToEject}' does not support ejecting`));
      consola.info("Ejectable presets: " + Object.keys(EJECTABLE_FILES).join(", "));
      return;
    }

    // List mode for specific preset
    if (args.list) {
      consola.info(`Ejectable files for '${presetToEject}':\n`);
      for (const file of ejectableFiles) {
        const exists = existsSync(join(projectPath, file.destination));
        const status = exists ? " (exists)" : "";
        consola.log(`  - ${file.destination}${status}: ${file.description}`);
      }
      return;
    }

    // Check existing files
    const { existing, canEject } = await checkExistingFiles(projectPath, ejectableFiles);

    if (existing.length > 0 && !args.force) {
      consola.warn("The following files already exist:");
      existing.forEach((f) => consola.log(`  - ${f}`));
      consola.info("Use --force to overwrite existing files.");

      if (canEject.length === 0) {
        return;
      }

      const { proceed } = await prompts({
        type: "confirm",
        name: "proceed",
        message: `Eject only new files (${canEject.length} file(s))?`,
        initial: true,
      });

      if (!proceed) {
        consola.info("Eject cancelled.");
        return;
      }
    }

    // Select files to eject (if not using --all)
    let filesToEject = ejectableFiles;

    if (!args.all && ejectableFiles.length > 1) {
      const { selectedFiles } = await prompts({
        type: "multiselect",
        name: "selectedFiles",
        message: "Select files to eject:",
        choices: ejectableFiles.map((f) => ({
          title: `${f.destination} - ${f.description}`,
          value: f,
          selected: true,
        })),
        min: 1,
      });

      if (!selectedFiles || selectedFiles.length === 0) {
        consola.info("Eject cancelled.");
        return;
      }

      filesToEject = selectedFiles;
    }

    // Dry-run mode: show what would be ejected
    const isDryRun = args["dry-run"] as boolean;
    if (isDryRun) {
      consola.info("[dry-run] Preview mode - no changes will be made\n");
      consola.info(`Preset to eject: ${presetToEject} (${category})\n`);

      consola.info("[dry-run] Would eject the following files:\n");

      for (const file of filesToEject) {
        const destPath = join(projectPath, file.destination);
        const existsIndicator = existsSync(destPath)
          ? args.force ? " (will overwrite)" : " (exists, will skip)"
          : "";
        consola.info(`  → ${file.destination}${existsIndicator}`);
        consola.info(`    ${file.description}`);
      }

      console.log();
      consola.info("[dry-run] Would update:");
      consola.info(`  - .obora/config.json (mark ${presetToEject} as ejected)`);
      consola.info(`  - .obora/history.json (add eject entry)`);
      console.log();

      consola.success("[dry-run] Preview complete. Run without --dry-run to apply changes.");
      return;
    }

    // Get preset path
    const presetPath = getPresetPath(presetToEject, category);

    // Eject files
    const ejectedFiles = await withSpinner(
      `Ejecting ${presetToEject} configuration files`,
      async () => {
        const files = await ejectFiles(
          projectPath,
          presetPath,
          filesToEject,
          args.force as boolean
        );

        if (files.length === 0) {
          throw new Error("No files were ejected");
        }

        // Add header comments to ejected files
        await createCustomConfig(projectPath, presetToEject, filesToEject);

        // Update config
        config.slots[category] = {
          ...slot,
          ejected: true,
          ejectedAt: new Date().toISOString(),
          ejectedFiles: files,
        };
        config.updatedAt = new Date().toISOString();

        await writeOboraConfig(projectPath, config);

        // Add history entry
        await addHistoryEntry(projectPath, {
          action: "eject",
          target: category,
          preset: presetToEject,
        });

        return files;
      },
      { successText: `Ejected ${filesToEject.length} file(s) from '${presetToEject}'`, showTime: true }
    );

    consola.info("These files will not be overwritten by 'obora upgrade'.");
    consola.info("You can now customize them freely.");
  },
});

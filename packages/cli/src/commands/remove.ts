import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve, join } from "pathe";
import { promises as fs } from "node:fs";
import prompts from "prompts";
import {
  PRESETS,
  PRESETS_DIR,
  APP_MODULES,
  fileExists,
  dirExists,
  readJson,
  writeJson,
} from "../utils";
import {
  hasOboraConfig,
  readOboraConfig,
  removeSlotPreset,
  getInstalledPresets,
} from "../utils/project-config";

// ============================================================================
// Types
// ============================================================================

interface PresetManifest {
  name: string;
  category: string;
  description: string;
  operations: {
    replace: string[];
    merge: string[];
    add: string[];
    remove: string[];
    inject: Array<{
      file: string;
      marker: string;
      content: string;
    }>;
  };
  conflicts?: string[];
  requires?: string[];
  env?: Array<{
    key: string;
    description: string;
    required: boolean;
    secret: boolean;
    example?: string;
  }>;
  scripts?: Record<string, string>;
  postInstall?: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Remove dependencies from package.json
 */
async function removeDependencies(
  packageJsonPath: string,
  depsToRemove: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }
): Promise<boolean> {
  if (!(await fileExists(packageJsonPath))) {
    return false;
  }

  const packageJson = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(packageJsonPath);

  let updated = false;

  // Remove dependencies
  if (depsToRemove.dependencies && packageJson.dependencies) {
    for (const dep of Object.keys(depsToRemove.dependencies)) {
      if (packageJson.dependencies[dep]) {
        delete packageJson.dependencies[dep];
        updated = true;
      }
    }
  }

  // Remove devDependencies
  if (depsToRemove.devDependencies && packageJson.devDependencies) {
    for (const dep of Object.keys(depsToRemove.devDependencies)) {
      if (packageJson.devDependencies[dep]) {
        delete packageJson.devDependencies[dep];
        updated = true;
      }
    }
  }

  if (updated) {
    await writeJson(packageJsonPath, packageJson);
  }

  return updated;
}

/**
 * Remove scripts from package.json
 */
async function removeScripts(
  packageJsonPath: string,
  scriptsToRemove: Record<string, string>
): Promise<boolean> {
  if (!(await fileExists(packageJsonPath))) {
    return false;
  }

  const packageJson = await readJson<{
    scripts?: Record<string, string>;
  }>(packageJsonPath);

  if (!packageJson.scripts) {
    return false;
  }

  let updated = false;

  for (const [scriptName, scriptValue] of Object.entries(scriptsToRemove)) {
    // Only remove if the script value matches (to avoid removing user modifications)
    if (packageJson.scripts[scriptName] === scriptValue) {
      delete packageJson.scripts[scriptName];
      updated = true;
    }
  }

  if (updated) {
    await writeJson(packageJsonPath, packageJson);
  }

  return updated;
}

/**
 * Remove injected content from a file
 */
async function removeInjectedContent(
  filePath: string,
  marker: string,
  content: string
): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }

  let fileContent = await fs.readFile(filePath, "utf-8");

  // Escape special regex characters in content
  const escapedContent = content.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Pattern: indentation + content + newline + indentation + marker
  // The content was injected with matching indentation before the marker
  const injectedPattern = new RegExp(
    `([ \\t]*)${escapedContent}\\n([ \\t]*)\\/\\/ ${marker}`,
    "g"
  );

  if (injectedPattern.test(fileContent)) {
    // Reset lastIndex after test()
    injectedPattern.lastIndex = 0;

    // Replace with just the marker (preserving its indentation)
    fileContent = fileContent.replace(
      injectedPattern,
      (_match: string, _contentIndent: string, markerIndent: string) => {
        return `${markerIndent}// ${marker}`;
      }
    );
    await fs.writeFile(filePath, fileContent);
    return true;
  }

  // Fallback: try removing just the content line if it exists
  const contentLine = content.trim();
  if (fileContent.includes(contentLine)) {
    const lines = fileContent.split("\n");
    const filteredLines = lines.filter((line) => !line.trim().includes(contentLine));

    if (filteredLines.length < lines.length) {
      await fs.writeFile(filePath, filteredLines.join("\n"));
      return true;
    }
  }

  return false;
}

/**
 * Remove a directory recursively
 */
async function removeDirectory(dirPath: string): Promise<boolean> {
  if (!(await dirExists(dirPath))) {
    return false;
  }

  await fs.rm(dirPath, { recursive: true, force: true });
  return true;
}

/**
 * Remove a file
 */
async function removeFile(filePath: string): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    return false;
  }

  await fs.rm(filePath, { force: true });
  return true;
}

// ============================================================================
// Command
// ============================================================================

export const removeCommand = defineCommand({
  meta: {
    name: "remove",
    description: "Remove a preset from the project",
  },
  args: {
    preset: {
      type: "positional",
      description: "Preset name to remove",
      required: false,
    },
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory",
      default: ".",
    },
    app: {
      type: "string",
      alias: "a",
      description: "Target app in monorepo (e.g., api, web)",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
    keepFiles: {
      type: "boolean",
      description: "Keep files, only update config and dependencies",
      default: false,
    },
  },
  async run({ args }) {
    const projectDir = resolve(args.dir);

    // Check if it's a valid project
    const rootPackageJsonPath = join(projectDir, "package.json");
    if (!(await fileExists(rootPackageJsonPath))) {
      consola.error("No package.json found. Are you in a project directory?");
      process.exit(1);
    }

    // Check if it's an obora project
    if (!hasOboraConfig(projectDir)) {
      consola.error(
        "No .obora/config.json found. This is not an obora project."
      );
      consola.info("Use 'obora create' to start a new obora project.");
      process.exit(1);
    }

    // Read existing config
    const config = await readOboraConfig(projectDir);
    if (!config) {
      consola.error("Failed to read .obora/config.json");
      process.exit(1);
    }

    const isMonorepo = config.base === "monorepo";

    // Get installed presets
    const installedPresets = getInstalledPresets(config);
    const installedList = Object.entries(installedPresets);

    if (installedList.length === 0) {
      consola.info("No presets are currently installed.");
      return;
    }

    // Get preset to remove
    let slotToRemove: string;
    let presetToRemove: string;

    if (args.preset) {
      // Find slot by preset name
      const entry = installedList.find(([_, preset]) => preset === args.preset);
      if (!entry) {
        consola.error(`Preset "${args.preset}" is not installed.`);
        consola.info(
          `Installed presets: ${installedList.map(([_, p]) => p).join(", ")}`
        );
        process.exit(1);
      }
      [slotToRemove, presetToRemove] = entry;
    } else {
      // Prompt for selection
      const choices = installedList.map(([slot, preset]) => ({
        title: `${preset} (${slot})`,
        value: slot,
      }));

      const { slot } = await prompts({
        type: "select",
        name: "slot",
        message: "Select a preset to remove:",
        choices,
      });

      if (!slot) {
        consola.info("Cancelled");
        return;
      }

      slotToRemove = slot;
      presetToRemove = installedPresets[slot];
    }

    // Determine target app for monorepo
    let targetAppDir: string | null = null;
    let targetAppName: string | null = null;

    if (isMonorepo) {
      const appEntries = Object.entries(config.apps);

      // Helper to get actual directory for an app
      const getAppDir = (appKey: string): string | null => {
        const appConfig = config.apps[appKey];
        if (!appConfig) return null;
        const moduleConfig = APP_MODULES[appConfig.module];
        if (!moduleConfig) return null;
        return join(projectDir, moduleConfig.targetDir);
      };

      // Check if preset category applies to specific app type
      const backendCategories = ["database", "email", "payment", "ai", "storage", "auth"];
      const frontendCategories = ["analytics"];
      const isBackendPreset = backendCategories.includes(slotToRemove);
      const isFrontendPreset = frontendCategories.includes(slotToRemove);

      if (args.app) {
        // User specified app
        let appDir = join(projectDir, "apps", args.app);
        if (await dirExists(appDir)) {
          targetAppDir = appDir;
          targetAppName = args.app;
        } else {
          const dir = getAppDir(args.app);
          if (dir && await dirExists(dir)) {
            targetAppDir = dir;
            targetAppName = args.app;
          } else {
            consola.error(`App "${args.app}" not found`);
            process.exit(1);
          }
        }
      } else if (isBackendPreset || isFrontendPreset) {
        const relevantApps = appEntries.filter(([_, appConfig]) => {
          const module = appConfig?.module;
          if (isBackendPreset) return module?.includes("nest") || module?.includes("api");
          if (isFrontendPreset) return module?.includes("next") || module?.includes("web");
          return true;
        }).map(([key]) => key);

        if (relevantApps.length === 1) {
          const dir = getAppDir(relevantApps[0]);
          if (dir) {
            targetAppDir = dir;
            targetAppName = relevantApps[0];
            consola.info(`Auto-selected app: ${targetAppName}`);
          }
        } else if (relevantApps.length > 1 && !args.yes) {
          const { selectedApp } = await prompts({
            type: "select",
            name: "selectedApp",
            message: "Select target app:",
            choices: relevantApps.map((app) => {
              const moduleConfig = APP_MODULES[config.apps[app]?.module || ""];
              return {
                title: `${app} (${moduleConfig?.targetDir || app})`,
                value: app,
              };
            }),
          });

          if (!selectedApp) {
            consola.info("Cancelled");
            return;
          }

          const dir = getAppDir(selectedApp);
          if (dir) {
            targetAppDir = dir;
            targetAppName = selectedApp;
          }
        } else if (relevantApps.length > 1) {
          const dir = getAppDir(relevantApps[0]);
          if (dir) {
            targetAppDir = dir;
            targetAppName = relevantApps[0];
            consola.info(`Using default app: ${targetAppName}`);
          }
        }
      }
    }

    const targetDir = targetAppDir || projectDir;
    const packageJsonPath = targetAppDir
      ? join(targetAppDir, "package.json")
      : rootPackageJsonPath;

    // Confirm removal
    if (!args.yes) {
      const message = args.keepFiles
        ? `Remove "${presetToRemove}" config and dependencies (files will be kept)?`
        : `Remove "${presetToRemove}" completely (including files)?`;

      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message,
        initial: false,
      });

      if (!confirm) {
        consola.info("Cancelled");
        return;
      }
    }

    consola.start(`Removing ${presetToRemove} preset...`);

    try {
      // Get preset info
      const presetInfo = PRESETS[presetToRemove];
      if (!presetInfo) {
        consola.warn(`Unknown preset: ${presetToRemove}`);
      }

      // Try to read manifest for detailed removal
      const presetDir = presetInfo
        ? join(PRESETS_DIR, presetInfo.category, presetToRemove)
        : null;

      let manifest: PresetManifest | null = null;
      if (presetDir) {
        const manifestPath = join(presetDir, "manifest.json");
        if (await fileExists(manifestPath)) {
          manifest = await readJson<PresetManifest>(manifestPath);
        }
      }

      // Read dependencies to remove
      let depsToRemove: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
      if (presetDir) {
        const depsPath = join(presetDir, "dependencies.json");
        if (await fileExists(depsPath)) {
          depsToRemove = await readJson(depsPath);
        }
      }

      // 1. Remove dependencies from package.json
      if (Object.keys(depsToRemove).length > 0) {
        const depsRemoved = await removeDependencies(packageJsonPath, depsToRemove);
        if (depsRemoved) {
          consola.success(`Removed dependencies from ${targetAppName ? `${targetAppName}/` : ""}package.json`);
        }
      }

      // 2. Remove scripts from package.json
      if (manifest?.scripts) {
        const scriptsRemoved = await removeScripts(packageJsonPath, manifest.scripts);
        if (scriptsRemoved) {
          consola.success(`Removed scripts from package.json`);
        }
      }

      // 3. Remove injected content
      if (manifest?.operations.inject && manifest.operations.inject.length > 0) {
        for (const inject of manifest.operations.inject) {
          const filePath = join(targetDir, inject.file);
          const removed = await removeInjectedContent(filePath, inject.marker, inject.content);
          if (removed) {
            consola.success(`Removed injected content from ${inject.file}`);
          }
        }
      }

      // 4. Remove added files/directories (unless keepFiles is true)
      if (!args.keepFiles && manifest?.operations.add && manifest.operations.add.length > 0) {
        for (const addPath of manifest.operations.add) {
          const fullPath = join(targetDir, addPath);

          if (await dirExists(fullPath)) {
            await removeDirectory(fullPath);
            consola.success(`Removed directory: ${addPath}`);
          } else if (await fileExists(fullPath)) {
            await removeFile(fullPath);
            consola.success(`Removed file: ${addPath}`);
          }
        }
      }

      // 5. Update .obora/config.json
      const removedConfig = await removeSlotPreset(projectDir, slotToRemove);
      if (removedConfig) {
        consola.success(`Updated .obora/config.json`);
      }

      consola.success(`Removed ${presetToRemove} preset!`);
      consola.info("Run your package manager to clean up unused dependencies.");

    } catch (error) {
      consola.error("Failed to remove preset:", error);
      process.exit(1);
    }
  },
});

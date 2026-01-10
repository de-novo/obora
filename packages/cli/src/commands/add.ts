import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve, join, dirname } from "pathe";
import { promises as fs } from "node:fs";
import prompts from "prompts";
import {
  PRESETS,
  PRESETS_DIR,
  CATEGORIES,
  APP_MODULES,
  type PresetName,
  dirExists,
  fileExists,
  readJson,
  writeJson,
  copyTemplateDir,
  ensureDir,
} from "../utils";
import {
  hasOboraConfig,
  readOboraConfig,
  addSlotPreset,
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

async function copyFileWithReplacements(
  src: string,
  dest: string,
  replacements: Record<string, string>
): Promise<void> {
  await ensureDir(dirname(dest));

  const textExtensions = [".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml", ".env", ".example"];
  const isTextFile = textExtensions.some((ext) => src.endsWith(ext));

  if (isTextFile) {
    let content = await fs.readFile(src, "utf-8");
    for (const [key, value] of Object.entries(replacements)) {
      content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    await fs.writeFile(dest, content);
  } else {
    await fs.copyFile(src, dest);
  }
}

async function mergePackageJson(
  targetPath: string,
  deps: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> },
  scripts?: Record<string, string>
): Promise<boolean> {
  const packageJson = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  }>(targetPath);

  let updated = false;

  if (deps.dependencies && Object.keys(deps.dependencies).length > 0) {
    packageJson.dependencies = {
      ...packageJson.dependencies,
      ...deps.dependencies,
    };
    updated = true;
  }

  if (deps.devDependencies && Object.keys(deps.devDependencies).length > 0) {
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      ...deps.devDependencies,
    };
    updated = true;
  }

  if (scripts && Object.keys(scripts).length > 0) {
    packageJson.scripts = {
      ...packageJson.scripts,
      ...scripts,
    };
    updated = true;
  }

  if (updated) {
    await writeJson(targetPath, packageJson);
  }

  return updated;
}

async function injectContent(
  filePath: string,
  marker: string,
  content: string
): Promise<boolean> {
  if (!(await fileExists(filePath))) {
    consola.warn(`Inject target not found: ${filePath}`);
    return false;
  }

  let fileContent = await fs.readFile(filePath, "utf-8");

  // Check if content already exists
  if (fileContent.includes(content.trim())) {
    consola.info(`Content already exists in ${filePath}`);
    return false;
  }

  // Regex to capture indentation before the marker
  const markerPattern = new RegExp(`([ \\t]*)\\/\\/ ${marker}`, "g");

  if (!markerPattern.test(fileContent)) {
    consola.warn(`Marker "${marker}" not found in ${filePath}`);
    return false;
  }

  // Reset regex lastIndex after test()
  markerPattern.lastIndex = 0;

  // Replace with indentation preserved
  const updatedContent = fileContent.replace(
    markerPattern,
    (match: string, indent: string) => {
      return `${indent}${content}\n${match}`;
    }
  );

  await fs.writeFile(filePath, updatedContent);
  return true;
}

// ============================================================================
// Command
// ============================================================================

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add a preset to an existing project",
  },
  args: {
    preset: {
      type: "positional",
      description: "Preset name to add",
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
    list: {
      type: "boolean",
      alias: "l",
      description: "List available presets",
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
      consola.warn("No .obora/config.json found. This might not be an obora project.");
      consola.info("The preset will be added, but won't be tracked in the config.");
    }

    // Read existing config if available
    const existingConfig = await readOboraConfig(projectDir);
    const isMonorepo = existingConfig?.base === "monorepo";

    // Get preset name
    let presetName: PresetName;
    if (args.preset && args.preset in PRESETS) {
      presetName = args.preset as PresetName;
    } else {
      // Reorganize to group by category
      const groupedChoices: prompts.Choice[] = [];
      for (const category of CATEGORIES) {
        groupedChoices.push({
          title: `── ${category.toUpperCase()} ──`,
          value: "",
          disabled: true,
        });
        const categoryPresets = Object.values(PRESETS).filter(
          (p) => p.category === category
        );
        for (const preset of categoryPresets) {
          groupedChoices.push({
            title: `  ${preset.name}`,
            description: preset.description,
            value: preset.name,
          });
        }
      }

      const { preset } = await prompts({
        type: "select",
        name: "preset",
        message: "Select a preset to add:",
        choices: groupedChoices.filter((c) => !c.disabled || c.value === ""),
      });

      if (!preset) {
        consola.info("Cancelled");
        return;
      }

      presetName = preset as PresetName;
    }

    const presetInfo = PRESETS[presetName];
    const presetCategory = presetInfo.category;

    // Determine target app for monorepo
    let targetAppDir: string | null = null;
    let targetAppName: string | null = null;

    if (isMonorepo && existingConfig) {
      const appEntries = Object.entries(existingConfig.apps);

      // Helper to get actual directory for an app
      const getAppDir = (appKey: string): string | null => {
        const appConfig = existingConfig.apps[appKey];
        if (!appConfig) return null;
        const moduleConfig = APP_MODULES[appConfig.module];
        if (!moduleConfig) return null;
        return join(projectDir, moduleConfig.targetDir);
      };

      // Check if preset category applies to specific app type
      const backendCategories = ["database", "email", "payment", "ai", "storage", "auth"];
      const frontendCategories = ["analytics"];
      const isBackendPreset = backendCategories.includes(presetCategory);
      const isFrontendPreset = frontendCategories.includes(presetCategory);

      if (args.app) {
        // User specified app - could be app key or directory name
        // First try as directory name
        let appDir = join(projectDir, "apps", args.app);
        if (await dirExists(appDir)) {
          targetAppDir = appDir;
          targetAppName = args.app;
        } else {
          // Try as app key from config
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
        // Auto-select or prompt based on preset type
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
              const moduleConfig = APP_MODULES[existingConfig.apps[app]?.module || ""];
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
          // Default to first relevant app
          const dir = getAppDir(relevantApps[0]);
          if (dir) {
            targetAppDir = dir;
            targetAppName = relevantApps[0];
            consola.info(`Using default app: ${targetAppName}`);
          }
        }
      }
    }

    // Determine the actual target directory for files
    const targetDir = targetAppDir || projectDir;
    const packageJsonPath = targetAppDir
      ? join(targetAppDir, "package.json")
      : rootPackageJsonPath;

    // Check for existing preset in the same slot
    if (existingConfig && !args.yes) {
      const existingSlot = existingConfig.slots[presetCategory];
      if (existingSlot) {
        consola.warn(
          `Slot "${presetCategory}" already has "${existingSlot.preset}" installed.`
        );
        const { confirm } = await prompts({
          type: "confirm",
          name: "confirm",
          message: `Replace "${existingSlot.preset}" with "${presetName}"?`,
          initial: false,
        });

        if (!confirm) {
          consola.info("Cancelled");
          return;
        }
      }
    }

    consola.start(`Adding ${presetName} preset...`);

    try {
      // Check preset directory
      const presetDir = join(PRESETS_DIR, presetInfo.category, presetName);

      if (!(await dirExists(presetDir))) {
        consola.warn(`Preset ${presetName} not found locally. Downloading...`);
        // TODO: Download from GitHub
        consola.error("Remote preset download not implemented yet");
        process.exit(1);
      }

      // Read preset manifest
      const manifestPath = join(presetDir, "manifest.json");
      if (!(await fileExists(manifestPath))) {
        consola.error("Invalid preset: missing manifest.json");
        process.exit(1);
      }

      const manifest = await readJson<PresetManifest>(manifestPath);

      // Check for conflicts
      if (manifest.conflicts && existingConfig) {
        for (const conflict of manifest.conflicts) {
          const installedPresets = Object.values(existingConfig.slots)
            .filter((s) => s !== null)
            .map((s) => s!.preset);

          if (installedPresets.includes(conflict)) {
            consola.error(`Conflict: "${presetName}" conflicts with installed preset "${conflict}"`);
            process.exit(1);
          }
        }
      }

      // Read and merge dependencies
      const depsPath = join(presetDir, "dependencies.json");
      if (await fileExists(depsPath)) {
        const deps = await readJson<{
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        }>(depsPath);

        if (await fileExists(packageJsonPath)) {
          const updated = await mergePackageJson(packageJsonPath, deps, manifest.scripts);
          if (updated) {
            consola.success(`Updated ${targetAppName ? `${targetAppName}/` : ""}package.json`);
          }
        }
      }

      // Copy preset files based on operations.add
      const presetFilesDir = join(presetDir, "files");
      const replacements = {
        PROJECT_NAME: existingConfig?.base || "project",
      };

      if (await dirExists(presetFilesDir)) {
        for (const addPath of manifest.operations.add) {
          const sourcePath = join(presetFilesDir, addPath);
          const destPath = join(targetDir, addPath);

          if (await dirExists(sourcePath)) {
            // It's a directory
            await copyTemplateDir(sourcePath, destPath, replacements);
          } else if (await fileExists(sourcePath)) {
            // It's a file
            await copyFileWithReplacements(sourcePath, destPath, replacements);
            consola.success(`Copied ${addPath}`);
          } else {
            consola.warn(`Source not found: ${addPath}`);
          }
        }
      }

      // Process inject operations
      if (manifest.operations.inject && manifest.operations.inject.length > 0) {
        for (const inject of manifest.operations.inject) {
          const filePath = join(targetDir, inject.file);
          const content = inject.content.replace(/{{PROJECT_NAME}}/g, existingConfig?.base || "project");

          const injected = await injectContent(filePath, inject.marker, content);
          if (injected) {
            consola.success(`Injected content into ${inject.file}`);
          }
        }
      }

      // Show env variables needed
      if (manifest.env && manifest.env.length > 0) {
        const envVars = manifest.env
          .map((e) => `${e.key}=${e.secret ? "***" : e.example || "value"}`)
          .join("\n");

        consola.box(`Environment variables needed:\n\n${envVars}`);
      }

      // Show post-install instructions
      if (manifest.postInstall && manifest.postInstall.length > 0) {
        consola.info("Post-install steps:");
        for (const step of manifest.postInstall) {
          consola.info(`  - ${step}`);
        }
      }

      // Update .obora/config.json if it exists
      if (existingConfig) {
        await addSlotPreset(
          projectDir,
          presetCategory,
          presetName,
          presetInfo.version
        );
        consola.success(`Updated .obora/config.json`);
      }

      consola.success(`Added ${presetName} preset!`);
      consola.info("Run your package manager to install new dependencies.");
    } catch (error) {
      consola.error("Failed to add preset:", error);
      process.exit(1);
    }
  },
});

import { defineCommand } from "citty";
import { consola } from "consola";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "pathe";
import prompts from "prompts";
import {
  APP_MODULES,
  dirExists,
  fileExists,
  PRESETS,
  PRESETS_DIR,
  readJson,
  resolvePresetName,
  writeJson,
} from "../utils";
import {
  getInstalledPresets,
  hasOboraConfig,
  readOboraConfig,
  removeSlotPreset,
} from "../utils/project-config";
import { Errors, showError } from "../utils/errors";
import { withSpinner } from "../utils/progress";

// ============================================================================
// Types
// ============================================================================

interface PresetTargetConfig {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
  scripts?: Record<string, string>;
  env?: Array<{
    key: string;
    description: string;
    required: boolean;
    secret: boolean;
    example?: string;
  }>;
  postInstall?: string[];
  detect?: string[] | DetectRule;
}

interface DetectRule {
  packages?: string[];
  packageVersions?: Record<string, string>;
  runtime?: {
    node?: string;
    bun?: boolean;
    deno?: boolean;
    packageManager?: "pnpm" | "yarn" | "npm" | "bun";
  };
}

interface PresetManifest {
  name: string;
  category: string;
  description: string;
  version?: string;
  conflicts?: string[];
  requires?: string[];
  scripts?: Record<string, string>;
  env?: Array<{
    key: string;
    description: string;
    required: boolean;
    secret: boolean;
    example?: string;
  }>;
  postInstall?: string[];
  common?: PresetTargetConfig;
  targets?: Record<string, PresetTargetConfig>;
  variants?: Record<string, PresetTargetConfig>;
}

// ============================================================================
// Helper Functions
// ============================================================================

function collectTargetConfigs(manifest: PresetManifest): Record<string, PresetTargetConfig> {
  return manifest.targets || manifest.variants || {};
}

function collectDependencies(
  manifest: PresetManifest,
  targetKey?: string
): { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } {
  const deps: Record<string, string> = { ...(manifest.common?.dependencies || {}) };
  const devDeps: Record<string, string> = { ...(manifest.common?.devDependencies || {}) };
  const targetConfigs = collectTargetConfigs(manifest);
  const targetKeys = targetKey ? [targetKey] : Object.keys(targetConfigs);
  for (const key of targetKeys) {
    const cfg = targetConfigs[key];
    if (!cfg) continue;
    Object.assign(deps, cfg.dependencies || {});
    Object.assign(devDeps, cfg.devDependencies || {});
  }
  return {
    dependencies: Object.keys(deps).length > 0 ? deps : undefined,
    devDependencies: Object.keys(devDeps).length > 0 ? devDeps : undefined,
  };
}

function collectScripts(manifest: PresetManifest, targetKey?: string): Record<string, string> {
  const scripts: Record<string, string> = {
    ...(manifest.scripts || {}),
    ...(manifest.common?.scripts || {}),
  };
  const targetConfigs = collectTargetConfigs(manifest);
  const targetKeys = targetKey ? [targetKey] : Object.keys(targetConfigs);
  for (const key of targetKeys) {
    const cfg = targetConfigs[key];
    if (!cfg?.scripts) continue;
    Object.assign(scripts, cfg.scripts);
  }
  return scripts;
}

function collectFiles(manifest: PresetManifest, targetKey?: string): string[] {
  const files: string[] = [];
  if (manifest.common?.files) {
    files.push(...manifest.common.files);
  }
  const targetConfigs = collectTargetConfigs(manifest);
  const targetKeys = targetKey ? [targetKey] : Object.keys(targetConfigs);
  for (const key of targetKeys) {
    const cfg = targetConfigs[key];
    if (cfg?.files) {
      files.push(...cfg.files);
    }
  }
  return Array.from(new Set(files));
}

async function detectTargetKey(
  manifest: PresetManifest,
  packageJsonPath: string
): Promise<string | null> {
  const targetConfigs = collectTargetConfigs(manifest);
  if (!(await fileExists(packageJsonPath))) return null;
  const pkg = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    engines?: { node?: string };
  }>(packageJsonPath);
  const deps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  const depVersions = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  const nodeEngine = pkg.engines?.node;
  const runtimeFlags = await detectRuntimeFlags(dirname(packageJsonPath));
  for (const [key, cfg] of Object.entries(targetConfigs)) {
    if (!hasDetectRule(cfg?.detect)) continue;
    if (matchesDetectRule(cfg!.detect!, deps, depVersions, nodeEngine, runtimeFlags)) {
      return key;
    }
  }
  return null;
}

function matchesDetectRule(
  detect: string[] | DetectRule,
  deps: Set<string>,
  depVersions: Record<string, string>,
  nodeEngine?: string,
  runtimeFlags?: { bun: boolean; deno: boolean; packageManager?: "pnpm" | "yarn" | "npm" | "bun" }
): boolean {
  if (Array.isArray(detect)) {
    return detect.some((dep) => deps.has(dep));
  }

  if (detect.packages && !detect.packages.every((dep) => deps.has(dep))) {
    return false;
  }

  if (detect.packageVersions) {
    for (const [pkg, requirement] of Object.entries(detect.packageVersions)) {
      const version = depVersions[pkg];
      if (!version || !satisfiesVersion(version, requirement)) {
        return false;
      }
    }
  }

  if (detect.runtime?.node) {
    const runtimeVersion = nodeEngine || process.version;
    if (!satisfiesVersion(runtimeVersion, detect.runtime.node)) {
      return false;
    }
  }

  if (detect.runtime?.bun && !runtimeFlags?.bun) {
    return false;
  }
  if (detect.runtime?.deno && !runtimeFlags?.deno) {
    return false;
  }
  if (detect.runtime?.packageManager && runtimeFlags?.packageManager !== detect.runtime.packageManager) {
    return false;
  }

  return true;
}

async function detectRuntimeFlags(targetDir: string): Promise<{
  bun: boolean;
  deno: boolean;
  packageManager?: "pnpm" | "yarn" | "npm" | "bun";
}> {
  const bun = await fileExists(join(targetDir, "bun.lockb")) ||
    await fileExists(join(targetDir, "bun.lock"));
  const deno = await fileExists(join(targetDir, "deno.json")) ||
    await fileExists(join(targetDir, "deno.jsonc"));
  const pnpm = await fileExists(join(targetDir, "pnpm-lock.yaml"));
  const yarn = await fileExists(join(targetDir, "yarn.lock"));
  const npm = await fileExists(join(targetDir, "package-lock.json"));
  const packageManager = bun
    ? "bun"
    : pnpm
      ? "pnpm"
      : yarn
        ? "yarn"
        : npm
          ? "npm"
          : undefined;
  return { bun, deno, packageManager };
}

function hasDetectRule(detect?: string[] | DetectRule): boolean {
  if (!detect) return false;
  if (Array.isArray(detect)) return detect.length > 0;
  return Boolean(
    (detect.packages && detect.packages.length > 0) ||
    (detect.packageVersions && Object.keys(detect.packageVersions).length > 0) ||
    detect.runtime
  );
}

function satisfiesVersion(actual: string, requirement: string): boolean {
  const req = parseMajorMinor(requirement);
  const act = parseMajorMinor(actual);
  if (!req || !act) return false;

  const useMinor = req.minor !== null;
  const compare = compareMajorMinor(act, req, useMinor);

  if (requirement.startsWith(">=")) return compare >= 0;
  if (requirement.startsWith("<=")) return compare <= 0;
  if (requirement.startsWith(">")) return compare > 0;
  if (requirement.startsWith("<")) return compare < 0;
  return compare === 0;
}

function parseMajorMinor(version: string): { major: number; minor: number | null } | null {
  const match = version.match(/(\\d+)(?:\\.(\\d+))?/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: match[2] ? Number.parseInt(match[2], 10) : null,
  };
}

function compareMajorMinor(
  actual: { major: number; minor: number | null },
  required: { major: number; minor: number | null },
  useMinor: boolean
): number {
  if (actual.major !== required.major) {
    return actual.major > required.major ? 1 : -1;
  }
  if (!useMinor) return 0;
  const actualMinor = actual.minor ?? 0;
  const requiredMinor = required.minor ?? 0;
  if (actualMinor === requiredMinor) return 0;
  return actualMinor > requiredMinor ? 1 : -1;
}

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
      showError(Errors.fsNotFound(rootPackageJsonPath, "file"));
      process.exit(1);
    }

    // Check if it's an obora project
    if (!hasOboraConfig(projectDir)) {
      showError(Errors.projectNotInitialized(projectDir));
      process.exit(1);
    }

    // Read existing config
    const config = await readOboraConfig(projectDir);
    if (!config) {
      showError(Errors.configInvalid(join(projectDir, ".obora/config.json"), "Failed to read configuration"));
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
        showError(Errors.presetNotFound(args.preset, installedList.map(([_, p]) => p)));
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
        if (appConfig.path) return appConfig.path;
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
            showError(Errors.fsNotFound(join(projectDir, "apps", args.app), "directory"));
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
                title: `${app} (${config.apps[app]?.path || moduleConfig?.targetDir || app})`,
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

    try {
      await withSpinner(
        `Removing ${presetToRemove} preset`,
        async () => {
          // Get preset info
          const canonicalPreset = resolvePresetName(presetToRemove);
          const presetInfo = PRESETS[canonicalPreset];

          // Try to read manifest for detailed removal
          const presetDir = presetInfo
            ? join(PRESETS_DIR, presetInfo.category, canonicalPreset)
            : null;

          let manifest: PresetManifest | null = null;
          if (presetDir) {
            const manifestPath = join(presetDir, "manifest.json");
            if (await fileExists(manifestPath)) {
              manifest = await readJson<PresetManifest>(manifestPath);
            }
          }

          const targetKey = manifest
            ? (config.presetTargets?.[canonicalPreset] ||
              await detectTargetKey(manifest, packageJsonPath))
            : null;

          const depsToRemove = manifest ? collectDependencies(manifest, targetKey || undefined) : {};

          // 1. Remove dependencies from package.json
          if (Object.keys(depsToRemove).length > 0) {
            await removeDependencies(packageJsonPath, depsToRemove);
          }

          // 2. Remove scripts from package.json
          const scriptsToRemove = manifest ? collectScripts(manifest, targetKey || undefined) : {};
          if (Object.keys(scriptsToRemove).length > 0) {
            await removeScripts(packageJsonPath, scriptsToRemove);
          }

          // 3. Remove added files/directories (unless keepFiles is true)
          const filesToRemove = !args.keepFiles && manifest
            ? collectFiles(manifest, targetKey || undefined)
            : [];
          if (filesToRemove.length > 0) {
            for (const fileEntry of filesToRemove) {
              const isRootEntry = targetKey && (
                fileEntry === targetKey ||
                (fileEntry === "nextjs" && targetKey.startsWith("nextjs")) ||
                (fileEntry === "nestjs" && targetKey.startsWith("nestjs"))
              );
              const fullPath = isRootEntry
                ? targetDir
                : join(targetDir, fileEntry);

              if (await dirExists(fullPath)) {
                await removeDirectory(fullPath);
              } else if (await fileExists(fullPath)) {
                await removeFile(fullPath);
              }
            }
          }

          // 4. Update .obora/config.json
          await removeSlotPreset(projectDir, slotToRemove);
        },
        { successText: `Removed ${presetToRemove} preset`, showTime: true }
      );

      consola.info("Run your package manager to clean up unused dependencies.");

    } catch (error) {
      showError(Errors.unknown(error));
      process.exit(1);
    }
  },
});

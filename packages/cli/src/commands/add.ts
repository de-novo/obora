import { defineCommand } from "citty";
import { consola } from "consola";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "pathe";
import prompts from "prompts";
import {
  APP_MODULES,
  APP_MODULE_NAMES,
  type AppModuleName,
  CATEGORIES,
  PRESETS,
  PRESETS_DIR,
  isForbiddenPresetFilePath,
  type PresetName,
  TEMPLATES_DIR,
  copyTemplateDir,
  dirExists,
  ensureDir,
  fileExists,
  readJson,
  resolvePresetName,
  writeJson,
} from "../utils";
import {
  addSlotPreset,
  hasOboraConfig,
  readOboraConfig,
  setPresetTarget,
} from "../utils/project-config";

// ============================================================================
// Types
// ============================================================================

interface PresetEnvVar {
  key: string;
  description: string;
  required: boolean;
  secret: boolean;
  example?: string;
}

interface PresetTarget {
  description: string;
  dialect?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: string[];
  scripts?: Record<string, string>;
  inject?: Array<{
    file: string;
    marker: string;
    content: string;
    order?: number;
  }>;
  env?: PresetEnvVar[];
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

interface PresetManifestTargets {
  name: string;
  category: string;
  description: string;
  version?: string;
  common?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    files?: string[];
    scripts?: Record<string, string>;
  };
  targets?: Record<string, PresetTarget>;
  variants?: Record<string, PresetTarget>;
  conflicts?: string[];
  postInstall?: string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

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

async function resolveTargetFromDetect(
  targetConfigs: Record<string, PresetTarget>,
  packageJsonPath: string
): Promise<{ target: string; reasonDetail: string } | null> {
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
  for (const [key, config] of Object.entries(targetConfigs)) {
    if (!hasDetectRule(config.detect)) continue;
    const reasonDetail = matchesDetectRule(config.detect, deps, depVersions, nodeEngine, runtimeFlags);
    if (reasonDetail) {
      return { target: key, reasonDetail };
    }
  }
  return null;
}

function matchesDetectRule(
  detect: string[] | DetectRule,
  deps: Set<string>,
  depVersions: Record<string, string>,
  nodeEngine?: string,
  runtimeFlags?: { bun: boolean; deno: boolean }
): string | null {
  if (Array.isArray(detect)) {
    const matched = detect.find((dep) => deps.has(dep));
    return matched ? `matched: ${matched}` : null;
  }

  if (detect.packages && !detect.packages.every((dep) => deps.has(dep))) {
    return null;
  }

  if (detect.packageVersions) {
    for (const [pkg, requirement] of Object.entries(detect.packageVersions)) {
      const version = depVersions[pkg];
      if (!version || !satisfiesVersion(version, requirement)) {
        return null;
      }
    }
  }

  if (detect.runtime?.node) {
    const runtimeVersion = nodeEngine || process.version;
    if (!satisfiesVersion(runtimeVersion, detect.runtime.node)) {
      return null;
    }
  }

  if (detect.runtime?.bun && !runtimeFlags?.bun) {
    return null;
  }
  if (detect.runtime?.deno && !runtimeFlags?.deno) {
    return null;
  }
  if (detect.runtime?.packageManager && runtimeFlags?.packageManager !== detect.runtime.packageManager) {
    return null;
  }

  const reasonParts: string[] = [];
  if (detect.packages?.length) reasonParts.push(`packages: ${detect.packages.join(", ")}`);
  if (detect.packageVersions) {
    const versionText = Object.entries(detect.packageVersions)
      .map(([pkg, req]) => `${pkg}${req}`)
      .join(", ");
    reasonParts.push(`versions: ${versionText}`);
  }
  if (detect.runtime?.node) reasonParts.push(`node: ${detect.runtime.node}`);
  if (detect.runtime?.bun) reasonParts.push("runtime: bun");
  if (detect.runtime?.deno) reasonParts.push("runtime: deno");
  if (detect.runtime?.packageManager) reasonParts.push(`pm: ${detect.runtime.packageManager}`);
  return reasonParts.length > 0 ? `matched: ${reasonParts.join(" | ")}` : "matched: rule";
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
 * Resolve target key based on app module type
 * This maps app module names to their preferred preset targets
 */
function resolveTargetKeyForAppModule(
  appModule: string | undefined,
  targetKeys: string[]
): string | null {
  if (!appModule) return null;

  if (appModule === "nextjs-web" || appModule.includes("nextjs") || appModule.includes("next")) {
    if (targetKeys.includes("nextjs")) return "nextjs";
    if (targetKeys.includes("sqlite")) return "sqlite";
  }

  if (appModule === "nestjs-api" || appModule.includes("nestjs") || appModule.includes("nest")) {
    if (targetKeys.includes("nestjs")) return "nestjs";
    if (targetKeys.includes("server")) return "server";
    if (targetKeys.includes("postgres")) return "postgres";
  }

  return null;
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

  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`^([ \\t]*)\\/\\/ ${escaped}\\s*$`, "gm"),
    new RegExp(`^([ \\t]*)# ${escaped}\\s*$`, "gm"),
    new RegExp(`^([ \\t]*)\\/\\* ${escaped} \\*\\/\\s*$`, "gm"),
    new RegExp(`^([ \\t]*)\\{\\/\\* ${escaped} \\*\\/\\}\\s*$`, "gm"),
    new RegExp(`^([ \\t]*)<!-- ${escaped} -->\\s*$`, "gm"),
  ];

  if (!patterns.some((pattern) => pattern.test(fileContent))) {
    consola.warn(`Marker "${marker}" not found in ${filePath}`);
    return false;
  }

  // Replace with indentation preserved
  let updatedContent = fileContent;
  for (const pattern of patterns) {
    updatedContent = updatedContent.replace(
      pattern,
      (match: string, indent: string) => {
        return `${indent}${content}\n${match}`;
      }
    );
  }

  await fs.writeFile(filePath, updatedContent);
  return true;
}

// ============================================================================
// App Template Handler
// ============================================================================

interface AddArgs {
  preset?: string;
  dir: string;
  app?: string;
  type?: string;
  name?: string;
  yes: boolean;
  list: boolean;
  plan: boolean;
  dialect?: string;
}

async function handleAppTemplate(args: AddArgs, targetDir: string): Promise<void> {
  // Get app template name
  let templateName: AppModuleName;

  if (args.preset && args.preset in APP_MODULES) {
    templateName = args.preset as AppModuleName;
  } else {
    // Show selection
    const choices = APP_MODULE_NAMES.map((name) => ({
      title: name,
      description: APP_MODULES[name].description,
      value: name,
    }));

    const { selected } = await prompts({
      type: "select",
      name: "selected",
      message: "Select an app template:",
      choices,
    });

    if (!selected) {
      consola.info("Cancelled");
      return;
    }

    templateName = selected as AppModuleName;
  }

  const templateFilesDir = join(TEMPLATES_DIR, "apps", templateName, "files");

  // Check if template exists
  if (!(await dirExists(templateFilesDir))) {
    consola.error(`Template "${templateName}" not found at ${templateFilesDir}`);
    process.exit(1);
  }

  // Ensure target directory exists
  await ensureDir(targetDir);

  // Check if target already has files
  const existingFiles = await fs.readdir(targetDir).catch(() => []);
  if (existingFiles.length > 0 && !args.yes) {
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Target directory "${targetDir}" is not empty. Continue?`,
      initial: false,
    });

    if (!confirm) {
      consola.info("Cancelled");
      return;
    }
  }

  // Determine package name
  let packageName = args.name;
  if (!packageName && !args.yes) {
    const dirName = targetDir.split("/").pop() || templateName;
    const { name } = await prompts({
      type: "text",
      name: "name",
      message: "Package name:",
      initial: `@obora/${dirName}`,
    });

    if (!name) {
      consola.info("Cancelled");
      return;
    }

    packageName = name;
  }

  packageName = packageName || `@obora/${targetDir.split("/").pop() || templateName}`;

  consola.start(`Adding ${templateName} template to ${targetDir}...`);

  try {
    // Copy template files
    const replacements = {
      PROJECT_NAME: packageName.replace("@", "").replace("/", "-"),
    };

    await copyTemplateDir(templateFilesDir, targetDir, replacements, { overwrite: true });

    // Update package.json with correct name
    const packageJsonPath = join(targetDir, "package.json");
    if (await fileExists(packageJsonPath)) {
      const packageJson = await readJson<Record<string, unknown>>(packageJsonPath);
      packageJson.name = packageName;
      await writeJson(packageJsonPath, packageJson);
    }

    consola.success(`Added ${templateName} template!`);
    consola.info(`  Location: ${targetDir}`);
    consola.info(`  Package: ${packageName}`);
    consola.info("");
    consola.info("Next steps:");
    consola.info("  1. Run your package manager to install dependencies");
    consola.info(`  2. cd ${targetDir} && pnpm dev`);
  } catch (error) {
    consola.error("Failed to add app template:", error);
    process.exit(1);
  }
}

// ============================================================================
// Command
// ============================================================================

export const addCommand = defineCommand({
  meta: {
    name: "add",
    description: "Add a preset or app template to an existing project",
  },
  args: {
    preset: {
      type: "positional",
      description: "Preset or app template name to add",
      required: false,
    },
    dir: {
      type: "string",
      alias: "d",
      description: "Target directory (default: current directory)",
      default: ".",
    },
    app: {
      type: "string",
      alias: "a",
      description: "Target app in monorepo (e.g., api, web)",
    },
    type: {
      type: "string",
      alias: "t",
      description: "Type to add: preset or app (auto-detected if not specified)",
    },
    name: {
      type: "string",
      alias: "n",
      description: "Package name for app template (e.g., @myorg/dashboard)",
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
      description: "List available presets and app templates",
      default: false,
    },
    plan: {
      type: "boolean",
      description: "Show a dry-run plan without applying changes",
      default: false,
    },
    dialect: {
      type: "string",
      description: "Database dialect for ORM presets (e.g., sqlite, postgres)",
    },
  },
  async run({ args }) {
    const targetDir = resolve(args.dir);

    // Determine if adding app template or preset
    const isAppTemplate = args.type === "app" ||
      (args.preset && args.preset in APP_MODULES) ||
      (!args.preset && args.type !== "preset");

    // ========================================================================
    // App Template Mode
    // ========================================================================
    if (isAppTemplate || (args.preset && args.preset in APP_MODULES)) {
      await handleAppTemplate(args, targetDir);
      return;
    }

    // ========================================================================
    // Preset Mode (existing logic)
    // ========================================================================
    const projectDir = targetDir;

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
    let presetName: PresetName | null = null;
    if (args.preset) {
      const normalized = resolvePresetName(args.preset);
      if (normalized in PRESETS) {
        presetName = normalized as PresetName;
      } else {
        consola.error(`Unknown preset: ${args.preset}`);
        process.exit(1);
      }
    }
    if (!presetName) {
      // Reorganize to group by category
      const groupedChoices: prompts.Choice[] = [];

      // Add app templates section
      groupedChoices.push({
        title: `── APP TEMPLATES ──`,
        value: "",
        disabled: true,
      });
      for (const [name, config] of Object.entries(APP_MODULES)) {
        groupedChoices.push({
          title: `  ${name}`,
          description: config.description,
          value: `app:${name}`,
        });
      }

      // Add presets by category
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
        message: "Select a preset or app template to add:",
        choices: groupedChoices.filter((c) => !c.disabled || c.value === ""),
      });

      if (!preset) {
        consola.info("Cancelled");
        return;
      }

      // Check if user selected an app template
      if (typeof preset === "string" && preset.startsWith("app:")) {
        const appName = preset.replace("app:", "") as AppModuleName;
        await handleAppTemplate({ ...args, preset: appName }, targetDir);
        return;
      }

      presetName = resolvePresetName(preset as PresetName) as PresetName;
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
        if (appConfig.path) return appConfig.path;
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
                title: `${app} (${existingConfig.apps[app]?.path || moduleConfig?.targetDir || app})`,
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
    const presetTargetDir = targetAppDir || projectDir;
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

      const manifestRaw = await readJson<PresetManifestTargets>(manifestPath);

      // Check for conflicts
      if (manifestRaw.conflicts && existingConfig) {
        for (const conflict of manifestRaw.conflicts) {
          const installedPresets = Object.values(existingConfig.slots)
            .filter((s) => s !== null)
            .map((s) => s!.preset);

          if (installedPresets.includes(conflict)) {
            consola.error(`Conflict: "${presetName}" conflicts with installed preset "${conflict}"`);
            process.exit(1);
          }
        }
      }

      // ======================================================================
      // Manifest with targets/variants (dialect-based)
      // ======================================================================
      const targetConfigs = manifestRaw.targets || manifestRaw.variants;
      if (!targetConfigs) {
        consola.error("Invalid preset: missing targets/variants");
        process.exit(1);
      }
      {
        const targetNames = Object.keys(targetConfigs);

        // Select target (dialect)
        let selectedTarget: string | undefined;
        let targetSource: "detect" | "manual" | "override" | "default" | "saved" | "app-module" = "default";
        let targetReasonDetail: string | undefined;

        // 1. CLI argument override
        if (args.dialect && targetNames.includes(args.dialect)) {
          selectedTarget = args.dialect;
          targetSource = "override";
        }
        // 2. Saved preference
        else if (existingConfig?.presetTargets?.[presetName] &&
          targetNames.includes(existingConfig.presetTargets[presetName])) {
          selectedTarget = existingConfig.presetTargets[presetName];
          consola.info(`Using saved target: ${selectedTarget}`);
          targetSource = "saved";
        }
        // 3. Detect from package.json dependencies
        else {
          const detected = await resolveTargetFromDetect(targetConfigs, packageJsonPath);
          if (detected) {
            selectedTarget = detected.target;
            targetReasonDetail = detected.reasonDetail;
            consola.info(`Detected target: ${selectedTarget}`);
            targetSource = "detect";
          }
        }

        // 4. Resolve from app module type (if target app is known)
        if (!selectedTarget && targetAppName && existingConfig?.apps?.[targetAppName]) {
          const appModule = existingConfig.apps[targetAppName].module;
          const resolved = resolveTargetKeyForAppModule(appModule, targetNames);
          if (resolved) {
            selectedTarget = resolved;
            targetReasonDetail = `app module: ${appModule}`;
            consola.info(`Resolved target from app module: ${selectedTarget}`);
            targetSource = "app-module";
          }
        }

        // 5. Default to first target (with --yes flag)
        if (!selectedTarget && args.yes && targetNames.length > 0) {
          selectedTarget = targetNames[0];
          consola.info(`Using default: ${selectedTarget}`);
          targetSource = "default";
        }
        // 6. Prompt user to select
        else if (!selectedTarget) {
          const { target } = await prompts({
            type: "select",
            name: "target",
            message: "Select target variant:",
            choices: targetNames.map((name) => ({
              title: name,
              description: targetConfigs[name].description,
              value: name,
            })),
          });

          if (!target) {
            consola.info("Cancelled");
            return;
          }
          selectedTarget = target;
          targetSource = "manual";
        }

        // Safety check
        if (!selectedTarget) {
          consola.error("No target selected");
          process.exit(1);
        }

        const targetConfig = targetConfigs[selectedTarget];
        const commonConfig = manifestRaw.common || {};

        if (args.plan) {
          const depCount = Object.keys({
            ...(commonConfig.dependencies || {}),
            ...(targetConfig.dependencies || {}),
          }).length;
          const devDepCount = Object.keys({
            ...(commonConfig.devDependencies || {}),
            ...(targetConfig.devDependencies || {}),
          }).length;
          const scriptCount = Object.keys({
            ...(manifestRaw.scripts || {}),
            ...(commonConfig.scripts || {}),
            ...(targetConfig.scripts || {}),
          }).length;
        const fileCount = (commonConfig.files || []).length + (targetConfig.files || []).length;
          const injectCount = (targetConfig.inject || []).length;
          const envCount = (manifestRaw.env || []).length + (targetConfig.env || []).length;
          consola.box(
            `Plan: ${presetName} (${selectedTarget})\n` +
              `Target dir: ${presetTargetDir}\n` +
              `Dependencies: ${depCount}\n` +
              `DevDependencies: ${devDepCount}\n` +
              `Scripts: ${scriptCount}\n` +
              `Files: ${fileCount}\n` +
              `Injects: ${injectCount}\n` +
              `Env vars: ${envCount}`
          );
          return;
        }

        // Merge dependencies: common + target
        const mergedDeps = {
          dependencies: {
            ...commonConfig.dependencies,
            ...targetConfig.dependencies,
          },
          devDependencies: {
            ...commonConfig.devDependencies,
            ...targetConfig.devDependencies,
          },
        };

        // Merge scripts
        const mergedScripts = {
          ...(manifestRaw.scripts || {}),
          ...commonConfig.scripts,
          ...targetConfig.scripts,
        };

        // Update package.json
        if (await fileExists(packageJsonPath)) {
          const updated = await mergePackageJson(packageJsonPath, mergedDeps, mergedScripts);
          if (updated) {
            consola.success(`Updated ${targetAppName ? `${targetAppName}/` : ""}package.json`);
          }
        }

        // Copy files: common + target
        const presetFilesDir = join(presetDir, "files");
        const replacements = {
          PROJECT_NAME: existingConfig?.base || "project",
        };

        const filesToCopy = [
          ...(commonConfig.files || []),
          ...(targetConfig.files || []),
        ];

        for (const fileDir of filesToCopy) {
          const sourcePath = join(presetFilesDir, fileDir);
          if (await dirExists(sourcePath)) {
            const isRootEntry = fileDir === selectedTarget ||
              (fileDir === "nextjs" && selectedTarget.startsWith("nextjs")) ||
              (fileDir === "nestjs" && selectedTarget.startsWith("nestjs"));
            const destPath = isRootEntry
              ? presetTargetDir
              : join(presetTargetDir, fileDir);
            await copyTemplateDir(sourcePath, destPath, replacements, {
              overwrite: false,
              filter: (relPath, kind) =>
                kind === "file" ? !isForbiddenPresetFilePath(relPath) : true,
            });
            consola.success(`Copied ${fileDir}/`);
          }
        }

        // Process inject operations
        if (targetConfig.inject && targetConfig.inject.length > 0) {
          const sortedInjects = [...targetConfig.inject].sort((a, b) => {
            const orderA = a.order ?? 0;
            const orderB = b.order ?? 0;
            if (orderA !== orderB) return orderA - orderB;
            return 0;
          });
          for (const inject of sortedInjects) {
            const filePath = join(presetTargetDir, inject.file);
            const content = inject.content.replace(/{{PROJECT_NAME}}/g, existingConfig?.base || "project");

            const injected = await injectContent(filePath, inject.marker, content);
            if (injected) {
              consola.success(`Injected content into ${inject.file}`);
            }
          }
        }

        // Show env variables
        const allEnvVars = [
          ...(manifestRaw.env || []),
          ...(targetConfig.env || []),
        ];
        if (allEnvVars.length > 0) {
          const envVars = allEnvVars
            .map((e) => `${e.key}=${e.secret ? "***" : e.example || "value"}`)
            .join("\n");

          consola.box(`Environment variables needed:\n\n${envVars}`);
        }

        // Show post-install
        const postInstall = targetConfig.postInstall || manifestRaw.postInstall || [];
        if (postInstall.length > 0) {
          consola.info("Post-install steps:");
          for (const step of postInstall) {
            consola.info(`  - ${step}`);
          }
        }

        // Update config
        if (existingConfig) {
          await addSlotPreset(projectDir, presetCategory, presetName, presetInfo.version);
          await setPresetTarget(projectDir, presetName, selectedTarget, targetSource, targetReasonDetail);
          consola.success(`Updated .obora/config.json`);
        }

        consola.success(`Added ${presetName} (${selectedTarget}) preset!`);
        consola.info("Run your package manager to install new dependencies.");
        return;
      }
    } catch (error) {
      consola.error("Failed to add preset:", error);
      process.exit(1);
    }
  },
});

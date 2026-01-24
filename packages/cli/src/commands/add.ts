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
  type Category,
  TEMPLATES_DIR,
  copyTemplateDir,
  dirExists,
  ensureDir,
  fileExists,
  readJson,
  resolvePresetName,
  writeJson,
  applyTransformsWithRollback,
  parseImportStatement,
  isImportStatement,
  type ImportSpec,
  type DependencySpec,
  type NestJsModuleSpec,
  type ProviderWrapSpec,
  type LayoutComponentSpec,
  type TransformOptions,
  type TransformOperation,
} from "../utils";
import {
  promptCategory,
  promptPreset,
  promptTarget,
} from "../utils/prompts";
import {
  addSlotPreset,
  hasOboraConfig,
  readOboraConfig,
  setPresetTarget,
} from "../utils/project-config";
import { Errors, showError } from "../utils/errors";
import { withSpinner, ProgressGroup } from "../utils/progress";

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

interface PresetTransform {
  /** Target file path (relative to preset target directory) */
  target: string;
  /** Transform type */
  type: "import" | "dependency" | "nestjs-module" | "provider-wrap" | "layout-component";
  /** For import: import statement string or ImportSpec */
  content?: string;
  /** For dependency: package name */
  name?: string;
  /** For dependency: package version */
  version?: string;
  /** For dependency: true if devDependency */
  dev?: boolean;
  /** For nestjs-module: module name to add to imports array */
  module?: string;
  /** For provider-wrap: provider component name */
  provider?: string;
  /** For provider-wrap: optional props to pass to the provider */
  props?: Record<string, string>;
  /** For layout-component: component name to add */
  component?: string;
  /** For layout-component: position in layout (body-start, body-end, html-start, html-end) */
  position?: "body-start" | "body-end" | "html-start" | "html-end";
  /** For layout-component: self-closing tag (default: true) */
  selfClosing?: boolean;
}

interface PresetTarget {
  description: string;
  dialect?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files: string[];
  scripts?: Record<string, string>;
  /** AST-based code transformations */
  transform?: PresetTransform[];
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
  scripts?: Record<string, string>;
  env?: PresetEnvVar[];
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
  runtimeFlags?: { bun: boolean; deno: boolean; packageManager?: "pnpm" | "yarn" | "npm" | "bun" }
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

function hasDetectRule(detect?: string[] | DetectRule): detect is string[] | DetectRule {
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

interface TransformPreview {
  target: string;
  type: string;
  description: string;
  preview?: string;
  status: "will-apply" | "already-exists" | "error";
  error?: string;
}

/**
 * Convert PresetTransform to TransformOperation for use with applyTransformsWithRollback.
 */
function convertToTransformOperation(transform: PresetTransform): TransformOperation | null {
  switch (transform.type) {
    case "import":
      if (transform.content && isImportStatement(transform.content)) {
        const importSpec = parseImportStatement(transform.content);
        if (importSpec) {
          return { type: "import", spec: importSpec };
        }
      }
      return null;

    case "dependency":
      if (transform.name && transform.version) {
        return {
          type: "dependency",
          spec: {
            name: transform.name,
            version: transform.version,
            dev: transform.dev,
          } as DependencySpec,
        };
      }
      return null;

    case "nestjs-module":
      if (transform.module) {
        return {
          type: "nestjs-module",
          spec: { module: transform.module } as NestJsModuleSpec,
        };
      }
      return null;

    case "provider-wrap":
      if (transform.provider) {
        return {
          type: "provider-wrap",
          spec: {
            provider: transform.provider,
            props: transform.props,
          } as ProviderWrapSpec,
        };
      }
      return null;

    case "layout-component":
      if (transform.component && transform.position) {
        return {
          type: "layout-component",
          spec: {
            component: transform.component,
            position: transform.position,
            props: transform.props,
            selfClosing: transform.selfClosing,
          } as LayoutComponentSpec,
        };
      }
      return null;

    default:
      return null;
  }
}

/**
 * Get human-readable description for a transform operation.
 */
function getTransformDescription(transform: PresetTransform): string {
  switch (transform.type) {
    case "import":
      return `Add import: ${transform.content}`;
    case "dependency":
      return `Add ${transform.dev ? "devDependency" : "dependency"}: ${transform.name}@${transform.version}`;
    case "nestjs-module":
      return `Add ${transform.module} to @Module imports`;
    case "provider-wrap":
      return `Wrap children with <${transform.provider}>`;
    case "layout-component":
      return `Add <${transform.component} /> at ${transform.position} in layout`;
    default:
      return JSON.stringify(transform);
  }
}

/**
 * Process AST-based transform operations with automatic rollback on failure.
 * This is the preferred method for code modifications as it understands AST structure.
 *
 * Uses applyTransformsWithRollback internally to ensure all changes are rolled back
 * if any transformation fails, preventing partial/broken state.
 *
 * @param transforms - Array of transform operations from preset manifest
 * @param presetTargetDir - Target directory for transforms
 * @param options - Transform options (including dryRun for preview mode)
 * @returns Stats and optional previews in dry-run mode
 */
async function processTransforms(
  transforms: PresetTransform[],
  presetTargetDir: string,
  options?: TransformOptions
): Promise<{ success: number; failed: number; skipped: number; previews?: TransformPreview[]; rolledBack?: boolean }> {
  const stats = { success: 0, failed: 0, skipped: 0 };
  const previews: TransformPreview[] = [];
  const isDryRun = options?.dryRun ?? false;

  // Convert PresetTransforms to TransformOperations
  const operations: Array<{ target: string; operation: TransformOperation }> = [];
  const transformMap = new Map<string, PresetTransform>();

  for (const transform of transforms) {
    const operation = convertToTransformOperation(transform);

    if (operation) {
      // For dependency type, target is always package.json
      const target = transform.type === "dependency" ? "package.json" : transform.target;
      operations.push({ target, operation });
      transformMap.set(target, transform);
    } else {
      // Invalid transform - record as failed
      stats.failed++;
      if (isDryRun) {
        previews.push({
          target: transform.target || "unknown",
          type: transform.type,
          description: getTransformDescription(transform),
          status: "error",
          error: "Invalid transform operation or missing required fields",
        });
      } else {
        consola.warn(`Invalid transform operation: ${JSON.stringify(transform)}`);
      }
    }
  }

  // If no valid operations, return early
  if (operations.length === 0) {
    return { ...stats, previews: isDryRun ? previews : undefined };
  }

  // Use applyTransformsWithRollback for atomic operations
  const batchResult = await applyTransformsWithRollback(operations, presetTargetDir, options);

  // Process results and build stats/previews
  for (const { target, result } of batchResult.results) {
    const transform = transformMap.get(target) || transforms.find(t =>
      (t.type === "dependency" ? "package.json" : t.target) === target
    );
    const transformType = transform?.type || "unknown";
    const description = transform ? getTransformDescription(transform) : `Unknown transform for ${target}`;

    if (result.success) {
      if (result.changed) {
        stats.success++;
        if (isDryRun) {
          previews.push({
            target,
            type: transformType,
            description,
            preview: result.preview,
            status: "will-apply",
          });
        }
      } else {
        stats.skipped++;
        if (isDryRun) {
          previews.push({
            target,
            type: transformType,
            description,
            status: "already-exists",
          });
        }
      }
    } else {
      stats.failed++;
      if (isDryRun) {
        previews.push({
          target,
          type: transformType,
          description,
          status: "error",
          error: result.error,
        });
      }
    }
  }

  // Report rollback if it occurred
  if (batchResult.rolledBack) {
    consola.warn("Transform operations rolled back due to failure");
  }

  return {
    ...stats,
    previews: isDryRun ? previews : undefined,
    rolledBack: batchResult.rolledBack,
  };
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
  target?: string;
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
    showError(Errors.fsNotFound(templateFilesDir, "directory"));
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

  try {
    // Copy template files with progress
    await withSpinner(
      `Adding ${templateName} template`,
      async () => {
        const replacements = {
          PROJECT_NAME: packageName.replace("@", "").replace("/", "-"),
        };

        await copyTemplateDir(templateFilesDir, targetDir, replacements, { overwrite: true });

        // Update package.json with correct name
        const pkgJsonPath = join(targetDir, "package.json");
        if (await fileExists(pkgJsonPath)) {
          const packageJson = await readJson<Record<string, unknown>>(pkgJsonPath);
          packageJson.name = packageName;
          await writeJson(pkgJsonPath, packageJson);
        }
      },
      { successText: `Added ${templateName} template`, showTime: true }
    );

    consola.info(`  Location: ${targetDir}`);
    consola.info(`  Package: ${packageName}`);
    consola.info("");
    consola.info("Next steps:");
    consola.info("  1. Run your package manager to install dependencies");
    consola.info(`  2. cd ${targetDir} && pnpm dev`);
  } catch (error) {
    showError(Errors.unknown(error));
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
    target: {
      type: "string",
      description: "Target variant for preset (e.g., nextjs, nestjs)",
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
      showError(Errors.projectNotInitialized(projectDir));
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
        showError(Errors.presetNotFound(args.preset, Object.keys(PRESETS)));
        process.exit(1);
      }
    }
    if (!presetName) {
      // Interactive mode: category → preset → target
      consola.info("Interactive mode: Select category and preset\n");

      // Step 1: Select category
      const selectedCategory = await promptCategory();

      // Step 2: Select preset within category
      const selectedPreset = await promptPreset(selectedCategory);

      presetName = resolvePresetName(selectedPreset) as PresetName;
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
            showError(Errors.fsNotFound(join(projectDir, "apps", args.app), "directory"));
            process.exit(1);
          }
        }
      } else {
        // Determine relevant apps based on preset type
        let relevantApps: string[];

        if (isBackendPreset) {
          relevantApps = appEntries.filter(([_, appConfig]) => {
            const module = appConfig?.module;
            return module?.includes("nest") || module?.includes("api");
          }).map(([key]) => key);
        } else if (isFrontendPreset) {
          relevantApps = appEntries.filter(([_, appConfig]) => {
            const module = appConfig?.module;
            return module?.includes("next") || module?.includes("web");
          }).map(([key]) => key);
        } else {
          // Universal presets (validation, linting, etc.) - all apps are relevant
          relevantApps = appEntries.map(([key]) => key);
        }

        if (relevantApps.length === 1) {
          const dir = getAppDir(relevantApps[0]);
          if (dir) {
            targetAppDir = dir;
            targetAppName = relevantApps[0];
            consola.info(`Auto-selected app: ${targetAppName}`);
          }
        } else if (relevantApps.length > 1) {
          // Always prompt for app selection in monorepo with multiple apps
          const { selectedApp } = await prompts({
            type: "select",
            name: "selectedApp",
            message: `Select target app for ${presetName}:`,
            choices: relevantApps.map((app) => {
              const appConfig = existingConfig.apps[app];
              const moduleConfig = APP_MODULES[appConfig?.module || ""];
              return {
                title: `${app} (${appConfig?.module || moduleConfig?.targetDir || app})`,
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

    try {
      // Check preset directory
      const presetDir = join(PRESETS_DIR, presetInfo.category, presetName);

      if (!(await dirExists(presetDir))) {
        showError(Errors.presetNotFound(presetName, Object.keys(PRESETS)));
        process.exit(1);
      }

      // Read preset manifest
      const manifestPath = join(presetDir, "manifest.json");
      if (!(await fileExists(manifestPath))) {
        showError(Errors.configInvalid(manifestPath, "missing manifest.json"));
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
            showError(Errors.presetConflict(presetName, [conflict], "Cannot install conflicting presets"));
            process.exit(1);
          }
        }
      }

      // ======================================================================
      // Manifest with targets/variants (dialect-based)
      // ======================================================================
      const targetConfigs = manifestRaw.targets || manifestRaw.variants;
      if (!targetConfigs) {
        showError(Errors.presetNoTargets(presetName));
        process.exit(1);
      }
      {
        const targetNames = Object.keys(targetConfigs);

        // Select target (dialect)
        let selectedTarget: string | undefined;
        let targetSource: "detect" | "manual" | "override" | "default" | "saved" | "app-module" = "default";
        let targetReasonDetail: string | undefined;

        // 1. CLI argument override (--target or --dialect)
        const cliTarget = args.target || args.dialect;
        if (cliTarget && targetNames.includes(cliTarget)) {
          selectedTarget = cliTarget;
          targetSource = "override";
          consola.info(`Using specified target: ${selectedTarget}`);
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
          const targets = targetNames.map((name) => ({
            name,
            description: targetConfigs[name].description,
            dialect: targetConfigs[name].dialect,
          }));

          selectedTarget = await promptTarget(targets);
          targetSource = "manual";
        }

        // Safety check
        if (!selectedTarget) {
          showError(Errors.presetNoTargets(presetName));
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
          const transformCount = (targetConfig.transform || []).length;
          const envCount = (manifestRaw.env || []).length + (targetConfig.env || []).length;

          // Show basic plan info
          consola.box(
            `Plan: ${presetName} (${selectedTarget})\n` +
              `Target dir: ${presetTargetDir}\n` +
              `Dependencies: ${depCount}\n` +
              `DevDependencies: ${devDepCount}\n` +
              `Scripts: ${scriptCount}\n` +
              `Files: ${fileCount}\n` +
              `Transforms: ${transformCount}\n` +
              `Env vars: ${envCount}`
          );

          // Show transform previews if any transforms exist
          if (targetConfig.transform && targetConfig.transform.length > 0) {
            consola.info("\nTransform operations (dry-run preview):");
            const transformResult = await processTransforms(
              targetConfig.transform.map((t) => ({
                ...t,
                content: t.content?.replace(/{{PROJECT_NAME}}/g, existingConfig?.base || "project"),
              })),
              presetTargetDir,
              { dryRun: true }
            );

            if (transformResult.previews) {
              for (const preview of transformResult.previews) {
                const statusIcon = preview.status === "will-apply" ? "→" :
                  preview.status === "already-exists" ? "○" : "✗";
                const statusColor = preview.status === "will-apply" ? "green" :
                  preview.status === "already-exists" ? "gray" : "red";

                consola.log(`  ${statusIcon} [${preview.type}] ${preview.target}`);
                consola.log(`    ${preview.description}`);

                if (preview.status === "error" && preview.error) {
                  consola.log(`    Error: ${preview.error}`);
                }
              }

              consola.log("");
              consola.log(`  Summary: ${transformResult.success} will apply, ${transformResult.skipped} already exist, ${transformResult.failed} errors`);
            }
          }

          // Show dependencies that will be added
          const allDeps = {
            ...(commonConfig.dependencies || {}),
            ...(targetConfig.dependencies || {}),
          };
          const allDevDeps = {
            ...(commonConfig.devDependencies || {}),
            ...(targetConfig.devDependencies || {}),
          };

          if (Object.keys(allDeps).length > 0 || Object.keys(allDevDeps).length > 0) {
            consola.info("\nDependencies to add:");
            for (const [name, version] of Object.entries(allDeps)) {
              consola.log(`  + ${name}@${version}`);
            }
            for (const [name, version] of Object.entries(allDevDeps)) {
              consola.log(`  + ${name}@${version} (dev)`);
            }
          }

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

        // Process transform operations (AST-based)
        if (targetConfig.transform && targetConfig.transform.length > 0) {
          const transformStats = await processTransforms(
            targetConfig.transform.map((t) => ({
              ...t,
              // Replace template variables in content
              content: t.content?.replace(/{{PROJECT_NAME}}/g, existingConfig?.base || "project"),
            })),
            presetTargetDir
          );

          if (transformStats.success > 0) {
            consola.success(`Applied ${transformStats.success} transform(s)`);
          }
          if (transformStats.failed > 0) {
            consola.warn(`${transformStats.failed} transform(s) failed`);
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
      showError(Errors.unknown(error));
      process.exit(1);
    }
  },
});

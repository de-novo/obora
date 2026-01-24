import { consola } from "consola";
import { promises as fs } from "node:fs";
import { dirname, join, relative, normalize } from "pathe";
import {
  APP_MODULES,
  PRESETS_DIR,
  isForbiddenPresetFilePath,
  resolvePresetName,
  TEMPLATES_DIR,
  type AppModuleName,
  type BaseName,
  type Category,
} from "./constants";
import {
  dirExists,
  ensureDir,
  fileExists,
  readJson,
  writeJson,
} from "./fs";

export interface AppModuleInstance {
  name: string;
  module: AppModuleName;
  targetDir: string; // relative to project root
}

export interface AssemblyOptions {
  base: BaseName;
  projectName: string;
  targetDir: string;
  apps: AppModuleInstance[];
  presets: Record<string, { preset: string; version: string } | null>;
  packageManager: "pnpm" | "npm" | "yarn" | "bun";
  presetTargets?: Record<string, string>;
}

interface PresetManifest {
  name: string;
  category: string;
  description: string;
  scripts?: Record<string, string>;
  env?: Array<{ key: string; description: string; example?: string }>;
  postInstall?: string[];
  common?: PresetTargetConfig;
  targets?: Record<string, PresetTargetConfig>;
  variants?: Record<string, PresetTargetConfig>;
}

interface PresetTargetConfig {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
  remove?: string[];
  env?: Array<{ key: string; description: string; example?: string }>;
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

/**
 * Assembles a project from base + apps + presets
 */
export async function assembleProject(
  options: AssemblyOptions
): Promise<{ postInstall: string[] }> {
  const { base, projectName, targetDir, apps, presets, packageManager, presetTargets } = options;
  const postInstallSteps: string[] = [];

  const replacements: Record<string, string> = {
    PROJECT_NAME: projectName,
    PACKAGE_MANAGER: packageManager,
  };

  const isSingleBase = base === "single";

  consola.info(`Assembling project: ${projectName}`);
  consola.info(`  Target: ${targetDir}`);

  // 1. Copy base template
  const baseDir = join(TEMPLATES_DIR, "base", base, "files");
  consola.info(`Copying base template: ${base}`);
  await copyTemplateWithReplacements(baseDir, targetDir, replacements);

  // Remove .gitkeep files
  await removeGitkeepFiles(targetDir);

  // 2. Copy each app module
  // For single base, save the base package.json before app overwrites it
  let basePackageJson: Record<string, unknown> | null = null;
  if (isSingleBase) {
    const rootPackagePath = join(targetDir, "package.json");
    if (await fileExists(rootPackagePath)) {
      basePackageJson = await readJson<Record<string, unknown>>(rootPackagePath);
    }
  }

  for (const appInstance of apps) {
    const appConfig = APP_MODULES[appInstance.module];
    if (!appConfig) continue;

    const appSourceDir = join(TEMPLATES_DIR, "apps", appInstance.module, "files");
    // For single base, copy app files directly to root
    const appTargetDir = isSingleBase
      ? targetDir
      : join(targetDir, appInstance.targetDir);

    consola.info(
      `Adding app module: ${appInstance.module}${isSingleBase ? "" : ` -> ${appInstance.targetDir}`}`
    );
    await copyTemplateWithReplacements(appSourceDir, appTargetDir, replacements);
  }

  // For single base, merge base package.json with app's package.json
  if (isSingleBase && basePackageJson) {
    await mergePackageJsonForSingle(targetDir, basePackageJson, replacements);
  }

  // 3. Apply each preset
  for (const [category, selection] of Object.entries(presets)) {
    if (!selection) continue;

    const presetName = selection.preset;
    const postInstall = await applyPreset(
      category as Category,
      presetName,
      targetDir,
      apps,
      replacements,
      isSingleBase,
      presetTargets?.[presetName]
    );
    if (postInstall.length > 0) {
      postInstallSteps.push(...postInstall);
    }
  }

  // 4. Update root package.json based on package manager
  await updatePackageManager(targetDir, packageManager);

  consola.success(`Project assembled successfully!`);
  return { postInstall: dedupeLines(postInstallSteps) };
}

/**
 * Merges base and app package.json for single base projects
 */
async function mergePackageJsonForSingle(
  targetDir: string,
  basePackageJson: Record<string, unknown>,
  replacements: Record<string, string>
): Promise<void> {
  const rootPackagePath = join(targetDir, "package.json");

  if (!(await fileExists(rootPackagePath))) return;

  // App's package.json now at root (overwrote base's)
  const appPkg = await readJson<Record<string, unknown>>(rootPackagePath);

  // Merged result: base fields + app fields
  const merged: Record<string, unknown> = {
    name: replacements.PROJECT_NAME || basePackageJson.name,
    version: appPkg.version || basePackageJson.version || "0.0.1",
    private: true,
    type: appPkg.type || "module",
  };

  // Merge scripts (app takes precedence)
  merged.scripts = {
    ...(basePackageJson.scripts as Record<string, string> || {}),
    ...(appPkg.scripts as Record<string, string> || {}),
  };

  // Merge dependencies
  merged.dependencies = {
    ...(basePackageJson.dependencies as Record<string, string> || {}),
    ...(appPkg.dependencies as Record<string, string> || {}),
  };

  // Merge devDependencies
  merged.devDependencies = {
    ...(basePackageJson.devDependencies as Record<string, string> || {}),
    ...(appPkg.devDependencies as Record<string, string> || {}),
  };

  await writeJson(rootPackagePath, merged);
}

/**
 * Applies a single preset to the target directory
 */
async function applyPreset(
  category: Category,
  presetName: string,
  targetDir: string,
  apps: AppModuleInstance[],
  replacements: Record<string, string>,
  isSingleBase = false,
  forcedTargetKey?: string
): Promise<string[]> {
  const postInstallSteps: string[] = [];
  // Preset path: presets/{category}/{presetName}
  let resolvedPresetName = presetName;
  let presetDir = join(PRESETS_DIR, category, resolvedPresetName);
  let manifestPath = join(presetDir, "manifest.json");

  // Read preset manifest
  let manifest: PresetManifest;
  try {
    manifest = await readJson<PresetManifest>(manifestPath);
  } catch {
    const alias = resolvePresetName(presetName);
    if (alias === presetName) {
    consola.warn(`No manifest found for preset: ${category}/${presetName}`);
      return postInstallSteps;
    }
    resolvedPresetName = alias;
    presetDir = join(PRESETS_DIR, category, resolvedPresetName);
    manifestPath = join(presetDir, "manifest.json");
    try {
      manifest = await readJson<PresetManifest>(manifestPath);
    } catch {
      consola.warn(`No manifest found for preset: ${category}/${resolvedPresetName}`);
      return postInstallSteps;
    }
  }

  consola.info(`Applying preset: ${manifest.name}`);

  const filesDir = join(presetDir, "files");

  return applyPresetTargets({
    manifest,
    presetDir,
    filesDir,
    projectDir: targetDir,
    apps,
    replacements,
    isSingleBase,
    forcedTargetKey,
  });
}

async function applyPresetTargets(params: {
  manifest: PresetManifest;
  presetDir: string;
  filesDir: string;
  projectDir: string;
  apps: AppModuleInstance[];
  replacements: Record<string, string>;
  isSingleBase: boolean;
  forcedTargetKey?: string;
}): Promise<string[]> {
  const {
    manifest,
    presetDir,
    filesDir,
    projectDir,
    apps,
    replacements,
    isSingleBase,
    forcedTargetKey,
  } = params;
  const postInstallSteps: string[] = [];

  const targetConfigs = manifest.targets || manifest.variants || {};
  const targetKeys = Object.keys(targetConfigs);

  if (targetKeys.length === 0) {
    consola.warn(`Preset ${manifest.name} has no targets. Skipping.`);
    return postInstallSteps;
  }

  const useDetect = Object.values(targetConfigs).some((cfg) => hasDetectRule(cfg.detect));
  const targetMappings = await resolveTargetMappings(
    apps,
    targetConfigs,
    projectDir,
    isSingleBase,
    useDetect,
    forcedTargetKey
  );
  if (targetMappings.length === 0) {
    consola.warn(`No compatible targets found for preset: ${manifest.name}`);
    return postInstallSteps;
  }

  for (const { targetKey, targetDir } of targetMappings) {
    const specific = targetConfigs[targetKey];
    const merged = mergeTargetConfig(manifest.common, specific);

    if (merged.remove && merged.remove.length > 0) {
      for (const removePath of merged.remove) {
        await fs.rm(join(targetDir, removePath), { recursive: true, force: true });
      }
    }

    if (merged.files && merged.files.length > 0) {
      for (const entry of merged.files) {
        const srcPath = join(filesDir, entry);
        const isRootEntry = entry === targetKey ||
          (entry === "nextjs" && targetKey.startsWith("nextjs")) ||
          (entry === "nestjs" && targetKey.startsWith("nestjs"));
        const destPath = isRootEntry ? targetDir : join(targetDir, entry);
        const srcStat = await fs.stat(srcPath).catch(() => null);
        if (srcStat) {
          await copyTemplateWithReplacements(srcPath, destPath, replacements, {
            overwrite: false,
            filter: (relPath, kind) =>
              kind === "file" ? !isForbiddenPresetFilePath(relPath) : true,
          });
        }
      }
    }

    if (merged.dependencies || merged.devDependencies) {
      await mergeDependencyObjects(targetDir, merged.dependencies, merged.devDependencies, replacements);
    }

    const allScripts = {
      ...(manifest.scripts || {}),
      ...(merged.scripts || {}),
    };
    if (Object.keys(allScripts).length > 0) {
      await mergeScripts(targetDir, allScripts, replacements);
    }

    const allEnv = [
      ...(manifest.env || []),
      ...(merged.env || []),
    ];
    if (allEnv.length > 0) {
      await addEnvVariables(projectDir, allEnv);
    }

    if (merged.postInstall && merged.postInstall.length > 0) {
      postInstallSteps.push(...merged.postInstall);
    }
  }

  if (manifest.postInstall && manifest.postInstall.length > 0) {
    postInstallSteps.push(...manifest.postInstall);
  }

  return postInstallSteps;
}

async function resolveTargetMappings(
  apps: AppModuleInstance[],
  targetConfigs: Record<string, PresetTargetConfig>,
  projectDir: string,
  isSingleBase: boolean,
  useDetect: boolean,
  forcedTargetKey?: string
): Promise<Array<{ targetKey: string; targetDir: string }>> {
  const mappings: Array<{ targetKey: string; targetDir: string }> = [];
  const targetKeys = Object.keys(targetConfigs);

  if (forcedTargetKey && targetKeys.includes(forcedTargetKey)) {
    if (isSingleBase) {
      return [{ targetKey: forcedTargetKey, targetDir: projectDir }];
    }
    for (const appInstance of apps) {
      if (!isTargetKeyForApp(appInstance.module, forcedTargetKey)) {
        continue;
      }
      mappings.push({ targetKey: forcedTargetKey, targetDir: join(projectDir, appInstance.targetDir) });
    }
    if (mappings.length > 0) {
      return mappings;
    }
  }

  if (targetKeys.includes("root")) {
    mappings.push({ targetKey: "root", targetDir: projectDir });
  }

  if (isSingleBase) {
    if (apps.length > 0) {
      const primaryApp = apps[0].module;
      const detected = useDetect ? await resolveTargetKeyByDetect(targetConfigs, projectDir) : null;
      const targetKey = detected || resolveTargetKeyForApp(primaryApp, targetKeys);
      if (targetKey) {
        return [{ targetKey, targetDir: projectDir }];
      }
    }
    if (targetKeys.length === 1) {
      return [{ targetKey: targetKeys[0], targetDir: projectDir }];
    }
    return mappings;
  }

  for (const appInstance of apps) {
    const appDir = join(projectDir, appInstance.targetDir);
    const detected = useDetect ? await resolveTargetKeyByDetect(targetConfigs, appDir) : null;
    const targetKey = detected || resolveTargetKeyForApp(appInstance.module, targetKeys);
    if (!targetKey) continue;
    mappings.push({ targetKey, targetDir: appDir });
  }

  if (mappings.length === 0 && targetKeys.length === 1) {
    const fallbackKey = targetKeys[0];
    if (apps.length === 0) {
      mappings.push({ targetKey: fallbackKey, targetDir: projectDir });
    } else {
      for (const appInstance of apps) {
        mappings.push({ targetKey: fallbackKey, targetDir: join(projectDir, appInstance.targetDir) });
      }
    }
  }

  return mappings;
}

function isTargetKeyForApp(appName: AppModuleName, targetKey: string): boolean {
  if (appName === "nextjs-web") {
    return targetKey.startsWith("nextjs");
  }
  if (appName === "nestjs-api") {
    return targetKey.startsWith("nestjs") || targetKey === "server";
  }
  return true;
}

async function resolveTargetKeyByDetect(
  targetConfigs: Record<string, PresetTargetConfig>,
  targetDir: string
): Promise<string | null> {
  const packageJsonPath = join(targetDir, "package.json");
  if (!(await fileExists(packageJsonPath))) {
    return null;
  }
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } | null = null;
  try {
    pkg = await readJson(packageJsonPath);
  } catch {
    return null;
  }
  if (!pkg) return null;
  const deps = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ]);
  const depVersions = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
  };
  const nodeEngine = (pkg as { engines?: { node?: string } }).engines?.node;
  const runtimeFlags = await detectRuntimeFlags(targetDir);
  for (const [key, config] of Object.entries(targetConfigs)) {
    if (!hasDetectRule(config.detect)) continue;
    if (matchesDetectRule(
      config.detect as string[] | DetectRule,
      deps,
      depVersions,
      nodeEngine,
      runtimeFlags
    )) {
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

function resolveTargetKeyForApp(appName: AppModuleName, targetKeys: string[]): string | null {
  if (appName === "nextjs-web") {
    if (targetKeys.includes("nextjs")) return "nextjs";
    if (targetKeys.includes("sqlite")) return "sqlite";
  }
  if (appName === "nestjs-api") {
    if (targetKeys.includes("nestjs")) return "nestjs";
    if (targetKeys.includes("server")) return "server";
    if (targetKeys.includes("postgres")) return "postgres";
  }
  return null;
}

function mergeTargetConfig(
  common: PresetTargetConfig | undefined,
  specific: PresetTargetConfig | undefined
): PresetTargetConfig {
  return {
    dependencies: { ...(common?.dependencies || {}), ...(specific?.dependencies || {}) },
    devDependencies: { ...(common?.devDependencies || {}), ...(specific?.devDependencies || {}) },
    scripts: { ...(common?.scripts || {}), ...(specific?.scripts || {}) },
    files: [...(common?.files || []), ...(specific?.files || [])],
    remove: [...(common?.remove || []), ...(specific?.remove || [])],
    env: [...(common?.env || []), ...(specific?.env || [])],
    postInstall: [...(common?.postInstall || []), ...(specific?.postInstall || [])],
  };
}

/**
 * Copies files/directories with placeholder replacements
 */
async function copyTemplateWithReplacements(
  src: string,
  dest: string,
  replacements: Record<string, string>,
  options?: {
    overwrite?: boolean;
    logSkipped?: boolean;
    filter?: (relativePath: string, kind: "file" | "dir") => boolean;
    root?: string;
  }
): Promise<void> {
  const overwrite = options?.overwrite ?? true;
  const logSkipped = options?.logSkipped ?? true;
  const root = options?.root ?? src;
  const stat = await fs.stat(src).catch(() => null);

  if (!stat) {
    return;
  }

  if (stat.isDirectory()) {
    const relDir = normalize(relative(root, src));
    if (options?.filter && !options.filter(relDir, "dir")) {
      if (logSkipped) {
        consola.warn(`Skipped directory ${dest} by filter.`);
      }
      return;
    }
    const destStat = await fs.stat(dest).catch(() => null);
    if (destStat && !destStat.isDirectory()) {
      if (logSkipped) {
        consola.warn(`Skipped directory ${dest} (file already exists).`);
      }
      return;
    }
    const ignoredDirs = new Set(["node_modules", ".git", ".pnpm", ".turbo", "dist", "build"]);
    if (ignoredDirs.has(src.split("/").pop() || "")) {
      return;
    }
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (ignoredDirs.has(entry.name)) {
        continue;
      }
      await copyTemplateWithReplacements(
        join(src, entry.name),
        join(dest, entry.name),
        replacements,
        { ...options, root }
      );
    }
  } else {
    await ensureDir(dirname(dest));

    // Check if binary file
    const ext = src.split(".").pop()?.toLowerCase();
    const binaryExtensions = ["png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot"];

    const relFile = normalize(relative(root, src));
    if (options?.filter && !options.filter(relFile, "file")) {
      if (logSkipped) {
        consola.warn(`Skipped file ${dest} by filter.`);
      }
      return;
    }

    const destStat = await fs.stat(dest).catch(() => null);
    if (destStat) {
      if (destStat.isDirectory()) {
        if (logSkipped) {
          consola.warn(`Skipped file ${dest} (directory already exists).`);
        }
        return;
      }
      if (!overwrite) {
        if (logSkipped) {
          consola.warn(`Skipped existing file ${dest}.`);
        }
        return;
      }
    }

    if (binaryExtensions.includes(ext || "")) {
      await fs.copyFile(src, dest);
    } else {
      let content = await fs.readFile(src, "utf-8");

      // Apply replacements
      for (const [key, value] of Object.entries(replacements)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
      }

      await fs.writeFile(dest, content, "utf-8");
    }
  }
}

/**
 * Removes .gitkeep files from target directory
 */
async function removeGitkeepFiles(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await removeGitkeepFiles(fullPath);
    } else if (entry.name === ".gitkeep") {
      await fs.rm(fullPath);
    }
  }
}

/**
 * Updates package.json with correct package manager settings
 */
async function updatePackageManager(
  targetDir: string,
  packageManager: "pnpm" | "npm" | "yarn" | "bun"
): Promise<void> {
  const packageJsonPath = join(targetDir, "package.json");

  if (!(await fileExists(packageJsonPath))) return;

  const pkg = await readJson<Record<string, unknown>>(packageJsonPath);

  // Set packageManager field for pnpm/yarn
  if (packageManager === "pnpm") {
    pkg.packageManager = "pnpm@9.15.0";
  } else if (packageManager === "yarn") {
    pkg.packageManager = "yarn@4.0.0";
  } else if (packageManager === "bun") {
    // Bun doesn't use packageManager field
    delete pkg.packageManager;
  } else {
    delete pkg.packageManager;
  }

  await writeJson(packageJsonPath, pkg);
}

// (dependencies.json removed; dependencies are defined in manifest.common/targets)

async function mergeDependencyObjects(
  targetDir: string,
  dependencies?: Record<string, string>,
  devDependencies?: Record<string, string>,
  replacements?: Record<string, string>
): Promise<void> {
  const targetPackagePath = join(targetDir, "package.json");
  if (!(await fileExists(targetPackagePath))) return;

  const targetPkg = await readJson<Record<string, unknown>>(targetPackagePath);

  if (dependencies) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(dependencies)) {
      normalized[key] = replacements ? applyReplacements(value, replacements) : value;
    }
    targetPkg.dependencies = {
      ...(targetPkg.dependencies as Record<string, string> || {}),
      ...normalized,
    };
  }

  if (devDependencies) {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(devDependencies)) {
      normalized[key] = replacements ? applyReplacements(value, replacements) : value;
    }
    targetPkg.devDependencies = {
      ...(targetPkg.devDependencies as Record<string, string> || {}),
      ...normalized,
    };
  }

  await writeJson(targetPackagePath, targetPkg);
}

/**
 * Merge scripts into package.json
 */
async function mergeScripts(
  targetDir: string,
  scripts: Record<string, string>,
  replacements: Record<string, string>
): Promise<void> {
  const targetPackagePath = join(targetDir, "package.json");

  if (!(await fileExists(targetPackagePath))) return;

  const targetPkg = await readJson<Record<string, unknown>>(targetPackagePath);
  const normalizedScripts: Record<string, string> = {};

  for (const [key, value] of Object.entries(scripts)) {
    normalizedScripts[key] = applyReplacements(value, replacements);
  }

  targetPkg.scripts = {
    ...(targetPkg.scripts as Record<string, string> || {}),
    ...normalizedScripts,
  };

  await writeJson(targetPackagePath, targetPkg);
}

/**
 * Merge JSON files from preset into target (deep merge)
 */
async function mergeJsonFile(
  srcPath: string,
  destPath: string,
  replacements: Record<string, string>
): Promise<void> {
  let srcContent = await fs.readFile(srcPath, "utf-8");
  srcContent = applyReplacements(srcContent, replacements);

  const srcJson = JSON.parse(srcContent) as Record<string, unknown>;
  let destJson: Record<string, unknown> = {};

  if (await fileExists(destPath)) {
    destJson = await readJson<Record<string, unknown>>(destPath);
  }

  const merged = deepMerge(destJson, srcJson);
  await writeJson(destPath, merged);
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function applyReplacements(
  input: string,
  replacements: Record<string, string>
): string {
  let output = input;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return output;
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

/**
 * Adds environment variables to .env.example
 */
async function addEnvVariables(
  targetDir: string,
  envVars: Array<{ key: string; description: string; example?: string }>
): Promise<void> {
  const envPath = join(targetDir, ".env.example");

  let content = "";
  if (await fileExists(envPath)) {
    content = await fs.readFile(envPath, "utf-8");
  }

  // Find the @obora:env marker or append to end
  const marker = "# @obora:env";
  const envLines = envVars.map((v) => {
    const example = v.example || "";
    return `# ${v.description}\n${v.key}=${example}`;
  }).join("\n\n");

  if (content.includes(marker)) {
    content = content.replace(marker, `${envLines}\n\n${marker}`);
  } else {
    content = content.trim() + "\n\n" + envLines + "\n";
  }

  await fs.writeFile(envPath, content, "utf-8");
}


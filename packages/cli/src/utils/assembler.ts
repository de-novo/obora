import { promises as fs } from "node:fs";
import { join, dirname, relative } from "pathe";
import { consola } from "consola";
import {
  readJson,
  writeJson,
  fileExists,
  ensureDir,
} from "./fs";
import {
  TEMPLATES_DIR,
  PRESETS_DIR,
  APP_MODULES,
  type BaseName,
  type AppModuleName,
  type Category,
} from "./constants";

export interface AssemblyOptions {
  base: BaseName;
  projectName: string;
  targetDir: string;
  apps: AppModuleName[];
  presets: Record<string, { preset: string; version: string } | null>;
  packageManager: "pnpm" | "npm" | "yarn" | "bun";
}

interface PresetManifest {
  name: string;
  category: string;
  description: string;
  operations: {
    replace: string[];
    merge: string[];
    add: string[];
    remove: string[];
    inject: Array<{ file: string; marker: string; content: string }>;
  };
  scripts?: Record<string, string>;
  env?: Array<{ key: string; description: string; example?: string }>;
  targetApps?: string[]; // Which app modules this preset can be applied to
}

/**
 * Assembles a project from base + apps + presets
 */
export async function assembleProject(options: AssemblyOptions): Promise<void> {
  const { base, projectName, targetDir, apps, presets, packageManager } = options;

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

  for (const appName of apps) {
    const appConfig = APP_MODULES[appName];
    if (!appConfig) continue;

    const appSourceDir = join(TEMPLATES_DIR, "apps", appName, "files");
    // For single base, copy app files directly to root
    const appTargetDir = isSingleBase ? targetDir : join(targetDir, appConfig.targetDir);

    consola.info(`Adding app module: ${appName}${isSingleBase ? "" : ` -> ${appConfig.targetDir}`}`);
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
    await applyPreset(category as Category, presetName, targetDir, apps, replacements, isSingleBase);
  }

  // 4. Process all injection markers
  await processMarkers(targetDir);

  // 5. Update root package.json based on package manager
  await updatePackageManager(targetDir, packageManager);

  consola.success(`Project assembled successfully!`);
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
  apps: AppModuleName[],
  replacements: Record<string, string>,
  isSingleBase = false
): Promise<void> {
  // Preset path: presets/{category}/{presetName}
  const presetDir = join(PRESETS_DIR, category, presetName);
  const manifestPath = join(presetDir, "manifest.json");

  // Read preset manifest
  let manifest: PresetManifest;
  try {
    manifest = await readJson<PresetManifest>(manifestPath);
  } catch {
    consola.warn(`No manifest found for preset: ${category}/${presetName}`);
    return;
  }

  consola.info(`Applying preset: ${manifest.name}`);

  const filesDir = join(presetDir, "files");

  // Determine target directories based on which apps need this preset
  // For single base, always apply to project root
  const targetDirs = isSingleBase ? [targetDir] : getPresetTargetDirs(category, apps, targetDir, manifest.targetApps);

  // Execute operations
  const ops = manifest.operations;

  // Add files to each relevant target
  if (ops.add && ops.add.length > 0) {
    for (const appTargetDir of targetDirs) {
      for (const addPath of ops.add) {
        const srcPath = join(filesDir, addPath);
        const destPath = join(appTargetDir, addPath);

        const srcStat = await fs.stat(srcPath).catch(() => null);
        if (srcStat) {
          await copyTemplateWithReplacements(srcPath, destPath, replacements);
        }
      }
    }
  }

  // Replace files/directories
  if (ops.replace && ops.replace.length > 0) {
    for (const appTargetDir of targetDirs) {
      for (const replacePath of ops.replace) {
        const srcPath = join(filesDir, replacePath);
        const destPath = join(appTargetDir, replacePath);

        // Remove existing
        await fs.rm(destPath, { recursive: true, force: true });

        // Copy new
        await copyTemplateWithReplacements(srcPath, destPath, replacements);
      }
    }
  }

  // Store inject operations for later processing
  if (ops.inject && ops.inject.length > 0) {
    const injectionsPath = join(targetDir, ".obora-injections.json");
    let existingInjections: Array<{ file: string; marker: string; content: string }> = [];

    try {
      existingInjections = await readJson<typeof existingInjections>(injectionsPath);
    } catch {
      // No existing injections
    }

    // Adjust file paths based on target directories
    const adjustedInjections: typeof existingInjections = [];
    for (const appTargetDir of targetDirs) {
      const relativeDir = relative(targetDir, appTargetDir);
      for (const injection of ops.inject) {
        adjustedInjections.push({
          ...injection,
          file: relativeDir ? join(relativeDir, injection.file) : injection.file,
        });
      }
    }

    const allInjections = [...existingInjections, ...adjustedInjections];
    await writeJson(injectionsPath, allInjections);
  }

  // Merge dependencies into app package.json files
  const dependenciesPath = join(presetDir, "dependencies.json");
  if (await fileExists(dependenciesPath)) {
    for (const appTargetDir of targetDirs) {
      await mergeDependencies(appTargetDir, dependenciesPath, replacements);
    }
  }

  // Add environment variables
  if (manifest.env && manifest.env.length > 0) {
    await addEnvVariables(targetDir, manifest.env);
  }
}

/**
 * Get target directories for a preset based on category and selected apps
 */
function getPresetTargetDirs(
  category: Category,
  apps: AppModuleName[],
  projectDir: string,
  targetApps?: string[]
): string[] {
  // Root-level categories always apply to project root
  const rootLevelCategories: Category[] = ["linting"];
  if (rootLevelCategories.includes(category)) {
    return [projectDir];
  }

  const dirs: string[] = [];

  for (const appName of apps) {
    const appConfig = APP_MODULES[appName];
    if (!appConfig) continue;

    // Check if this app supports the preset category
    if (!appConfig.slots.includes(category)) {
      continue;
    }

    // If preset has targetApps, check if this app is in the list
    if (targetApps && targetApps.length > 0 && !targetApps.includes(appName)) {
      continue;
    }

    dirs.push(join(projectDir, appConfig.targetDir));
  }

  // If no specific app targets, apply to project root
  if (dirs.length === 0) {
    dirs.push(projectDir);
  }

  return dirs;
}

/**
 * Copies files/directories with placeholder replacements
 */
async function copyTemplateWithReplacements(
  src: string,
  dest: string,
  replacements: Record<string, string>
): Promise<void> {
  const stat = await fs.stat(src).catch(() => null);

  if (!stat) {
    return;
  }

  if (stat.isDirectory()) {
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      await copyTemplateWithReplacements(
        join(src, entry.name),
        join(dest, entry.name),
        replacements
      );
    }
  } else {
    await ensureDir(dirname(dest));

    // Check if binary file
    const ext = src.split(".").pop()?.toLowerCase();
    const binaryExtensions = ["png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot"];

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

/**
 * Merges dependencies from a preset into the target package.json
 */
async function mergeDependencies(
  targetDir: string,
  dependenciesPath: string,
  replacements: Record<string, string>
): Promise<void> {
  const targetPackagePath = join(targetDir, "package.json");

  if (!(await fileExists(targetPackagePath))) return;

  const targetPkg = await readJson<Record<string, unknown>>(targetPackagePath);
  let depsContent = await fs.readFile(dependenciesPath, "utf-8");

  // Apply replacements
  for (const [key, value] of Object.entries(replacements)) {
    depsContent = depsContent.replace(
      new RegExp(`\\{\\{${key}\\}\\}`, "g"),
      value
    );
  }

  const deps = JSON.parse(depsContent) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    scripts?: Record<string, string>;
  };

  // Merge dependencies
  if (deps.dependencies) {
    targetPkg.dependencies = {
      ...(targetPkg.dependencies as Record<string, string> || {}),
      ...deps.dependencies,
    };
  }

  if (deps.devDependencies) {
    targetPkg.devDependencies = {
      ...(targetPkg.devDependencies as Record<string, string> || {}),
      ...deps.devDependencies,
    };
  }

  if (deps.scripts) {
    targetPkg.scripts = {
      ...(targetPkg.scripts as Record<string, string> || {}),
      ...deps.scripts,
    };
  }

  await writeJson(targetPackagePath, targetPkg);
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

/**
 * Processes all @obora:* markers in target files
 */
async function processMarkers(targetDir: string): Promise<void> {
  const injectionsPath = join(targetDir, ".obora-injections.json");

  if (!(await fileExists(injectionsPath))) {
    return;
  }

  const injections = await readJson<
    Array<{ file: string; marker: string; content: string }>
  >(injectionsPath);

  // Group injections by file
  const byFile = new Map<string, Array<{ marker: string; content: string }>>();

  for (const injection of injections) {
    const existing = byFile.get(injection.file) || [];
    existing.push({ marker: injection.marker, content: injection.content });
    byFile.set(injection.file, existing);
  }

  // Process each file
  for (const [filePath, fileInjections] of byFile) {
    const fullPath = join(targetDir, filePath);

    if (!(await fileExists(fullPath))) {
      consola.warn(`Injection target not found: ${filePath}`);
      continue;
    }

    let content = await fs.readFile(fullPath, "utf-8");

    for (const { marker, content: injectContent } of fileInjections) {
      const markerPattern = new RegExp(`([ \\t]*)\\/\\/ ${marker}`, "g");
      content = content.replace(markerPattern, (match: string, indent: string) => {
        return `${indent}${injectContent}\n${match}`;
      });
    }

    await fs.writeFile(fullPath, content, "utf-8");
  }

  // Remove temporary injections file
  await fs.rm(injectionsPath, { force: true });
}

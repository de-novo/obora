import { defineCommand } from "citty";
import consola from "consola";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  APP_MODULES,
  PRESETS,
  PRESETS_DIR,
  resolvePresetName,
} from "../utils/constants";
import {
  hasOboraConfig,
  readOboraConfig,
  type OboraConfig,
} from "../utils/project-config";

interface DiagnosticResult {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

interface DiagnosticCategory {
  name: string;
  results: DiagnosticResult[];
}

/**
 * Check if obora.config.json exists
 */
function checkConfigExists(projectPath: string): DiagnosticResult {
  if (hasOboraConfig(projectPath)) {
    return {
      name: "Configuration File",
      status: "pass",
      message: ".obora/config.json found",
    };
  }
  return {
    name: "Configuration File",
    status: "fail",
    message: ".obora/config.json not found",
    suggestion: "Run 'obora init' to initialize the project or 'obora create' to create a new project",
  };
}

/**
 * Check package.json exists
 */
function checkPackageJson(projectPath: string): DiagnosticResult {
  const packagePath = join(projectPath, "package.json");
  if (existsSync(packagePath)) {
    return {
      name: "Package Configuration",
      status: "pass",
      message: "package.json found",
    };
  }
  return {
    name: "Package Configuration",
    status: "fail",
    message: "package.json not found",
    suggestion: "Initialize a Node.js project with 'npm init' or 'pnpm init'",
  };
}

/**
 * Check if node_modules exists
 */
function checkNodeModules(projectPath: string): DiagnosticResult {
  const nodeModulesPath = join(projectPath, "node_modules");
  if (existsSync(nodeModulesPath)) {
    return {
      name: "Dependencies Installed",
      status: "pass",
      message: "node_modules directory found",
    };
  }
  return {
    name: "Dependencies Installed",
    status: "warn",
    message: "node_modules directory not found",
    suggestion: "Run 'pnpm install' or 'npm install' to install dependencies",
  };
}

/**
 * Check for lockfile
 */
function checkLockfile(projectPath: string): DiagnosticResult {
  const lockfiles = [
    { name: "pnpm-lock.yaml", manager: "pnpm" },
    { name: "package-lock.json", manager: "npm" },
    { name: "yarn.lock", manager: "yarn" },
    { name: "bun.lockb", manager: "bun" },
  ];

  for (const { name, manager } of lockfiles) {
    if (existsSync(join(projectPath, name))) {
      return {
        name: "Package Lock File",
        status: "pass",
        message: `${name} found (using ${manager})`,
      };
    }
  }

  return {
    name: "Package Lock File",
    status: "warn",
    message: "No lockfile found",
    suggestion: "Run your package manager's install command to generate a lockfile",
  };
}

/**
 * Check TypeScript configuration
 */
function checkTypeScriptConfig(projectPath: string): DiagnosticResult {
  const tsconfigPath = join(projectPath, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    return {
      name: "TypeScript Configuration",
      status: "pass",
      message: "tsconfig.json found",
    };
  }
  return {
    name: "TypeScript Configuration",
    status: "warn",
    message: "tsconfig.json not found",
    suggestion: "Add TypeScript configuration for better type safety",
  };
}

/**
 * Check environment files
 */
function checkEnvFiles(projectPath: string): DiagnosticResult {
  const envExample = join(projectPath, ".env.example");
  const envLocal = join(projectPath, ".env.local");
  const env = join(projectPath, ".env");

  const hasExample = existsSync(envExample);
  const hasLocal = existsSync(envLocal);
  const hasEnv = existsSync(env);

  if (hasExample && (hasLocal || hasEnv)) {
    return {
      name: "Environment Files",
      status: "pass",
      message: ".env.example and environment file found",
    };
  }

  if (hasExample && !hasLocal && !hasEnv) {
    return {
      name: "Environment Files",
      status: "warn",
      message: ".env.example exists but no .env or .env.local found",
      suggestion: "Copy .env.example to .env.local and fill in the required values",
    };
  }

  if (!hasExample && (hasLocal || hasEnv)) {
    return {
      name: "Environment Files",
      status: "warn",
      message: "Environment file found but no .env.example template",
      suggestion: "Create .env.example as a template for team members",
    };
  }

  return {
    name: "Environment Files",
    status: "pass",
    message: "No environment files required or found",
  };
}

/**
 * Check if required environment variables are set based on presets
 */
interface PresetEnvVar {
  key: string;
  description?: string;
  required?: boolean;
}

interface PresetTargetConfig {
  files?: string[];
  inject?: Array<{ file: string; marker: string; content: string }>;
  env?: PresetEnvVar[];
}

interface PresetManifestV2 {
  name: string;
  category: string;
  description: string;
  version?: string;
  common?: PresetTargetConfig;
  targets?: Record<string, PresetTargetConfig>;
  variants?: Record<string, PresetTargetConfig>;
}

interface PresetManifestV1 {
  name: string;
  category: string;
  description: string;
  env?: PresetEnvVar[];
}

function loadPresetManifest(presetName: string): PresetManifestV1 | PresetManifestV2 | null {
  const canonical = resolvePresetName(presetName);
  const presetInfo = PRESETS[canonical];
  if (!presetInfo) {
    return null;
  }
  const manifestPath = join(PRESETS_DIR, presetInfo.category, canonical, "manifest.json");
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, "utf-8")) as PresetManifestV1 | PresetManifestV2;
  } catch {
    return null;
  }
}

function getTargetConfigs(
  manifest: PresetManifestV1 | PresetManifestV2
): Record<string, PresetTargetConfig> {
  if (!("targets" in manifest) && !("variants" in manifest)) {
    return {};
  }
  return ("targets" in manifest && manifest.targets) ||
    ("variants" in manifest && manifest.variants) ||
    {};
}

function selectTargetKey(
  presetName: string,
  manifest: PresetManifestV1 | PresetManifestV2,
  config: OboraConfig | null
): { targetKey: string | null; source: "presetTargets" | "single" | "all" } {
  const targetConfigs = getTargetConfigs(manifest);
  const targetKeys = Object.keys(targetConfigs);
  const selected = config?.presetTargets?.[presetName];
  if (selected && targetKeys.includes(selected)) {
    return { targetKey: selected, source: "presetTargets" };
  }
  if (targetKeys.length === 1) {
    return { targetKey: targetKeys[0], source: "single" };
  }
  return { targetKey: null, source: "all" };
}

function collectEnvVars(
  manifest: PresetManifestV1 | PresetManifestV2,
  targetKey: string | null
): PresetEnvVar[] {
  const envs: PresetEnvVar[] = [];
  if ("env" in manifest && manifest.env) {
    envs.push(...manifest.env);
  }
  if ("common" in manifest && manifest.common?.env) {
    envs.push(...manifest.common.env);
  }
  const targetConfigs = getTargetConfigs(manifest);
  const targets = targetKey && targetConfigs[targetKey]
    ? [targetConfigs[targetKey]]
    : Object.values(targetConfigs);
  for (const target of targets) {
    if (target.env) envs.push(...target.env);
  }
  return envs;
}

function getCandidateDirs(projectPath: string, config: OboraConfig | null): string[] {
  const dirs = new Set<string>();
  dirs.add(projectPath);
  if (!config || config.base === "single") {
    return Array.from(dirs);
  }

  for (const appConfig of Object.values(config.apps || {})) {
    const moduleConfig = APP_MODULES[appConfig.module as keyof typeof APP_MODULES];
    if (!moduleConfig) continue;
    if (appConfig.path) {
      dirs.add(appConfig.path);
      continue;
    }
    dirs.add(join(projectPath, moduleConfig.targetDir));
  }

  return Array.from(dirs);
}

function collectExpectedFiles(
  manifest: PresetManifestV1 | PresetManifestV2,
  targetKey: string | null
): string[] {
  const files: string[] = [];
  if ("common" in manifest && manifest.common?.files) {
    files.push(...manifest.common.files);
  }
  const targetConfigs = getTargetConfigs(manifest);
  const targets = targetKey && targetConfigs[targetKey]
    ? [targetConfigs[targetKey]]
    : Object.values(targetConfigs);
  for (const target of targets) {
    if (target.files && target.files.length > 0) files.push(...target.files);
  }
  return Array.from(new Set(files));
}

function collectInjects(
  manifest: PresetManifestV1 | PresetManifestV2,
  targetKey: string | null
): Array<{ file: string; marker: string; content: string }> {
  const injects: Array<{ file: string; marker: string; content: string }> = [];
  const targetConfigs = getTargetConfigs(manifest);
  const targets = targetKey && targetConfigs[targetKey]
    ? [targetConfigs[targetKey]]
    : Object.values(targetConfigs);
  for (const target of targets) {
    if (target.inject && target.inject.length > 0) injects.push(...target.inject);
  }
  return injects;
}

function hasMarker(content: string, marker: string): boolean {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`\\/\\/ ${escaped}`),
    new RegExp(`# ${escaped}`),
    new RegExp(`\\/\\* ${escaped} \\*\\/`),
    new RegExp(`<!-- ${escaped} -->`),
  ];
  return patterns.some((pattern) => pattern.test(content));
}

function checkRequiredEnvVars(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config) {
    return results;
  }

  // Get installed presets from config
  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  // Read .env.local or .env file
  let envContent = "";
  const envLocalPath = join(projectPath, ".env.local");
  const envPath = join(projectPath, ".env");

  if (existsSync(envLocalPath)) {
    envContent = readFileSync(envLocalPath, "utf-8");
  } else if (existsSync(envPath)) {
    envContent = readFileSync(envPath, "utf-8");
  }

  for (const preset of installedPresets) {
    const manifest = loadPresetManifest(preset);
    if (!manifest) continue;
    const { targetKey, source } = selectTargetKey(preset, manifest, config);
    const envVars = collectEnvVars(manifest, targetKey).filter((v) => v.required !== false);
    if (envVars.length === 0) continue;
    const requiredVars = envVars.map((v) => v.key);
    const missingVars: string[] = [];
    for (const varName of requiredVars) {
      // Check if variable exists in env file (with any value)
      const regex = new RegExp(`^${varName}=`, "m");
      if (!regex.test(envContent)) {
        missingVars.push(varName);
      }
    }

    if (missingVars.length > 0) {
      results.push({
        name: `Environment: ${preset}`,
        status: "warn",
        message: `Missing environment variables: ${missingVars.join(", ")}`,
        suggestion: `Add ${missingVars.join(", ")} to your .env.local file`,
        details: {
          targetKey,
          targetSource: source,
          requiredVars,
          missingVars,
        },
      });
    } else {
      results.push({
        name: `Environment: ${preset}`,
        status: "pass",
        message: `All required environment variables are configured`,
        details: {
          targetKey,
          targetSource: source,
          requiredVars,
          missingVars: [],
        },
      });
    }
  }

  return results;
}

/**
 * Check for preset file integrity
 */
function checkPresetFiles(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config) {
    return results;
  }

  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  const candidateDirs = getCandidateDirs(projectPath, config);

  for (const preset of installedPresets) {
    const manifest = loadPresetManifest(preset);
    if (!manifest) {
      results.push({
        name: `Preset Integrity: ${preset}`,
        status: "warn",
        message: "Manifest not found or invalid",
        suggestion: `Reinstall preset '${preset}' or update local presets`,
        details: {
          targetKey: null,
          targetSource: "all",
        },
      });
      continue;
    }

    const { targetKey, source } = selectTargetKey(preset, manifest, config);
    const expectedFiles = collectExpectedFiles(manifest, targetKey);
    const injects = collectInjects(manifest, targetKey);
    const missingFiles: string[] = [];
    const missingMarkers: string[] = [];
    const missingTargets: string[] = [];

    for (const file of expectedFiles) {
      const exists = candidateDirs.some((dir) => existsSync(join(dir, file)));
      if (!exists) {
        missingFiles.push(file);
      }
    }

    for (const inject of injects) {
      const candidatePaths = candidateDirs.map((dir) => join(dir, inject.file));
      const existingPath = candidatePaths.find((p) => existsSync(p));
      if (!existingPath) {
        missingTargets.push(inject.file);
        continue;
      }
      const content = readFileSync(existingPath, "utf-8");
      const hasContent = content.includes(inject.content.trim());
      const hasMarkerFlag = hasMarker(content, inject.marker);
      if (!hasContent && !hasMarkerFlag) {
        missingMarkers.push(`${inject.file} (${inject.marker})`);
      }
    }

    if (missingFiles.length > 0 || missingMarkers.length > 0 || missingTargets.length > 0) {
      const parts: string[] = [];
      if (missingFiles.length > 0) {
        parts.push(`Missing files: ${missingFiles.join(", ")}`);
      }
      if (missingTargets.length > 0) {
        parts.push(`Missing inject targets: ${missingTargets.join(", ")}`);
      }
      if (missingMarkers.length > 0) {
        parts.push(`Missing markers: ${missingMarkers.join(", ")}`);
      }
      results.push({
        name: `Preset Integrity: ${preset}`,
        status: "warn",
        message: parts.join(" | "),
        suggestion: `Run 'obora add ${preset}' to reinstall or restore markers`,
        details: {
          targetKey,
          targetSource: source,
          missingFiles,
          missingTargets,
          missingMarkers,
        },
      });
    } else {
      results.push({
        name: `Preset Integrity: ${preset}`,
        status: "pass",
        message: "All expected files and markers found",
        details: {
          targetKey,
          targetSource: source,
          missingFiles: [],
          missingTargets: [],
          missingMarkers: [],
        },
      });
    }
  }

  return results;
}

/**
 * Check monorepo structure
 */
function checkMonorepoStructure(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config || config.base !== "monorepo") {
    return results;
  }

  // Check for workspaces in package.json
  const packageJsonPath = join(projectPath, "package.json");
  if (existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      if (!packageJson.workspaces) {
        results.push({
          name: "Monorepo Workspaces",
          status: "warn",
          message: "No workspaces field in package.json",
          suggestion: "Add workspaces configuration to package.json",
        });
      } else {
        results.push({
          name: "Monorepo Workspaces",
          status: "pass",
          message: "Workspaces configured in package.json",
        });
      }
    } catch {
      results.push({
        name: "Monorepo Workspaces",
        status: "fail",
        message: "Failed to parse package.json",
        suggestion: "Check package.json for syntax errors",
      });
    }
  }

  // Check for pnpm-workspace.yaml
  const pnpmWorkspacePath = join(projectPath, "pnpm-workspace.yaml");
  if (existsSync(pnpmWorkspacePath)) {
    results.push({
      name: "PNPM Workspace",
      status: "pass",
      message: "pnpm-workspace.yaml found",
    });
  }

  // Check apps directory
  const appsDir = join(projectPath, "apps");
  if (existsSync(appsDir)) {
    results.push({
      name: "Apps Directory",
      status: "pass",
      message: "apps/ directory found",
    });
  } else {
    results.push({
      name: "Apps Directory",
      status: "warn",
      message: "apps/ directory not found",
      suggestion: "Create apps/ directory for application packages",
    });
  }

  // Check packages directory
  const packagesDir = join(projectPath, "packages");
  if (existsSync(packagesDir)) {
    results.push({
      name: "Packages Directory",
      status: "pass",
      message: "packages/ directory found",
    });
  }

  return results;
}

/**
 * Display diagnostic results
 */
function displayResults(categories: DiagnosticCategory[]): {
  passCount: number;
  warnCount: number;
  failCount: number;
} {
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const category of categories) {
    consola.log("");
    consola.info(`[${category.name}]`);

    for (const result of category.results) {
      const icon =
        result.status === "pass" ? "✓" : result.status === "warn" ? "!" : "✗";

      if (result.status === "pass") {
        passCount++;
        consola.success(`  ${icon} ${result.name}: ${result.message}`);
      } else if (result.status === "warn") {
        warnCount++;
        consola.warn(`  ${icon} ${result.name}: ${result.message}`);
        if (result.suggestion) {
          consola.log(`      → ${result.suggestion}`);
        }
      } else {
        failCount++;
        consola.error(`  ${icon} ${result.name}: ${result.message}`);
        if (result.suggestion) {
          consola.log(`      → ${result.suggestion}`);
        }
      }
    }
  }

  return { passCount, warnCount, failCount };
}

export const doctorCommand = defineCommand({
  meta: {
    name: "doctor",
    description: "Diagnose project health and configuration issues",
  },
  args: {
    path: {
      type: "positional",
      description: "Project path to diagnose",
      required: false,
    },
    fix: {
      type: "boolean",
      description: "Attempt to fix issues automatically (coming soon)",
      default: false,
    },
    json: {
      type: "boolean",
      description: "Output results as JSON",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.path || ".");

    if (args.json) {
      // JSON output mode
      const config = await readOboraConfig(projectPath);
      const categories: DiagnosticCategory[] = [];

      // Project Structure
      const structureResults: DiagnosticResult[] = [
        checkConfigExists(projectPath),
        checkPackageJson(projectPath),
        checkNodeModules(projectPath),
        checkLockfile(projectPath),
        checkTypeScriptConfig(projectPath),
      ];
      categories.push({ name: "Project Structure", results: structureResults });

      // Environment
      const envResults: DiagnosticResult[] = [
        checkEnvFiles(projectPath),
        ...checkRequiredEnvVars(projectPath, config),
      ];
      categories.push({ name: "Environment", results: envResults });

      // Presets
      const presetResults = checkPresetFiles(projectPath, config);
      if (presetResults.length > 0) {
        categories.push({ name: "Presets", results: presetResults });
      }

      // Monorepo
      const monorepoResults = checkMonorepoStructure(projectPath, config);
      if (monorepoResults.length > 0) {
        categories.push({ name: "Monorepo", results: monorepoResults });
      }

      console.log(JSON.stringify(categories, null, 2));
      return;
    }

    consola.start("Running project diagnostics...\n");

    const config = await readOboraConfig(projectPath);
    const categories: DiagnosticCategory[] = [];

    // Project Structure
    const structureResults: DiagnosticResult[] = [
      checkConfigExists(projectPath),
      checkPackageJson(projectPath),
      checkNodeModules(projectPath),
      checkLockfile(projectPath),
      checkTypeScriptConfig(projectPath),
    ];
    categories.push({ name: "Project Structure", results: structureResults });

    // Environment
    const envResults: DiagnosticResult[] = [
      checkEnvFiles(projectPath),
      ...checkRequiredEnvVars(projectPath, config),
    ];
    categories.push({ name: "Environment", results: envResults });

    // Presets
    const presetResults = checkPresetFiles(projectPath, config);
    if (presetResults.length > 0) {
      categories.push({ name: "Presets", results: presetResults });
    }

    // Monorepo
    const monorepoResults = checkMonorepoStructure(projectPath, config);
    if (monorepoResults.length > 0) {
      categories.push({ name: "Monorepo", results: monorepoResults });
    }

    // Display results
    const { passCount, warnCount, failCount } = displayResults(categories);

    // Summary
    consola.log("");
    consola.box(
      `Diagnostics Complete\n\n` +
        `✓ ${passCount} passed\n` +
        `! ${warnCount} warnings\n` +
        `✗ ${failCount} failed`
    );

    if (failCount > 0) {
      process.exit(1);
    }
  },
});

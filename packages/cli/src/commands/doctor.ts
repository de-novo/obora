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
  validateAllPresets,
  type PresetValidationResult,
} from "../utils/preset-schema-validator";
import {
  hasOboraConfig,
  readOboraConfig,
  readPresetLockfile,
  createPresetLockfileSnapshot,
  type OboraConfig,
} from "../utils/project-config";
import { runPreflightChecks, showResults, type PreflightCheck, type SummaryItem } from "../utils/progress";

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
  env?: PresetEnvVar[];
}

interface PresetManifestV2 {
  name: string;
  category: string;
  description: string;
  version?: string;
  conflicts?: string[];
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

function findExistingFile(
  candidateDirs: string[],
  relativePaths: string[]
): string | null {
  for (const dir of candidateDirs) {
    for (const rel of relativePaths) {
      const fullPath = join(dir, rel);
      if (existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

function checkPresetGuidance(
  projectPath: string,
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];
  if (!config) return results;

  const candidateDirs = getCandidateDirs(projectPath, config);
  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  const providersPath = findExistingFile(candidateDirs, [
    "app/providers.tsx",
    "src/app/providers.tsx",
  ]);
  const layoutPath = findExistingFile(candidateDirs, [
    "app/layout.tsx",
    "src/app/layout.tsx",
  ]);

  const providersContent = providersPath ? readFileSync(providersPath, "utf-8") : "";
  const layoutContent = layoutPath ? readFileSync(layoutPath, "utf-8") : "";

  if (installedPresets.includes("next-intl")) {
    const hasProvider = layoutContent.includes("NextIntlClientProvider");
    if (!hasProvider) {
      results.push({
        name: "Guidance: next-intl",
        status: "warn",
        message: "NextIntlClientProvider not found in app/layout.tsx",
        suggestion: "Wrap your layout with <NextIntlClientProvider> and load messages.",
        details: {
          layoutPath,
        },
      });
    } else {
      results.push({
        name: "Guidance: next-intl",
        status: "pass",
        message: "NextIntlClientProvider detected in layout",
        details: {
          layoutPath,
        },
      });
    }
  }

  if (installedPresets.includes("next-themes")) {
    const hasProvider = providersContent.includes("ThemeProvider");
    if (!hasProvider) {
      results.push({
        name: "Guidance: next-themes",
        status: "warn",
        message: "ThemeProvider not found in app/providers.tsx",
        suggestion: "Wrap providers with <ThemeProvider> to enable dark/light themes.",
        details: {
          providersPath,
        },
      });
    } else {
      results.push({
        name: "Guidance: next-themes",
        status: "pass",
        message: "ThemeProvider detected in providers",
        details: {
          providersPath,
        },
      });
    }
  }

  if (installedPresets.includes("tanstack-query")) {
    const hasProvider = providersContent.includes("QueryProvider");
    if (!hasProvider) {
      results.push({
        name: "Guidance: tanstack-query",
        status: "warn",
        message: "QueryProvider not found in app/providers.tsx",
        suggestion: "Wrap providers with <QueryProvider> to enable TanStack Query.",
        details: {
          providersPath,
        },
      });
    } else {
      results.push({
        name: "Guidance: tanstack-query",
        status: "pass",
        message: "QueryProvider detected in providers",
        details: {
          providersPath,
        },
      });
    }
  }

  if (installedPresets.includes("nuqs")) {
    const hasProvider = providersContent.includes("NuqsAdapter");
    if (!hasProvider) {
      results.push({
        name: "Guidance: nuqs",
        status: "warn",
        message: "NuqsAdapter not found in app/providers.tsx",
        suggestion: "Wrap providers with <NuqsAdapter> for URL state.",
        details: {
          providersPath,
        },
      });
    } else {
      results.push({
        name: "Guidance: nuqs",
        status: "pass",
        message: "NuqsAdapter detected in providers",
        details: {
          providersPath,
        },
      });
    }
  }

  return results;
}

function diffPresetLockfile(
  expected: ReturnType<typeof createPresetLockfileSnapshot>,
  actual: ReturnType<typeof createPresetLockfileSnapshot>
): string[] {
  const diffs: string[] = [];
  if (expected.base !== actual.base) {
    diffs.push(`base: expected ${expected.base}, got ${actual.base}`);
  }
  if (expected.packageManager !== actual.packageManager) {
    diffs.push(`packageManager: expected ${expected.packageManager}, got ${actual.packageManager}`);
  }

  const expectedApps = expected.apps;
  const actualApps = actual.apps;
  for (const name of new Set([...Object.keys(expectedApps), ...Object.keys(actualApps)])) {
    const exp = expectedApps[name];
    const act = actualApps[name];
    if (!exp) {
      diffs.push(`apps.${name}: missing in expected`);
      continue;
    }
    if (!act) {
      diffs.push(`apps.${name}: missing in actual`);
      continue;
    }
    if (exp.module !== act.module) {
      diffs.push(`apps.${name}.module: expected ${exp.module}, got ${act.module}`);
    }
    if (exp.version !== act.version) {
      diffs.push(`apps.${name}.version: expected ${exp.version}, got ${act.version}`);
    }
    if (exp.path !== act.path) {
      diffs.push(`apps.${name}.path: expected ${exp.path}, got ${act.path}`);
    }
  }

  const expectedPresets = expected.presets;
  const actualPresets = actual.presets;
  for (const slot of new Set([...Object.keys(expectedPresets), ...Object.keys(actualPresets)])) {
    const exp = expectedPresets[slot];
    const act = actualPresets[slot];
    if (!exp) {
      diffs.push(`presets.${slot}: missing in expected`);
      continue;
    }
    if (!act) {
      diffs.push(`presets.${slot}: missing in actual`);
      continue;
    }
    if (exp.preset !== act.preset) {
      diffs.push(`presets.${slot}.preset: expected ${exp.preset}, got ${act.preset}`);
    }
    if (exp.version !== act.version) {
      diffs.push(`presets.${slot}.version: expected ${exp.version}, got ${act.version}`);
    }
    if ((exp.target || "") !== (act.target || "")) {
      diffs.push(`presets.${slot}.target: expected ${exp.target || "none"}, got ${act.target || "none"}`);
    }
  }

  return diffs;
}

async function checkPresetLockfile(
  projectPath: string,
  config: OboraConfig | null
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  if (!config) {
    return results;
  }

  const expected = createPresetLockfileSnapshot(config);
  const actual = await readPresetLockfile(projectPath);
  if (!actual) {
    results.push({
      name: "Preset Lockfile",
      status: "warn",
      message: ".obora/presets.lock.json not found or invalid",
      suggestion: "Re-run obora create/add/remove/upgrade to regenerate the lockfile.",
    });
    return results;
  }

  const diffs = diffPresetLockfile(expected, actual);
  if (diffs.length > 0) {
    results.push({
      name: "Preset Lockfile",
      status: "warn",
      message: "Lockfile drift detected",
      suggestion: "Re-run obora create/add/remove/upgrade to regenerate the lockfile.",
      details: {
        diffs,
      },
    });
  } else {
    results.push({
      name: "Preset Lockfile",
      status: "pass",
      message: "Lockfile matches current configuration",
    });
  }

  return results;
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
    const missingFiles: string[] = [];

    for (const file of expectedFiles) {
      const exists = candidateDirs.some((dir) => existsSync(join(dir, file)));
      if (!exists) {
        missingFiles.push(file);
      }
    }

    if (missingFiles.length > 0) {
      results.push({
        name: `Preset Integrity: ${preset}`,
        status: "warn",
        message: `Missing files: ${missingFiles.join(", ")}`,
        suggestion: `Run 'obora add ${preset}' to reinstall`,
        details: {
          targetKey,
          targetSource: source,
          missingFiles,
        },
      });
    } else {
      results.push({
        name: `Preset Integrity: ${preset}`,
        status: "pass",
        message: "All expected files found",
        details: {
          targetKey,
          targetSource: source,
          missingFiles: [],
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
 * Check for conflicts between installed presets
 */
function checkPresetConflicts(
  config: OboraConfig | null
): DiagnosticResult[] {
  const results: DiagnosticResult[] = [];

  if (!config) {
    return results;
  }

  const installedPresets = Object.values(config.slots || {})
    .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
    .map((slot) => slot.preset);

  if (installedPresets.length < 2) {
    return results;
  }

  const conflicts: Array<{ preset: string; conflictsWith: string }> = [];

  for (const preset of installedPresets) {
    const manifest = loadPresetManifest(preset);
    if (!manifest || !("conflicts" in manifest) || !manifest.conflicts) {
      continue;
    }

    for (const conflictingPreset of manifest.conflicts) {
      if (installedPresets.includes(conflictingPreset)) {
        conflicts.push({
          preset,
          conflictsWith: conflictingPreset,
        });
      }
    }
  }

  if (conflicts.length > 0) {
    const uniqueConflicts = conflicts.filter(
      (c, i, arr) =>
        arr.findIndex(
          (x) =>
            (x.preset === c.preset && x.conflictsWith === c.conflictsWith) ||
            (x.preset === c.conflictsWith && x.conflictsWith === c.preset)
        ) === i
    );

    for (const conflict of uniqueConflicts) {
      results.push({
        name: "Preset Conflict",
        status: "warn",
        message: `'${conflict.preset}' conflicts with '${conflict.conflictsWith}'`,
        suggestion: `Remove one of the conflicting presets using 'obora remove ${conflict.preset}' or 'obora remove ${conflict.conflictsWith}'`,
        details: {
          preset: conflict.preset,
          conflictsWith: conflict.conflictsWith,
        },
      });
    }
  } else {
    results.push({
      name: "Preset Conflicts",
      status: "pass",
      message: "No conflicts detected between installed presets",
    });
  }

  return results;
}

/**
 * Convert preset validation results to diagnostic results
 */
function convertPresetValidationResults(
  results: PresetValidationResult[]
): DiagnosticResult[] {
  return results.map((result) => {
    if (result.valid) {
      return {
        name: `Schema: ${result.presetName}`,
        status: "pass" as const,
        message: "Manifest is valid",
      };
    }

    const errorMessages: string[] = [];

    for (const error of result.schemaErrors) {
      errorMessages.push(`Schema ${error.path}: ${error.message}`);
    }

    for (const error of result.transformErrors) {
      errorMessages.push(`Transform: ${error.message}`);
    }

    for (const error of result.fileErrors) {
      errorMessages.push(`File: ${error.message}`);
    }

    return {
      name: `Schema: ${result.presetName}`,
      status: "fail" as const,
      message: errorMessages[0] || "Validation failed",
      suggestion: errorMessages.length > 1
        ? `${errorMessages.length - 1} more error(s). Run with --json for details.`
        : "Fix the manifest.json according to the preset schema",
      details: {
        schemaErrors: result.schemaErrors,
        transformErrors: result.transformErrors,
        fileErrors: result.fileErrors,
      },
    };
  });
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
    "check-lock": {
      type: "boolean",
      description: "Validate presets.lock.json against current config",
      default: false,
    },
    presets: {
      type: "boolean",
      description: "Validate all preset manifests against JSON Schema",
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
      const conflictResults = checkPresetConflicts(config);
      const allPresetResults = [...presetResults, ...conflictResults];
      if (allPresetResults.length > 0) {
        categories.push({ name: "Presets", results: allPresetResults });
      }

      // Monorepo
      const monorepoResults = checkMonorepoStructure(projectPath, config);
      if (monorepoResults.length > 0) {
        categories.push({ name: "Monorepo", results: monorepoResults });
      }

      // Preset Guidance (missing patterns)
      const guidanceResults = checkPresetGuidance(projectPath, config);
      if (guidanceResults.length > 0) {
        categories.push({ name: "Preset Guidance", results: guidanceResults });
      }

      // Preset Lockfile
      if (args["check-lock"]) {
        const lockResults = await checkPresetLockfile(projectPath, config);
        if (lockResults.length > 0) {
          categories.push({ name: "Preset Lockfile", results: lockResults });
        }
      }

      // Preset Schema Validation
      if (args.presets) {
        const validationResults = validateAllPresets(PRESETS_DIR, {
          checkFiles: true,
          checkTransforms: true,
        });
        const schemaResults = convertPresetValidationResults(validationResults);
        if (schemaResults.length > 0) {
          categories.push({ name: "Preset Schema Validation", results: schemaResults });
        }
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
    const conflictResults = checkPresetConflicts(config);
    const allPresetResults = [...presetResults, ...conflictResults];
    if (allPresetResults.length > 0) {
      categories.push({ name: "Presets", results: allPresetResults });
    }

    // Monorepo
    const monorepoResults = checkMonorepoStructure(projectPath, config);
    if (monorepoResults.length > 0) {
      categories.push({ name: "Monorepo", results: monorepoResults });
    }

    // Preset Guidance (missing patterns)
    const guidanceResults = checkPresetGuidance(projectPath, config);
    if (guidanceResults.length > 0) {
      categories.push({ name: "Preset Guidance", results: guidanceResults });
    }

    // Preset Lockfile
    if (args["check-lock"]) {
      const lockResults = await checkPresetLockfile(projectPath, config);
      if (lockResults.length > 0) {
        categories.push({ name: "Preset Lockfile", results: lockResults });
      }
    }

    // Preset Schema Validation
    if (args.presets) {
      const validationResults = validateAllPresets(PRESETS_DIR, {
        checkFiles: true,
        checkTransforms: true,
      });
      const schemaResults = convertPresetValidationResults(validationResults);
      if (schemaResults.length > 0) {
        categories.push({ name: "Preset Schema Validation", results: schemaResults });
      }
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

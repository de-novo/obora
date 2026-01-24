import { defineCommand } from "citty";
import { consola } from "consola";
import { join, resolve } from "pathe";
import prompts from "prompts";
import {
  PRESETS,
  PRESETS_DIR,
  resolvePresetName,
  readJson,
  writeJson,
  fileExists,
} from "../utils";
import {
  hasOboraConfig,
  readOboraConfig,
  upgradeSlotPreset,
  type OboraConfig,
} from "../utils/project-config";
import { Errors, showError } from "../utils/errors";
import { withSpinner, runTasks, type TaskStep } from "../utils/progress";

interface UpgradeCandidate {
  slot: string;
  preset: string;
  currentVersion: string;
  latestVersion: string;
}

interface PresetManifest {
  name: string;
  category: string;
  version?: string;
  common?: {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  targets?: Record<string, {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>;
}

/**
 * Read preset manifest from presets directory
 */
async function readPresetManifest(preset: string, category: string): Promise<PresetManifest | null> {
  const manifestPath = join(PRESETS_DIR, category, preset, "manifest.json");
  if (!(await fileExists(manifestPath))) {
    return null;
  }
  return readJson<PresetManifest>(manifestPath);
}

/**
 * Get dependencies from manifest for a specific target
 */
function getManifestDependencies(
  manifest: PresetManifest,
  target?: string
): { dependencies: Record<string, string>; devDependencies: Record<string, string> } {
  const deps: Record<string, string> = {};
  const devDeps: Record<string, string> = {};

  // Common dependencies
  if (manifest.common?.dependencies) {
    Object.assign(deps, manifest.common.dependencies);
  }
  if (manifest.common?.devDependencies) {
    Object.assign(devDeps, manifest.common.devDependencies);
  }

  // Target-specific dependencies
  if (target && manifest.targets?.[target]) {
    const targetConfig = manifest.targets[target];
    if (targetConfig.dependencies) {
      Object.assign(deps, targetConfig.dependencies);
    }
    if (targetConfig.devDependencies) {
      Object.assign(devDeps, targetConfig.devDependencies);
    }
  }

  return { dependencies: deps, devDependencies: devDeps };
}

/**
 * Update package.json with new dependencies
 */
async function updatePackageJsonDeps(
  packageJsonPath: string,
  newDeps: { dependencies: Record<string, string>; devDependencies: Record<string, string> }
): Promise<{ updated: boolean; changes: string[] }> {
  if (!(await fileExists(packageJsonPath))) {
    return { updated: false, changes: [] };
  }

  const pkg = await readJson<{
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  }>(packageJsonPath);

  const changes: string[] = [];
  let updated = false;

  // Update dependencies
  for (const [name, version] of Object.entries(newDeps.dependencies)) {
    const currentVersion = pkg.dependencies?.[name];
    if (currentVersion && currentVersion !== version) {
      pkg.dependencies = pkg.dependencies || {};
      pkg.dependencies[name] = version;
      changes.push(`${name}: ${currentVersion} → ${version}`);
      updated = true;
    }
  }

  // Update devDependencies
  for (const [name, version] of Object.entries(newDeps.devDependencies)) {
    const currentVersion = pkg.devDependencies?.[name];
    if (currentVersion && currentVersion !== version) {
      pkg.devDependencies = pkg.devDependencies || {};
      pkg.devDependencies[name] = version;
      changes.push(`${name}: ${currentVersion} → ${version} (dev)`);
      updated = true;
    }
  }

  if (updated) {
    await writeJson(packageJsonPath, pkg);
  }

  return { updated, changes };
}

/**
 * Compare semver versions (simplified)
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareVersions(a: string, b: string): number {
  const parseVersion = (v: string) => {
    const parts = v.replace(/^[^\d]*/, "").split(".");
    return parts.map((p) => parseInt(p, 10) || 0);
  };

  const aParts = parseVersion(a);
  const bParts = parseVersion(b);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;

    if (aVal < bVal) return -1;
    if (aVal > bVal) return 1;
  }

  return 0;
}

/**
 * Find presets that have newer versions available
 */
function findUpgradeCandidates(config: OboraConfig): UpgradeCandidate[] {
  const candidates: UpgradeCandidate[] = [];

  for (const [slot, slotConfig] of Object.entries(config.slots)) {
    if (!slotConfig) continue;

    const canonicalPreset = resolvePresetName(slotConfig.preset);
    const presetInfo = PRESETS[canonicalPreset];
    if (!presetInfo) continue;

    const currentVersion = slotConfig.version;
    const latestVersion = presetInfo.version;

    if (compareVersions(currentVersion, latestVersion) < 0) {
      candidates.push({
        slot,
        preset: slotConfig.preset,
        currentVersion,
        latestVersion,
      });
    }
  }

  return candidates;
}

/**
 * Display upgrade summary
 */
function displayUpgradeSummary(candidates: UpgradeCandidate[]): void {
  if (candidates.length === 0) {
    consola.success("All presets are up to date!");
    return;
  }

  consola.info("\nAvailable upgrades:");
  for (const candidate of candidates) {
    consola.info(
      `  ${candidate.slot}:${candidate.preset}  ${candidate.currentVersion} → ${candidate.latestVersion}`
    );
  }
  console.log();
}

export const upgradeCommand = defineCommand({
  meta: {
    name: "upgrade",
    description: "Upgrade presets to latest versions",
  },
  args: {
    preset: {
      type: "positional",
      description: "Specific preset to upgrade (optional)",
      required: false,
    },
    dir: {
      type: "string",
      alias: "d",
      description: "Project directory (default: current directory)",
    },
    all: {
      type: "boolean",
      alias: "a",
      description: "Upgrade all presets without prompting",
      default: false,
    },
    check: {
      type: "boolean",
      alias: "c",
      description: "Only check for updates, don't upgrade",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
  },
  async run({ args }) {
    const projectPath = resolve(args.dir || process.cwd());

    // Check for obora config
    if (!hasOboraConfig(projectPath)) {
      showError(Errors.projectNotInitialized(projectPath));
      process.exit(1);
    }

    const config = await readOboraConfig(projectPath);
    if (!config) {
      showError(Errors.configInvalid(join(projectPath, ".obora/config.json"), "Failed to read config"));
      process.exit(1);
    }

    // Find upgrade candidates
    let candidates = findUpgradeCandidates(config);

    // Filter by specific preset if provided
    if (args.preset) {
      const normalizedArg = resolvePresetName(args.preset);
      candidates = candidates.filter(
        (c) =>
          c.preset === args.preset ||
          c.slot === args.preset ||
          resolvePresetName(c.preset) === normalizedArg ||
          c.slot === normalizedArg
      );

      if (candidates.length === 0) {
        // Check if preset exists but is already up to date
        const slotConfig = Object.entries(config.slots).find(
          ([slot, sc]) =>
            sc &&
            (sc.preset === args.preset ||
              slot === args.preset ||
              resolvePresetName(sc.preset) === normalizedArg ||
              slot === normalizedArg)
        );

        if (slotConfig) {
          consola.success(`${args.preset} is already up to date.`);
        } else {
          showError(Errors.presetNotFound(args.preset));
        }
        return;
      }
    }

    // Display summary
    displayUpgradeSummary(candidates);

    if (candidates.length === 0) {
      return;
    }

    // Check mode - only display, don't upgrade
    if (args.check) {
      return;
    }

    // Select which presets to upgrade
    let toUpgrade: UpgradeCandidate[] = [];

    if (args.all || args.yes) {
      toUpgrade = candidates;
    } else if (candidates.length === 1) {
      const { confirmed } = await prompts({
        type: "confirm",
        name: "confirmed",
        message: `Upgrade ${candidates[0].preset} to ${candidates[0].latestVersion}?`,
        initial: true,
      });

      if (confirmed) {
        toUpgrade = candidates;
      }
    } else {
      const { selected } = await prompts({
        type: "multiselect",
        name: "selected",
        message: "Select presets to upgrade",
        choices: candidates.map((c) => ({
          title: `${c.slot}:${c.preset} (${c.currentVersion} → ${c.latestVersion})`,
          value: c,
          selected: true,
        })),
      });

      if (selected && selected.length > 0) {
        toUpgrade = selected;
      }
    }

    if (toUpgrade.length === 0) {
      consola.info("No presets selected for upgrade.");
      return;
    }

    // Perform upgrades
    const allChanges: string[] = [];

    const upgradeTasks: TaskStep[] = toUpgrade.map((candidate) => ({
      name: `Upgrade ${candidate.slot}:${candidate.preset}`,
      task: async () => {
        // Get preset info
        const presetInfo = PRESETS[resolvePresetName(candidate.preset)];
        if (!presetInfo) {
          await upgradeSlotPreset(projectPath, candidate.slot, candidate.latestVersion);
          return { warning: `Preset info not found, skipped dependency update` };
        }

        // Read manifest for new dependencies
        const manifest = await readPresetManifest(candidate.preset, presetInfo.category);
        if (!manifest) {
          await upgradeSlotPreset(projectPath, candidate.slot, candidate.latestVersion);
          return { warning: `Manifest not found, updated config only` };
        }

        // Get target from config
        const target = config.presetTargets?.[candidate.preset];
        const newDeps = getManifestDependencies(manifest, target);

        // Find package.json to update
        const packageJsonPaths: string[] = [];

        if (config.base === "monorepo") {
          packageJsonPaths.push(join(projectPath, "package.json"));
          for (const [, appConfig] of Object.entries(config.apps)) {
            if (appConfig.path) {
              packageJsonPaths.push(join(appConfig.path, "package.json"));
            }
          }
        } else {
          packageJsonPaths.push(join(projectPath, "package.json"));
        }

        // Update dependencies
        for (const pkgPath of packageJsonPaths) {
          const { updated, changes } = await updatePackageJsonDeps(pkgPath, newDeps);
          if (updated) {
            allChanges.push(...changes.map(c => `  ${candidate.preset}: ${c}`));
          }
        }

        // Update config
        await upgradeSlotPreset(projectPath, candidate.slot, candidate.latestVersion);
        return { success: `${candidate.currentVersion} → ${candidate.latestVersion}` };
      },
    }));

    const upgradeResults = await runTasks(upgradeTasks, {
      continueOnError: true,
    });

    const successCount = upgradeResults.succeeded;
    const failCount = upgradeResults.failed;

    if (failCount > 0) {
      consola.warn(`\nUpgrade completed with ${failCount} failure(s)`);
    } else {
      consola.success("\nUpgrade complete!");
    }

    if (allChanges.length > 0) {
      consola.info("\nDependency changes:");
      for (const change of allChanges) {
        consola.log(change);
      }
    }

    consola.info("\nNext steps:");
    consola.info("  1. Run your package manager to install updated dependencies");
    consola.info("     pnpm install");
    consola.info("  2. Check for any breaking changes in the changelog");
    consola.info("  3. Run tests to verify everything works");
  },
});

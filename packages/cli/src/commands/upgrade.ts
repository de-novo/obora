import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import prompts from "prompts";
import { PRESETS } from "../utils/constants";
import {
  readOboraConfig,
  hasOboraConfig,
  upgradeSlotPreset,
  type OboraConfig,
} from "../utils/project-config";

interface UpgradeCandidate {
  slot: string;
  preset: string;
  currentVersion: string;
  latestVersion: string;
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

    const presetInfo = PRESETS[slotConfig.preset];
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
      consola.error("No obora config found. Run 'obora init' first.");
      process.exit(1);
    }

    const config = await readOboraConfig(projectPath);
    if (!config) {
      consola.error("Failed to read obora config.");
      process.exit(1);
    }

    // Find upgrade candidates
    let candidates = findUpgradeCandidates(config);

    // Filter by specific preset if provided
    if (args.preset) {
      candidates = candidates.filter(
        (c) => c.preset === args.preset || c.slot === args.preset
      );

      if (candidates.length === 0) {
        // Check if preset exists but is already up to date
        const slotConfig = Object.entries(config.slots).find(
          ([slot, sc]) => sc && (sc.preset === args.preset || slot === args.preset)
        );

        if (slotConfig) {
          consola.success(`${args.preset} is already up to date.`);
        } else {
          consola.error(`Preset '${args.preset}' not found in this project.`);
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
    consola.start("Upgrading presets...");

    for (const candidate of toUpgrade) {
      try {
        await upgradeSlotPreset(projectPath, candidate.slot, candidate.latestVersion);
        consola.success(
          `Upgraded ${candidate.slot}:${candidate.preset} to ${candidate.latestVersion}`
        );
      } catch (error) {
        consola.error(
          `Failed to upgrade ${candidate.preset}: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    consola.success("\nUpgrade complete!");
    consola.info("\nNext steps:");
    consola.info("  1. Run your package manager to update dependencies");
    consola.info("  2. Check for any breaking changes in the changelog");
    consola.info("  3. Run tests to verify everything works");
  },
});

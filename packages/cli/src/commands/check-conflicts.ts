import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import { PRESETS } from "../utils";
import {
  detectConflicts,
  detectConflictsForMultiple,
  type ConflictDetectionResult,
} from "../utils/detect-conflicts";

export const checkConflictsCommand = defineCommand({
  meta: {
    name: "check-conflicts",
    description: "Check for preset conflicts before installation",
  },
  args: {
    preset: {
      type: "positional",
      description: "Preset or presets to check (comma-separated)",
      required: true,
    },
    dir: {
      type: "string",
      alias: "d",
      description: "Target directory (default: current directory)",
      default: ".",
    },
  },
  async run({ args }) {
    const projectDir = resolve(args.dir);
    const presetNames = args.preset
      .split(",")
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    consola.box(`🔍 Checking conflicts for ${presetNames.length} preset(s)\n`);

    const results: ConflictDetectionResult[] = await detectConflictsForMultiple(
      projectDir,
      presetNames,
    );

    let hasAnyConflict = false;

    for (const [i, result] of results.entries()) {
      const presetName = presetNames[i];

      if (result.hasConflict) {
        hasAnyConflict = true;
        consola.error(`❌ ${presetName}: ${result.reason}`);

        if (result.conflictSlot) {
          consola.warn(`   Conflict slot: ${result.conflictSlot}`);
        }

        if (result.conflictingPresets.length > 0) {
          consola.warn(
            `   Conflicting presets: ${result.conflictingPresets.join(", ")}`,
          );
        }
      } else {
        consola.success(`✓ ${presetName}: No conflicts detected`);
      }
    }

    if (!hasAnyConflict) {
      consola.box("✅ All presets can be safely installed");
    } else {
      consola.box("⚠️  Conflicts detected");
      consola.info(
        "\nUse 'obora add <preset> --force' to install despite conflicts",
      );
      consola.info("Or remove conflicting presets first:");
      for (const [i, result] of results.entries()) {
        if (result.conflictingPresets.length > 0) {
          for (const conflictPreset of result.conflictingPresets) {
            consola.info(`  obora remove ${conflictPreset}`);
          }
        }
      }
    }

    process.exit(hasAnyConflict ? 1 : 0);
  },
});

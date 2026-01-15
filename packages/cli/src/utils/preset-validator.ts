import { join } from "pathe";
import { consola } from "consola";
import { readJson, fileExists } from "./fs";
import { PRESETS_DIR, PRESETS } from "./constants";

interface PresetManifest {
  name: string;
  category: string;
  requires?: string[]; // Format: "category:preset"
  conflicts?: string[];
  capabilities?: string[];
  requiresCapabilities?: string[];
  incompatibleCapabilities?: string[];
}

interface PresetSelection {
  preset: string;
  version: string;
}

type SlotSelections = Record<string, PresetSelection | null>;

/**
 * Parse a requirement string like "database:drizzle" into category and preset
 */
function parseRequirement(req: string): { category: string; preset: string } | null {
  const parts = req.split(":");
  if (parts.length !== 2) return null;
  return { category: parts[0], preset: parts[1] };
}

/**
 * Read preset manifest from the presets directory
 */
async function readPresetManifest(
  category: string,
  presetName: string
): Promise<PresetManifest | null> {
  const manifestPath = join(PRESETS_DIR, category, presetName, "manifest.json");

  if (!(await fileExists(manifestPath))) {
    return null;
  }

  try {
    return await readJson<PresetManifest>(manifestPath);
  } catch {
    return null;
  }
}

/**
 * Validate and auto-resolve preset dependencies
 *
 * This function:
 * 1. Checks if all required presets are selected
 * 2. Auto-adds missing required presets
 * 3. Checks for conflicts between selected presets
 *
 * Returns updated selections with required presets added
 */
export async function validateAndResolvePresets(
  selections: SlotSelections
): Promise<{
  resolved: SlotSelections;
  added: Array<{ category: string; preset: string; requiredBy: string }>;
  conflicts: Array<{ preset1: string; preset2: string }>;
  missingCapabilities: Array<{ preset: string; capability: string }>;
  capabilityConflicts: Array<{ preset: string; capability: string; providedBy: string }>;
}> {
  const resolved = { ...selections };
  const added: Array<{ category: string; preset: string; requiredBy: string }> = [];
  const conflicts: Array<{ preset1: string; preset2: string }> = [];
  const missingCapabilities: Array<{ preset: string; capability: string }> = [];
  const capabilityConflicts: Array<{ preset: string; capability: string; providedBy: string }> = [];

  // Collect all selected presets and their manifests
  const selectedPresets: Array<{
    category: string;
    preset: string;
    manifest: PresetManifest;
  }> = [];

  for (const [category, selection] of Object.entries(selections)) {
    if (!selection) continue;

    const manifest = await readPresetManifest(category, selection.preset);
    if (manifest) {
      selectedPresets.push({
        category,
        preset: selection.preset,
        manifest,
      });
    }
  }

  // Check requirements for each selected preset
  for (const { category, preset, manifest } of selectedPresets) {
    if (!manifest.requires || manifest.requires.length === 0) continue;

    for (const requirement of manifest.requires) {
      const parsed = parseRequirement(requirement);
      if (!parsed) continue;

      const { category: reqCategory, preset: reqPreset } = parsed;

      // Check if required preset is already selected
      const currentSelection = resolved[reqCategory];

      if (!currentSelection) {
        // Auto-add the required preset
        const presetInfo = PRESETS[reqPreset];
        if (presetInfo) {
          resolved[reqCategory] = {
            preset: reqPreset,
            version: presetInfo.version,
          };
          added.push({
            category: reqCategory,
            preset: reqPreset,
            requiredBy: `${category}:${preset}`,
          });
        }
      } else if (currentSelection.preset !== reqPreset) {
        // Different preset is selected - this is a conflict/warning
        consola.warn(
          `${category}:${preset} requires ${reqCategory}:${reqPreset}, ` +
            `but ${reqCategory}:${currentSelection.preset} is selected`
        );
      }
    }
  }

  // Check for conflicts between selected presets
  for (const { category, preset, manifest } of selectedPresets) {
    if (!manifest.conflicts || manifest.conflicts.length === 0) continue;

    for (const conflictPreset of manifest.conflicts) {
      // Check if conflicting preset is selected
      for (const [otherCategory, otherSelection] of Object.entries(resolved)) {
        if (!otherSelection) continue;
        if (otherSelection.preset === conflictPreset) {
          conflicts.push({
            preset1: `${category}:${preset}`,
            preset2: `${otherCategory}:${conflictPreset}`,
          });
        }
      }
    }
  }

  // Capability-based compatibility checks
  const capabilityProviders = new Map<string, string[]>();
  for (const { category, preset, manifest } of selectedPresets) {
    const capabilities = manifest.capabilities || [];
    for (const capability of capabilities) {
      const providers = capabilityProviders.get(capability) || [];
      providers.push(`${category}:${preset}`);
      capabilityProviders.set(capability, providers);
    }
  }

  for (const { category, preset, manifest } of selectedPresets) {
    const presetKey = `${category}:${preset}`;

    if (manifest.requiresCapabilities && manifest.requiresCapabilities.length > 0) {
      for (const capability of manifest.requiresCapabilities) {
        if (!capabilityProviders.has(capability)) {
          missingCapabilities.push({ preset: presetKey, capability });
        }
      }
    }

    if (manifest.incompatibleCapabilities && manifest.incompatibleCapabilities.length > 0) {
      for (const capability of manifest.incompatibleCapabilities) {
        const providers = capabilityProviders.get(capability) || [];
        for (const providedBy of providers) {
          if (providedBy !== presetKey) {
            capabilityConflicts.push({ preset: presetKey, capability, providedBy });
          }
        }
      }
    }
  }

  return { resolved, added, conflicts, missingCapabilities, capabilityConflicts };
}

/**
 * Display validation results to the user
 */
export function displayValidationResults(
  added: Array<{ category: string; preset: string; requiredBy: string }>,
  conflicts: Array<{ preset1: string; preset2: string }>,
  missingCapabilities: Array<{ preset: string; capability: string }> = [],
  capabilityConflicts: Array<{ preset: string; capability: string; providedBy: string }> = []
): void {
  if (added.length > 0) {
    consola.info("\nAuto-added required presets:");
    for (const { category, preset, requiredBy } of added) {
      consola.info(`  + ${category}:${preset} (required by ${requiredBy})`);
    }
    console.log();
  }

  if (conflicts.length > 0) {
    consola.warn("\nPreset conflicts detected:");
    for (const { preset1, preset2 } of conflicts) {
      consola.warn(`  ! ${preset1} conflicts with ${preset2}`);
    }
    console.log();
  }

  if (missingCapabilities.length > 0) {
    consola.warn("\nMissing required capabilities:");
    for (const { preset, capability } of missingCapabilities) {
      consola.warn(`  ! ${preset} requires capability "${capability}"`);
    }
    console.log();
  }

  if (capabilityConflicts.length > 0) {
    consola.warn("\nCapability conflicts detected:");
    for (const { preset, capability, providedBy } of capabilityConflicts) {
      consola.warn(`  ! ${preset} is incompatible with "${capability}" provided by ${providedBy}`);
    }
    console.log();
  }
}

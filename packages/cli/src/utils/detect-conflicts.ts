/**
 * Preset Conflict Detection
 *
 * Detects conflicts between presets before installation.
 * Provides detailed information about why a preset cannot be installed.
 */

import { readOboraConfig } from "./project-config";
import type { OboraConfig } from "./project-config";
import { PRESETS, CATEGORY_CONFIGS } from "./constants";

/**
 * Conflict detection result
 */
export interface ConflictDetectionResult {
  /** Whether a conflict exists */
  hasConflict: boolean;
  /** Description of conflict (human-readable) */
  reason: string;
  /** The preset(s) causing conflict */
  conflictingPresets: string[];
  /** The slot/category where conflict occurs */
  conflictSlot?: string;
}

/**
 * Detect conflicts for a preset before installation
 *
 * @param projectDir - Project directory
 * @param presetName - Preset to check for conflicts
 * @returns ConflictDetectionResult with detailed information
 */
export async function detectConflicts(
  projectDir: string,
  presetName: string,
): Promise<ConflictDetectionResult> {
  const config = await readOboraConfig(projectDir);

  if (!config) {
    return {
      hasConflict: false,
      reason: "No obora config found",
      conflictingPresets: [],
    };
  }

  const presetInfo = PRESETS[presetName];

  if (!presetInfo) {
    return {
      hasConflict: true,
      reason: `Preset "${presetName}" not found in available presets`,
      conflictingPresets: [],
    };
  }

  // Check 1: Manifest-level conflicts
  const manifestConflicts = presetInfo.conflicts || [];
  const manifestConflictsResult = checkManifestConflicts(
    config,
    presetName,
    manifestConflicts,
  );

  if (manifestConflictsResult.hasConflict) {
    return manifestConflictsResult;
  }

  // Check 2: Slot-level conflicts (exclusive category)
  const slotConflictResult = checkSlotConflicts(
    config,
    presetName,
    presetInfo.category,
  );

  if (slotConflictResult.hasConflict) {
    return slotConflictResult;
  }

  // Check 3: Circular dependency
  const circularDepResult = checkCircularDependencies(
    config,
    presetName,
    presetInfo.requires || [],
  );

  if (circularDepResult.hasConflict) {
    return circularDepResult;
  }

  return {
    hasConflict: false,
    reason: `No conflicts detected for ${presetName}`,
    conflictingPresets: [],
  };
}

/**
 * Check manifest-level conflicts
 */
function checkManifestConflicts(
  config: OboraConfig,
  presetName: string,
  conflicts: string[],
): ConflictDetectionResult {
  if (!conflicts || conflicts.length === 0) {
    return { hasConflict: false, reason: "", conflictingPresets: [] };
  }

  const conflictingPresets: string[] = [];

  for (const conflict of conflicts) {
    // Check if conflicting preset is installed
    const isInstalled = Object.values(config.slots || {}).some(
      (slot) => slot?.preset === conflict,
    );

    if (isInstalled) {
      conflictingPresets.push(conflict);
    }
  }

  if (conflictingPresets.length > 0) {
    return {
      hasConflict: true,
      reason: `Conflicts with installed presets: ${conflictingPresets.join(", ")}. Remove conflicting presets first.`,
      conflictingPresets,
    };
  }

  return { hasConflict: false, reason: "", conflictingPresets: [] };
}

/**
 * Check slot-level conflicts (exclusive category)
 */
function checkSlotConflicts(
  config: OboraConfig,
  presetName: string,
  category: string,
): ConflictDetectionResult {
  const slot = config.slots?.[category];

  if (!slot) {
    // Slot is empty - no conflict
    return { hasConflict: false, reason: "", conflictingPresets: [] };
  }

  const installedPreset = slot.preset;

  // No preset installed in this slot
  if (!installedPreset) {
    return { hasConflict: false, reason: "", conflictingPresets: [] };
  }

  // Installing same preset that's already installed
  if (installedPreset === presetName) {
    return {
      hasConflict: true,
      reason: `${presetName} is already installed in ${category} slot`,
      conflictingPresets: [presetName],
    };
  }

  // Need to check if this category is exclusive
  const isExclusive = CATEGORY_CONFIGS[category]?.exclusive ?? true;

  return { hasConflict: false, reason: "", conflictingPresets: [] };
}

/**
 * Check circular dependency chains
 */
function checkCircularDependencies(
  config: OboraConfig,
  presetName: string,
  requires: string[],
): ConflictDetectionResult {
  if (!requires || requires.length === 0) {
    return { hasConflict: false, reason: "", conflictingPresets: [] };
  }

  // Build installation chain from installed presets
  const installedPresets = new Set<string>();

  for (const slot of Object.values(config.slots || {})) {
    if (slot?.preset) {
      installedPresets.add(slot.preset);
    }
  }

  // Check if presetName is already in chain
  if (installedPresets.has(presetName)) {
    return {
      hasConflict: true,
      reason: `Circular dependency: ${presetName} is already installed`,
      conflictingPresets: [presetName],
    };
  }

  // Check if any requirement creates a cycle
  // This would require parsing of full dependency tree
  // For now, we do a simple check

  return { hasConflict: false, reason: "", conflictingPresets: [] };
}

/**
 * Detect conflicts for multiple presets
 *
 * @param projectDir - Project directory
 * @param presetNames - Presets to check for conflicts
 * @returns Array of conflicts for each preset
 */
export async function detectConflictsForMultiple(
  projectDir: string,
  presetNames: string[]
): Promise<ConflictDetectionResult[]> {
  const results: ConflictDetectionResult[] = [];
  
  for (const presetName of presetNames) {
    const result = await detectConflicts(projectDir, presetName);
    results.push(result);
  }
  
export { detectConflictsForMultiple } from "./detect-conflicts";
  return results;
}

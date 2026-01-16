/**
 * Preset Validator
 *
 * Re-exports from @obora/preset-engine configured with CLI settings
 */

import {
  createPresetValidator,
  displayValidationResults as _displayValidationResults,
  type SlotSelections,
  type ValidationResult,
} from "@obora/preset-engine";
import { PRESETS_DIR, PRESETS } from "./constants";
import { readJson, fileExists } from "./fs";

// Create validator instance with CLI configuration
const validator = createPresetValidator({
  presetsDir: PRESETS_DIR,
  presetRegistry: PRESETS,
  readJson,
  fileExists,
});

// Re-export configured functions
export const validateAndResolvePresets = validator.validateAndResolvePresets;
export const displayValidationResults = _displayValidationResults;

// Re-export types
export type { SlotSelections, ValidationResult };

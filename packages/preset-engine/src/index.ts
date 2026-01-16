/**
 * @obora/preset-engine
 *
 * Preset assembly and application engine for obora-kit
 */

// Types
export type {
  AppModuleInstance,
  AssemblyOptions,
  AssemblyResult,
  PresetManifest,
  PresetTargetConfig,
  InjectionConfig,
  EnvVar,
  DetectRule,
  RuntimeDetection,
  PresetSelection,
  SlotSelections,
  ValidationResult,
  PresetEngineConfig,
  AppModuleConfig,
  PresetInfo,
  CopyOptions,
} from "./types.js";

// Assembler
export { createPresetEngine } from "./assembler.js";

// Validator
export {
  createPresetValidator,
  displayValidationResults,
  type ValidatorConfig,
} from "./validator.js";

// File System Utilities
export {
  dirExists,
  fileExists,
  ensureDir,
  readJson,
  writeJson,
  applyReplacements,
  copyTemplateWithReplacements,
  removeGitkeepFiles,
  deepMerge,
  escapeRegExp,
  indentMultiline,
  dedupeLines,
} from "./fs-utils.js";

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
  // Transform types
  TransformType,
  TransformConfig,
  BaseTransformConfig,
  ImportTransformConfig,
  ExportTransformConfig,
  DependencyTransformConfig,
  NestJsModuleTransformConfig,
  ProviderWrapTransformConfig,
  JsonPropertyTransformConfig,
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

// Transform Validator
export {
  validateTransformConfigs,
  validateSingleTransform,
  formatTransformErrors,
  isValidTransformConfigArray,
  type TransformValidationError,
  type TransformValidationResult,
} from "./transform-validator.js";

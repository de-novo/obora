/**
 * @obora/preset-engine - Types
 */

// ============================================================================
// Assembly Types
// ============================================================================

export interface AppModuleInstance {
  name: string;
  module: string;
  targetDir: string;
}

export interface AssemblyOptions {
  base: string;
  projectName: string;
  targetDir: string;
  apps: AppModuleInstance[];
  presets: Record<string, { preset: string; version: string } | null>;
  packageManager: "pnpm" | "npm" | "yarn" | "bun";
  presetTargets?: Record<string, string>;
}

export interface AssemblyResult {
  postInstall: string[];
}

// ============================================================================
// Preset Manifest Types
// ============================================================================

export interface PresetManifest {
  name: string;
  category: string;
  description: string;
  scripts?: Record<string, string>;
  env?: EnvVar[];
  postInstall?: string[];
  common?: PresetTargetConfig;
  targets?: Record<string, PresetTargetConfig>;
  variants?: Record<string, PresetTargetConfig>;
  requires?: string[];
  conflicts?: string[];
  capabilities?: string[];
  requiresCapabilities?: string[];
  incompatibleCapabilities?: string[];
}

export interface PresetTargetConfig {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  files?: string[];
  remove?: string[];
  inject?: InjectionConfig[];
  env?: EnvVar[];
  postInstall?: string[];
  detect?: string[] | DetectRule;
}

export interface InjectionConfig {
  file: string;
  marker: string;
  content: string;
  order?: number;
}

export interface EnvVar {
  key: string;
  description: string;
  example?: string;
}

export interface DetectRule {
  packages?: string[];
  packageVersions?: Record<string, string>;
  runtime?: RuntimeDetection;
}

export interface RuntimeDetection {
  node?: string;
  bun?: boolean;
  deno?: boolean;
  packageManager?: "pnpm" | "yarn" | "npm" | "bun";
}

// ============================================================================
// Validation Types
// ============================================================================

export interface PresetSelection {
  preset: string;
  version: string;
}

export type SlotSelections = Record<string, PresetSelection | null>;

export interface ValidationResult {
  resolved: SlotSelections;
  added: Array<{ category: string; preset: string; requiredBy: string }>;
  conflicts: Array<{ preset1: string; preset2: string }>;
  missingCapabilities: Array<{ preset: string; capability: string }>;
  capabilityConflicts: Array<{ preset: string; capability: string; providedBy: string }>;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface PresetEngineConfig {
  templatesDir: string;
  presetsDir: string;
  appModules: Record<string, AppModuleConfig>;
  presetRegistry: Record<string, PresetInfo>;
  forbiddenFilePaths?: string[];
  presetAliases?: Record<string, string>;
}

export interface AppModuleConfig {
  name: string;
  description: string;
  features: string[];
  targetDir: string;
  requires?: string[];
  slots: string[];
}

export interface PresetInfo {
  name: string;
  category: string;
  description: string;
  version: string;
}

// ============================================================================
// Copy Options Types
// ============================================================================

export interface CopyOptions {
  overwrite?: boolean;
  logSkipped?: boolean;
  filter?: (relativePath: string, kind: "file" | "dir") => boolean;
  root?: string;
}

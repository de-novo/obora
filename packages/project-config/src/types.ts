/**
 * @obora/project-config - Types
 */

// ============================================================================
// Project Config Types (.obora/config.json)
// ============================================================================

export interface AppConfig {
  module: string;
  version: string;
  installedAt: string;
  path: string;
}

export interface SlotConfig {
  preset: string;
  version: string;
  installedAt: string;
  ejected?: boolean;
  ejectedAt?: string;
  ejectedFiles?: string[];
}

export interface PresetTargetHistoryEntry {
  target: string;
  source: "detect" | "manual" | "override" | "default" | "saved";
  reasonDetail?: string;
  changedAt: string;
}

export interface OboraConfig {
  $schema: string;
  version: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  apps: Record<string, AppConfig>;
  slots: Record<string, SlotConfig | null>;
  presetTargets?: Record<string, string>;
  presetTargetHistory?: Record<string, PresetTargetHistoryEntry[]>;
  packageManager: PackageManager;
}

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

// ============================================================================
// Preset Lockfile Types (.obora/presets.lock.json)
// ============================================================================

export interface PresetLockfileEntry {
  preset: string;
  version: string;
  target?: string;
}

export interface PresetLockfile {
  version: string;
  generatedAt: string;
  base: string;
  packageManager: PackageManager;
  apps: Record<string, AppConfig>;
  presets: Record<string, PresetLockfileEntry>;
}

// ============================================================================
// History Types (.obora/history.json)
// ============================================================================

export type HistoryAction =
  | "create"
  | "add"
  | "remove"
  | "upgrade"
  | "add-app"
  | "remove-app"
  | "eject";

export interface HistoryEntry {
  action: HistoryAction;
  target?: string;
  module?: string;
  preset?: string;
  fromVersion?: string;
  toVersion?: string;
  timestamp: string;
}

export interface OboraHistory {
  entries: HistoryEntry[];
}

// ============================================================================
// Global Config Types (~/.obora/)
// ============================================================================

export interface RegisteredProject {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  isFavorite: boolean;
}

export interface ProjectRegistrationOptions {
  description?: string;
  color?: string;
}

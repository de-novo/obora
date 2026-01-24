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
  source: "detect" | "manual" | "override" | "default" | "saved" | "app-module";
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
// Undo Types (.obora/backups/)
// ============================================================================

/**
 * File backup for undo operation
 */
export interface FileBackup {
  /** Absolute or relative path to the file */
  path: string;
  /** Original content (null if file didn't exist before) */
  content: string | null;
}

/**
 * Config changes that can be reverted
 */
export interface UndoConfigChanges {
  /** Slot that was modified */
  slot?: string;
  /** Preset that was added/modified */
  preset?: string;
  /** Previous slot configuration (null if slot was empty) */
  previousSlotConfig?: SlotConfig | null;
  /** Previous preset target */
  previousPresetTarget?: string;
}

/**
 * Data required to undo an operation
 */
export interface UndoData {
  /** Unique backup identifier */
  backupId: string;
  /** Files that were created (to delete on undo) */
  addedFiles?: string[];
  /** Dependencies that were added (package names) */
  addedDependencies?: string[];
  /** Config changes to revert */
  configChanges?: UndoConfigChanges;
}

/**
 * Extended history entry with undo support
 */
export interface HistoryEntryWithUndo extends HistoryEntry {
  /** Undo data (if operation is undoable) */
  undoData?: UndoData;
}

/**
 * Backup manifest stored in .obora/backups/<id>/manifest.json
 */
export interface BackupManifest {
  /** Backup ID */
  id: string;
  /** When the backup was created */
  createdAt: string;
  /** Related history action */
  action: HistoryAction;
  /** Files included in backup */
  files: string[];
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

// ============================================================================
// Global Preferences Types (~/.obora/dashboard.db preferences table)
// ============================================================================

export interface GlobalPreferences {
  /** Default package manager for new projects */
  packageManager?: PackageManager;
  /** Default project structure */
  defaultBase?: "single" | "monorepo";
  /** Preferred presets to pre-select */
  preferredPresets?: string[];
  /** Enable/disable telemetry */
  telemetry?: boolean;
  /** Default apps for monorepo projects */
  defaultApps?: string[];
}

export type GlobalPreferenceKey = keyof GlobalPreferences;

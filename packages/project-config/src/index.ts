/**
 * @obora/project-config
 *
 * Project and global configuration management for obora-kit.
 */

// Types
export type {
  AppConfig,
  SlotConfig,
  OboraConfig,
  PresetLockfile,
  PresetLockfileEntry,
  HistoryEntry,
  HistoryEntryWithUndo,
  HistoryAction,
  OboraHistory,
  PackageManager,
  PresetTargetHistoryEntry,
  RegisteredProject,
  ProjectRegistrationOptions,
  GlobalPreferences,
  GlobalPreferenceKey,
  // Undo types
  FileBackup,
  UndoData,
  UndoConfigChanges,
  BackupManifest,
} from "./types.js";

// Project Config (local .obora/)
export {
  // Path functions
  getConfigDir,
  getConfigPath,
  getHistoryPath,
  getPresetLockPath,
  hasOboraConfig,
  // Config operations
  readOboraConfig,
  writeOboraConfig,
  // Lockfile operations
  createPresetLockfileSnapshot,
  writePresetLockfile,
  readPresetLockfile,
  updatePresetLockfile,
  // Initial config
  createInitialConfig,
  defaultAppPathResolver,
  type AppPathResolver,
  type CreateConfigAppsInput,
  type CreateConfigSlotsInput,
  // History operations
  readOboraHistory,
  addHistoryEntry,
  // App operations
  addApp,
  removeApp,
  // Slot operations
  addSlotPreset,
  removeSlotPreset,
  upgradeSlotPreset,
  // Preset target operations
  setPresetTarget,
  // Query helpers
  getInstalledApps,
  getInstalledPresets,
  // Backup operations
  getBackupsDir,
  getBackupPath,
  generateBackupId,
  saveBackups,
  loadBackups,
  deleteBackup,
  getBackupManifest,
  addHistoryEntryWithUndo,
  getLastUndoableEntry,
  removeHistoryEntry,
} from "./project-config.js";

// Global Config (~/.obora/)
export {
  getOboraDir,
  getDashboardDbPath,
  initializeGlobalConfig,
  getGlobalDb,
  registerProject,
  getRegisteredProjects,
  resetGlobalConfigState,
  // Global Preferences
  getPreference,
  setPreference,
  getAllPreferences,
  setPreferences,
  deletePreference,
  clearAllPreferences,
} from "./global-config.js";

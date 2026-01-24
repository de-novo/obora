/**
 * @obora/project-config - Project Configuration
 *
 * Manages .obora/ directory and config files for individual projects.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "pathe";
import type {
  AppConfig,
  SlotConfig,
  OboraConfig,
  PresetLockfile,
  PresetLockfileEntry,
  HistoryEntry,
  HistoryEntryWithUndo,
  OboraHistory,
  PackageManager,
  FileBackup,
  UndoData,
  BackupManifest,
} from "./types.js";

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = ".obora";
const CONFIG_FILE = "config.json";
const HISTORY_FILE = "history.json";
const PRESET_LOCK_FILE = "presets.lock.json";
const SCHEMA_URL = "https://obora.dev/schema/config.json";
const CONFIG_VERSION = "2.0.0";

// ============================================================================
// Path Functions
// ============================================================================

export function getConfigDir(projectPath: string): string {
  return join(projectPath, CONFIG_DIR);
}

export function getConfigPath(projectPath: string): string {
  return join(getConfigDir(projectPath), CONFIG_FILE);
}

export function getHistoryPath(projectPath: string): string {
  return join(getConfigDir(projectPath), HISTORY_FILE);
}

export function getPresetLockPath(projectPath: string): string {
  return join(getConfigDir(projectPath), PRESET_LOCK_FILE);
}

export function hasOboraConfig(projectPath: string): boolean {
  return existsSync(getConfigPath(projectPath));
}

// ============================================================================
// Config Operations
// ============================================================================

export async function readOboraConfig(
  projectPath: string
): Promise<OboraConfig | null> {
  const configPath = getConfigPath(projectPath);

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = await readFile(configPath, "utf-8");
    return JSON.parse(content) as OboraConfig;
  } catch {
    return null;
  }
}

export async function writeOboraConfig(
  projectPath: string,
  config: OboraConfig
): Promise<void> {
  const configDir = getConfigDir(projectPath);
  const configPath = getConfigPath(projectPath);

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  config.updatedAt = new Date().toISOString();

  await writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

function sortRecord<T>(record: Record<string, T>): Record<string, T> {
  const sorted: Record<string, T> = {};
  for (const key of Object.keys(record).sort()) {
    sorted[key] = record[key];
  }
  return sorted;
}

// ============================================================================
// Lockfile Operations
// ============================================================================

export function createPresetLockfileSnapshot(
  config: OboraConfig
): PresetLockfile {
  const presets: Record<string, PresetLockfileEntry> = {};
  for (const [slot, slotConfig] of Object.entries(config.slots)) {
    if (!slotConfig) continue;
    const target = config.presetTargets?.[slotConfig.preset];
    presets[slot] = {
      preset: slotConfig.preset,
      version: slotConfig.version,
      ...(target ? { target } : {}),
    };
  }

  return {
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    base: config.base,
    packageManager: config.packageManager,
    apps: sortRecord(config.apps),
    presets: sortRecord(presets),
  };
}

export async function writePresetLockfile(
  projectPath: string,
  lockfile: PresetLockfile
): Promise<void> {
  const configDir = getConfigDir(projectPath);
  const lockPath = getPresetLockPath(projectPath);
  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }
  await writeFile(lockPath, JSON.stringify(lockfile, null, 2), "utf-8");
}

export async function readPresetLockfile(
  projectPath: string
): Promise<PresetLockfile | null> {
  const lockPath = getPresetLockPath(projectPath);
  if (!existsSync(lockPath)) {
    return null;
  }
  try {
    const content = await readFile(lockPath, "utf-8");
    return JSON.parse(content) as PresetLockfile;
  } catch {
    return null;
  }
}

export async function updatePresetLockfile(
  projectPath: string,
  config?: OboraConfig | null
): Promise<void> {
  const resolvedConfig = config ?? (await readOboraConfig(projectPath));
  if (!resolvedConfig) return;
  await writePresetLockfile(
    projectPath,
    createPresetLockfileSnapshot(resolvedConfig)
  );
}

// ============================================================================
// Initial Config Creation
// ============================================================================

export interface CreateConfigAppsInput {
  module: string;
  version: string;
  path?: string;
}

export interface CreateConfigSlotsInput {
  preset: string;
  version: string;
}

/**
 * App path resolver - can be injected for custom behavior
 */
export type AppPathResolver = (
  projectPath: string,
  base: string,
  appName: string,
  module: string
) => string;

/**
 * Default app path resolver
 */
export function defaultAppPathResolver(
  projectPath: string,
  base: string,
  appName: string,
  module: string
): string {
  if (base === "single") {
    return projectPath;
  }
  if (module === "shared-database" || module === "shared-ui") {
    return join(projectPath, "packages", appName);
  }
  return join(projectPath, "apps", appName);
}

export function createInitialConfig(
  projectPath: string,
  base: string,
  packageManager: PackageManager,
  apps: Record<string, CreateConfigAppsInput>,
  slots: Record<string, CreateConfigSlotsInput | null>,
  resolveAppPath: AppPathResolver = defaultAppPathResolver
): OboraConfig {
  const now = new Date().toISOString();

  const appsConfig: Record<string, AppConfig> = {};
  for (const [appName, appValue] of Object.entries(apps)) {
    const appPath =
      appValue.path || resolveAppPath(projectPath, base, appName, appValue.module);
    appsConfig[appName] = {
      module: appValue.module,
      version: appValue.version,
      installedAt: now,
      path: appPath,
    };
  }

  const slotsConfig: Record<string, SlotConfig | null> = {};
  for (const [slotName, slotValue] of Object.entries(slots)) {
    if (slotValue) {
      slotsConfig[slotName] = {
        preset: slotValue.preset,
        version: slotValue.version,
        installedAt: now,
      };
    } else {
      slotsConfig[slotName] = null;
    }
  }

  return {
    $schema: SCHEMA_URL,
    version: CONFIG_VERSION,
    base,
    createdAt: now,
    updatedAt: now,
    apps: appsConfig,
    slots: slotsConfig,
    presetTargets: {},
    presetTargetHistory: {},
    packageManager,
  };
}

// ============================================================================
// History Operations
// ============================================================================

export async function readOboraHistory(
  projectPath: string
): Promise<OboraHistory> {
  const historyPath = getHistoryPath(projectPath);

  if (!existsSync(historyPath)) {
    return { entries: [] };
  }

  try {
    const content = await readFile(historyPath, "utf-8");
    return JSON.parse(content) as OboraHistory;
  } catch {
    return { entries: [] };
  }
}

export async function addHistoryEntry(
  projectPath: string,
  entry: Omit<HistoryEntry, "timestamp">
): Promise<void> {
  const configDir = getConfigDir(projectPath);
  const historyPath = getHistoryPath(projectPath);

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  const history = await readOboraHistory(projectPath);

  history.entries.push({
    ...entry,
    timestamp: new Date().toISOString(),
  });

  await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
}

// ============================================================================
// App Operations
// ============================================================================

export async function addApp(
  projectPath: string,
  appName: string,
  module: string,
  version: string,
  appPath?: string,
  resolveAppPath: AppPathResolver = defaultAppPathResolver
): Promise<void> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  const now = new Date().toISOString();

  config.apps[appName] = {
    module,
    version,
    installedAt: now,
    path: appPath || resolveAppPath(projectPath, config.base, appName, module),
  };

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);
  await addHistoryEntry(projectPath, {
    action: "add-app",
    target: appName,
    module,
    toVersion: version,
  });
}

export async function removeApp(
  projectPath: string,
  appName: string
): Promise<AppConfig | null> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  const previousConfig = config.apps[appName];
  delete config.apps[appName];

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);

  if (previousConfig) {
    await addHistoryEntry(projectPath, {
      action: "remove-app",
      target: appName,
      module: previousConfig.module,
      fromVersion: previousConfig.version,
    });
  }

  return previousConfig || null;
}

// ============================================================================
// Slot Operations
// ============================================================================

export async function addSlotPreset(
  projectPath: string,
  slot: string,
  preset: string,
  version: string
): Promise<void> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  const now = new Date().toISOString();

  config.slots[slot] = {
    preset,
    version,
    installedAt: now,
  };

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);
  await addHistoryEntry(projectPath, {
    action: "add",
    target: slot,
    preset,
    toVersion: version,
  });
}

export async function removeSlotPreset(
  projectPath: string,
  slot: string
): Promise<SlotConfig | null> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  const previousConfig = config.slots[slot];
  config.slots[slot] = null;
  if (previousConfig?.preset && config.presetTargets) {
    delete config.presetTargets[previousConfig.preset];
    if (Object.keys(config.presetTargets).length === 0) {
      delete config.presetTargets;
    }
  }
  if (previousConfig?.preset && config.presetTargetHistory) {
    delete config.presetTargetHistory[previousConfig.preset];
    if (Object.keys(config.presetTargetHistory).length === 0) {
      delete config.presetTargetHistory;
    }
  }

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);

  if (previousConfig) {
    await addHistoryEntry(projectPath, {
      action: "remove",
      target: slot,
      preset: previousConfig.preset,
      fromVersion: previousConfig.version,
    });
  }

  return previousConfig;
}

export async function upgradeSlotPreset(
  projectPath: string,
  slot: string,
  newVersion: string
): Promise<void> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  const currentSlot = config.slots[slot];

  if (!currentSlot) {
    throw new Error(`Slot "${slot}" is not installed`);
  }

  const fromVersion = currentSlot.version;
  currentSlot.version = newVersion;

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);
  await addHistoryEntry(projectPath, {
    action: "upgrade",
    target: slot,
    preset: currentSlot.preset,
    fromVersion,
    toVersion: newVersion,
  });
}

// ============================================================================
// Preset Target Operations
// ============================================================================

export async function setPresetTarget(
  projectPath: string,
  preset: string,
  target: string,
  source: "detect" | "manual" | "override" | "default" | "saved" | "app-module",
  reasonDetail?: string
): Promise<void> {
  const config = await readOboraConfig(projectPath);

  if (!config) {
    throw new Error("No obora config found. Is this an obora project?");
  }

  config.presetTargets = config.presetTargets || {};
  const previous = config.presetTargets[preset];
  config.presetTargets[preset] = target;
  if (previous !== target) {
    config.presetTargetHistory = config.presetTargetHistory || {};
    config.presetTargetHistory[preset] = config.presetTargetHistory[preset] || [];
    config.presetTargetHistory[preset].push({
      target,
      source,
      reasonDetail,
      changedAt: new Date().toISOString(),
    });
  }

  await writeOboraConfig(projectPath, config);
  await updatePresetLockfile(projectPath, config);
}

// ============================================================================
// Query Helpers
// ============================================================================

export function getInstalledApps(config: OboraConfig): Record<string, string> {
  const installed: Record<string, string> = {};

  for (const [appName, appConfig] of Object.entries(config.apps)) {
    installed[appName] = appConfig.module;
  }

  return installed;
}

export function getInstalledPresets(
  config: OboraConfig
): Record<string, string> {
  const installed: Record<string, string> = {};

  for (const [slot, slotConfig] of Object.entries(config.slots)) {
    if (slotConfig) {
      installed[slot] = slotConfig.preset;
    }
  }

  return installed;
}

// ============================================================================
// Backup Operations
// ============================================================================

const BACKUPS_DIR = "backups";

/**
 * Get the backups directory path
 */
export function getBackupsDir(projectPath: string): string {
  return join(getConfigDir(projectPath), BACKUPS_DIR);
}

/**
 * Get the path for a specific backup
 */
export function getBackupPath(projectPath: string, backupId: string): string {
  return join(getBackupsDir(projectPath), backupId);
}

/**
 * Generate a unique backup ID
 */
export function generateBackupId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

/**
 * Save file backups to disk
 */
export async function saveBackups(
  projectPath: string,
  backupId: string,
  backups: FileBackup[],
  action: HistoryEntry["action"]
): Promise<void> {
  const backupDir = getBackupPath(projectPath, backupId);

  // Create backup directory
  await mkdir(backupDir, { recursive: true });

  // Save each backup file
  const files: string[] = [];
  for (let i = 0; i < backups.length; i++) {
    const backup = backups[i];
    const fileName = `${i}.backup`;
    const metaFileName = `${i}.meta.json`;

    // Save file content (if it existed)
    if (backup.content !== null) {
      await writeFile(join(backupDir, fileName), backup.content, "utf-8");
    }

    // Save metadata (path and whether file existed)
    await writeFile(
      join(backupDir, metaFileName),
      JSON.stringify({
        path: backup.path,
        existed: backup.content !== null,
      }),
      "utf-8"
    );

    files.push(backup.path);
  }

  // Save manifest
  const manifest: BackupManifest = {
    id: backupId,
    createdAt: new Date().toISOString(),
    action,
    files,
  };

  await writeFile(
    join(backupDir, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf-8"
  );
}

/**
 * Load backups from disk
 */
export async function loadBackups(
  projectPath: string,
  backupId: string
): Promise<FileBackup[]> {
  const backupDir = getBackupPath(projectPath, backupId);
  const backups: FileBackup[] = [];

  if (!existsSync(backupDir)) {
    return backups;
  }

  // Read manifest to get file count
  const manifestPath = join(backupDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return backups;
  }

  const manifestContent = await readFile(manifestPath, "utf-8");
  const manifest = JSON.parse(manifestContent) as BackupManifest;

  // Load each backup
  for (let i = 0; i < manifest.files.length; i++) {
    const metaPath = join(backupDir, `${i}.meta.json`);
    const backupPath = join(backupDir, `${i}.backup`);

    if (!existsSync(metaPath)) continue;

    const metaContent = await readFile(metaPath, "utf-8");
    const meta = JSON.parse(metaContent) as { path: string; existed: boolean };

    let content: string | null = null;
    if (meta.existed && existsSync(backupPath)) {
      content = await readFile(backupPath, "utf-8");
    }

    backups.push({
      path: meta.path,
      content,
    });
  }

  return backups;
}

/**
 * Delete backup directory
 */
export async function deleteBackup(
  projectPath: string,
  backupId: string
): Promise<void> {
  const backupDir = getBackupPath(projectPath, backupId);

  if (!existsSync(backupDir)) {
    return;
  }

  // Read directory contents and delete files
  const { readdir, unlink, rmdir } = await import("node:fs/promises");
  const files = await readdir(backupDir);

  for (const file of files) {
    await unlink(join(backupDir, file));
  }

  await rmdir(backupDir);
}

/**
 * Get backup manifest
 */
export async function getBackupManifest(
  projectPath: string,
  backupId: string
): Promise<BackupManifest | null> {
  const manifestPath = join(getBackupPath(projectPath, backupId), "manifest.json");

  if (!existsSync(manifestPath)) {
    return null;
  }

  try {
    const content = await readFile(manifestPath, "utf-8");
    return JSON.parse(content) as BackupManifest;
  } catch {
    return null;
  }
}

/**
 * Add history entry with undo data
 */
export async function addHistoryEntryWithUndo(
  projectPath: string,
  entry: Omit<HistoryEntryWithUndo, "timestamp">
): Promise<void> {
  const configDir = getConfigDir(projectPath);
  const historyPath = getHistoryPath(projectPath);

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true });
  }

  const history = await readOboraHistory(projectPath);

  history.entries.push({
    ...entry,
    timestamp: new Date().toISOString(),
  } as HistoryEntry);

  await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
}

/**
 * Get the last undoable history entry
 */
export async function getLastUndoableEntry(
  projectPath: string
): Promise<HistoryEntryWithUndo | null> {
  const history = await readOboraHistory(projectPath);

  // Search from the end for an entry with undoData
  for (let i = history.entries.length - 1; i >= 0; i--) {
    const entry = history.entries[i] as HistoryEntryWithUndo;
    if (entry.undoData) {
      return entry;
    }
  }

  return null;
}

/**
 * Remove an entry from history (after successful undo)
 */
export async function removeHistoryEntry(
  projectPath: string,
  timestamp: string
): Promise<void> {
  const historyPath = getHistoryPath(projectPath);
  const history = await readOboraHistory(projectPath);

  history.entries = history.entries.filter(
    (entry) => entry.timestamp !== timestamp
  );

  await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
}

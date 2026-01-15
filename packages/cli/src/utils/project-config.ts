import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { APP_MODULES } from "./constants";

// ============================================================================
// Types
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

export interface OboraConfig {
  $schema: string;
  version: string;
  base: string;
  createdAt: string;
  updatedAt: string;
  apps: Record<string, AppConfig>;
  slots: Record<string, SlotConfig | null>;
  presetTargets?: Record<string, string>;
  presetTargetHistory?: Record<
    string,
    Array<{
      target: string;
      source: "detect" | "manual" | "override" | "default" | "saved";
      reasonDetail?: string;
      changedAt: string;
    }>
  >;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
}

export interface HistoryEntry {
  action: "create" | "add" | "remove" | "upgrade" | "add-app" | "remove-app" | "eject";
  target?: string; // app name or slot name
  module?: string; // for app actions
  preset?: string; // for slot actions
  fromVersion?: string;
  toVersion?: string;
  timestamp: string;
}

export interface OboraHistory {
  entries: HistoryEntry[];
}

// ============================================================================
// Constants
// ============================================================================

const CONFIG_DIR = ".obora";
const CONFIG_FILE = "config.json";
const HISTORY_FILE = "history.json";
const SCHEMA_URL = "https://obora.dev/schema/config.json";
const CONFIG_VERSION = "2.0.0"; // Updated for new schema

// ============================================================================
// Config Operations
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

export function hasOboraConfig(projectPath: string): boolean {
  return existsSync(getConfigPath(projectPath));
}

export async function readOboraConfig(projectPath: string): Promise<OboraConfig | null> {
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

/**
 * Create initial obora config for a new project
 */
export function createInitialConfig(
  projectPath: string,
  base: string,
  packageManager: OboraConfig["packageManager"],
  apps: Record<string, { module: string; version: string; path?: string }>,
  slots: Record<string, { preset: string; version: string } | null>
): OboraConfig {
  const now = new Date().toISOString();

  const appsConfig: Record<string, AppConfig> = {};
  for (const [appName, appValue] of Object.entries(apps)) {
    const appPath = appValue.path || resolveAppPath(projectPath, base, appName, appValue.module);
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

export async function readOboraHistory(projectPath: string): Promise<OboraHistory> {
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
  appPath?: string
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
  await addHistoryEntry(projectPath, {
    action: "add-app",
    target: appName,
    module,
    toVersion: version,
  });
}

function resolveAppPath(
  projectPath: string,
  base: string,
  appName: string,
  module: string
): string {
  const moduleConfig = APP_MODULES[module as keyof typeof APP_MODULES];
  if (base === "single") {
    return projectPath;
  }
  if (moduleConfig?.targetDir) {
    const root = moduleConfig.targetDir.split("/")[0];
    if (root === "packages") {
      return join(projectPath, "packages", appName);
    }
    if (root === "apps") {
      return join(projectPath, "apps", appName);
    }
  }
  if (module === "shared-database" || module === "shared-ui") {
    return join(projectPath, "packages", appName);
  }
  return join(projectPath, "apps", appName);
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
  source: "detect" | "manual" | "override" | "default" | "saved",
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

export function getInstalledPresets(config: OboraConfig): Record<string, string> {
  const installed: Record<string, string> = {};

  for (const [slot, slotConfig] of Object.entries(config.slots)) {
    if (slotConfig) {
      installed[slot] = slotConfig.preset;
    }
  }

  return installed;
}

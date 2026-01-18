import { existsSync, promises as fs } from "node:fs";
import { join, dirname } from "pathe";
import { fileURLToPath } from "node:url";
import { consola } from "consola";

/**
 * Get the path to the CLI package root
 */
function getPackageRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  // From dist/utils/skills.mjs -> ../..
  return join(__dirname, "..", "..");
}

/**
 * Get the path to bundled skills directory
 */
export function getSkillsSourcePath(): string {
  return join(getPackageRoot(), "skills");
}

/**
 * Get the path to bundled agents directory
 */
export function getAgentsSourcePath(): string {
  return join(getPackageRoot(), "agents");
}

/**
 * Get the path to bundled rules directory
 */
export function getRulesSourcePath(): string {
  return join(getPackageRoot(), "rules");
}

/**
 * Get the path to bundled commands directory
 */
export function getCommandsSourcePath(): string {
  return join(getPackageRoot(), "commands");
}

/**
 * Get the path to bundled scripts directory
 */
export function getScriptsSourcePath(): string {
  return join(getPackageRoot(), "scripts");
}

/**
 * Get the path to bundled settings.json
 */
export function getSettingsSourcePath(): string {
  return join(getPackageRoot(), "settings.json");
}

/**
 * Copy a directory recursively
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export interface SyncOptions {
  force?: boolean;
  silent?: boolean;
}

export interface SyncResult {
  copied: string[];
  skipped: string[];
  errors: string[];
}

/**
 * Sync a directory from source to target
 */
async function syncDirectory(
  sourcePath: string,
  targetPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { force = false, silent = false } = options;

  const result: SyncResult = {
    copied: [],
    skipped: [],
    errors: [],
  };

  if (!existsSync(sourcePath)) {
    if (!silent) {
      consola.warn(`Source not found: ${sourcePath}`);
    }
    result.errors.push("Source not found");
    return result;
  }

  // Create target directory
  await fs.mkdir(targetPath, { recursive: true });

  // Get list of items
  const items = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const item of items) {
    const itemName = item.name;
    const srcPath = join(sourcePath, itemName);
    const destPath = join(targetPath, itemName);

    try {
      if (existsSync(destPath) && !force) {
        result.skipped.push(itemName);
        continue;
      }

      // Remove existing if force
      if (existsSync(destPath) && force) {
        if (item.isDirectory()) {
          await fs.rm(destPath, { recursive: true });
        } else {
          await fs.unlink(destPath);
        }
      }

      // Copy
      if (item.isDirectory()) {
        await copyDir(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
      result.copied.push(itemName);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`${itemName}: ${message}`);
      if (!silent) {
        consola.error(`Failed to copy ${itemName}: ${message}`);
      }
    }
  }

  return result;
}

/**
 * Sync obora skills to target project
 */
export async function syncSkills(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const skillsSource = getSkillsSourcePath();
  const skillsTarget = join(projectPath, ".claude", "skills", "obora");
  return syncDirectory(skillsSource, skillsTarget, options);
}

/**
 * Sync obora agents to target project
 */
export async function syncAgents(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const agentsSource = getAgentsSourcePath();
  const agentsTarget = join(projectPath, ".claude", "agents", "obora");
  return syncDirectory(agentsSource, agentsTarget, options);
}

/**
 * Sync obora rules to target project
 */
export async function syncRules(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const rulesSource = getRulesSourcePath();
  const rulesTarget = join(projectPath, ".claude", "rules");
  return syncDirectory(rulesSource, rulesTarget, options);
}

/**
 * Sync obora commands to target project
 */
export async function syncCommands(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const commandsSource = getCommandsSourcePath();
  const commandsTarget = join(projectPath, ".claude", "commands");
  return syncDirectory(commandsSource, commandsTarget, options);
}

/**
 * Sync obora scripts to target project
 */
export async function syncScripts(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const scriptsSource = getScriptsSourcePath();
  const scriptsTarget = join(projectPath, ".claude", "scripts");
  return syncDirectory(scriptsSource, scriptsTarget, options);
}

/**
 * Sync settings.json (merge hooks, don't overwrite)
 */
export async function syncSettings(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { force = false, silent = false } = options;

  const result: SyncResult = {
    copied: [],
    skipped: [],
    errors: [],
  };

  const settingsSource = getSettingsSourcePath();
  const settingsTarget = join(projectPath, ".claude", "settings.json");

  if (!existsSync(settingsSource)) {
    result.errors.push("settings.json source not found");
    return result;
  }

  try {
    // Create .claude directory if not exists
    await fs.mkdir(join(projectPath, ".claude"), { recursive: true });

    // Read source settings
    const sourceContent = await fs.readFile(settingsSource, "utf-8");
    const sourceSettings = JSON.parse(sourceContent);

    if (existsSync(settingsTarget) && !force) {
      // Merge with existing settings
      const targetContent = await fs.readFile(settingsTarget, "utf-8");
      const targetSettings = JSON.parse(targetContent);

      // Merge hooks (add obora hooks, keep existing)
      const mergedSettings = {
        ...targetSettings,
        hooks: {
          ...sourceSettings.hooks,
          ...targetSettings.hooks,
        },
      };

      await fs.writeFile(
        settingsTarget,
        JSON.stringify(mergedSettings, null, 2),
        "utf-8"
      );
      result.copied.push("settings.json (merged)");
    } else {
      // Create new or force overwrite
      await fs.writeFile(settingsTarget, sourceContent, "utf-8");
      result.copied.push("settings.json");
    }

    if (!silent) {
      consola.success("Synced settings.json");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(`settings.json: ${message}`);
    if (!silent) {
      consola.error(`Failed to sync settings.json: ${message}`);
    }
  }

  return result;
}

/**
 * Make scripts executable
 */
async function makeScriptsExecutable(projectPath: string): Promise<void> {
  const scriptsPath = join(projectPath, ".claude", "scripts");
  if (!existsSync(scriptsPath)) return;

  async function setExecutable(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await setExecutable(fullPath);
      } else if (entry.name.endsWith(".sh")) {
        await fs.chmod(fullPath, 0o755);
      }
    }
  }

  await setExecutable(scriptsPath);
}

export interface SyncAllResult {
  skills: SyncResult;
  agents: SyncResult;
  rules: SyncResult;
  commands: SyncResult;
  scripts: SyncResult;
  settings: SyncResult;
}

/**
 * Sync all obora assets to target project
 */
export async function syncAll(
  projectPath: string,
  options: SyncOptions = {}
): Promise<SyncAllResult> {
  const { silent = false } = options;

  if (!silent) {
    consola.info("Syncing obora assets...");
  }

  const [skills, agents, rules, commands, scripts, settings] = await Promise.all([
    syncSkills(projectPath, { ...options, silent: true }),
    syncAgents(projectPath, { ...options, silent: true }),
    syncRules(projectPath, { ...options, silent: true }),
    syncCommands(projectPath, { ...options, silent: true }),
    syncScripts(projectPath, { ...options, silent: true }),
    syncSettings(projectPath, { ...options, silent: true }),
  ]);

  // Make scripts executable
  await makeScriptsExecutable(projectPath);

  if (!silent) {
    const totalCopied =
      skills.copied.length +
      agents.copied.length +
      rules.copied.length +
      commands.copied.length +
      scripts.copied.length +
      settings.copied.length;

    const totalSkipped =
      skills.skipped.length +
      agents.skipped.length +
      rules.skipped.length +
      commands.skipped.length +
      scripts.skipped.length +
      settings.skipped.length;

    // Print summary by category
    if (skills.copied.length > 0) {
      consola.success(`Skills: ${skills.copied.length} copied`);
    }
    if (agents.copied.length > 0) {
      consola.success(`Agents: ${agents.copied.length} copied`);
    }
    if (rules.copied.length > 0) {
      consola.success(`Rules: ${rules.copied.length} copied`);
    }
    if (commands.copied.length > 0) {
      consola.success(`Commands: ${commands.copied.length} copied`);
    }
    if (scripts.copied.length > 0) {
      consola.success(`Scripts: ${scripts.copied.length} copied`);
    }
    if (settings.copied.length > 0) {
      consola.success(`Settings: merged`);
    }

    if (totalSkipped > 0) {
      consola.info(`Skipped: ${totalSkipped} items (already exist, use --force to overwrite)`);
    }

    if (totalCopied === 0 && totalSkipped > 0) {
      consola.info("All assets already up to date");
    }
  }

  return { skills, agents, rules, commands, scripts, settings };
}

/**
 * List available skills from the source
 */
export async function listAvailableSkills(): Promise<string[]> {
  const skillsSource = getSkillsSourcePath();
  if (!existsSync(skillsSource)) return [];

  const entries = await fs.readdir(skillsSource, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * List available agents from the source
 */
export async function listAvailableAgents(): Promise<string[]> {
  const agentsSource = getAgentsSourcePath();
  if (!existsSync(agentsSource)) return [];

  const entries = await fs.readdir(agentsSource, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() || e.name.endsWith(".md")).map((e) => e.name);
}

/**
 * List installed skills in a project
 */
export async function listInstalledSkills(projectPath: string): Promise<string[]> {
  const skillsPath = join(projectPath, ".claude", "skills", "obora");
  if (!existsSync(skillsPath)) return [];

  const entries = await fs.readdir(skillsPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

/**
 * List installed agents in a project
 */
export async function listInstalledAgents(projectPath: string): Promise<string[]> {
  const agentsPath = join(projectPath, ".claude", "agents", "obora");
  if (!existsSync(agentsPath)) return [];

  const entries = await fs.readdir(agentsPath, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory() || e.name.endsWith(".md")).map((e) => e.name);
}

import { defineCommand } from "citty";
import { consola } from "consola";
import { resolve } from "pathe";
import prompts from "prompts";
import {
  hasOboraConfig,
  readOboraConfig,
  writeOboraConfig,
  getLastUndoableEntry,
  removeHistoryEntry,
  deleteBackup,
  loadBackups,
  type HistoryEntryWithUndo,
} from "../utils/project-config";
import { Errors, showError } from "../utils/errors";
import { fileExists } from "../utils/fs";
import { promises as fs } from "node:fs";

// ============================================================================
// Command
// ============================================================================

export const undoCommand = defineCommand({
  meta: {
    name: "undo",
    description: "Undo the last preset installation",
  },
  args: {
    dir: {
      type: "string",
      alias: "d",
      description: "Target directory (default: current directory)",
      default: ".",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompts",
      default: false,
    },
    "delete-files": {
      type: "boolean",
      description: "Also delete added files (use with caution)",
      default: false,
    },
  },
  async run({ args }) {
    const projectDir = resolve(args.dir);

    // Check if it's an obora project
    if (!hasOboraConfig(projectDir)) {
      showError(Errors.projectNotInitialized(projectDir));
      process.exit(1);
    }

    // Get the last undoable entry
    const lastEntry = await getLastUndoableEntry(projectDir);

    if (!lastEntry) {
      consola.info("No undoable operations found.");
      consola.info("Only preset 'add' operations can be undone.");
      return;
    }

    // Show what will be undone
    consola.box(
      `Last operation:\n` +
      `  Action: ${lastEntry.action}\n` +
      `  Preset: ${lastEntry.preset || "N/A"}\n` +
      `  Target: ${lastEntry.target || "N/A"}\n` +
      `  Time: ${new Date(lastEntry.timestamp).toLocaleString()}`
    );

    // Confirm unless --yes flag
    if (!args.yes) {
      const { confirm } = await prompts({
        type: "confirm",
        name: "confirm",
        message: "Do you want to undo this operation?",
        initial: false,
      });

      if (!confirm) {
        consola.info("Cancelled.");
        return;
      }
    }

    try {
      // Read current config
      const config = await readOboraConfig(projectDir);
      if (!config) {
        showError(Errors.configNotFound(projectDir));
        process.exit(1);
      }

      const undoData = lastEntry.undoData;
      if (!undoData) {
        consola.error("No undo data available for this operation.");
        return;
      }

      // Restore config changes
      if (undoData.configChanges) {
        const { slot, preset, previousSlotConfig, previousPresetTarget } = undoData.configChanges;

        if (slot) {
          // Restore previous slot configuration
          if (previousSlotConfig === null) {
            // Slot was empty before - remove it
            config.slots[slot] = null;
          } else if (previousSlotConfig) {
            // Restore previous preset in slot
            config.slots[slot] = previousSlotConfig;
          }
        }

        if (preset && config.presetTargets) {
          if (previousPresetTarget) {
            config.presetTargets[preset] = previousPresetTarget;
          } else {
            delete config.presetTargets[preset];
          }
        }

        // Update the config timestamp
        config.updatedAt = new Date().toISOString();

        // Write updated config
        await writeOboraConfig(projectDir, config);
        consola.success("Restored configuration");
      }

      // Handle file restoration from backups
      if (undoData.backupId) {
        const backups = await loadBackups(projectDir, undoData.backupId);
        if (backups.length > 0) {
          consola.info(`Restoring ${backups.length} file(s) from backup...`);
          for (const backup of backups) {
            if (backup.content === null) {
              // File didn't exist before - delete it if it exists
              if (await fileExists(backup.path)) {
                await fs.unlink(backup.path);
                consola.success(`Deleted: ${backup.path}`);
              }
            } else {
              // Restore original content
              await fs.writeFile(backup.path, backup.content, "utf-8");
              consola.success(`Restored: ${backup.path}`);
            }
          }
        }

        // Clean up backup files
        await deleteBackup(projectDir, undoData.backupId);
      }

      // Show files that were added (user needs to delete manually unless --delete-files)
      if (undoData.addedFiles && undoData.addedFiles.length > 0) {
        if (args["delete-files"]) {
          consola.info("Deleting added files...");
          for (const file of undoData.addedFiles) {
            try {
              if (await fileExists(file)) {
                const stat = await fs.stat(file);
                if (stat.isDirectory()) {
                  await fs.rm(file, { recursive: true });
                } else {
                  await fs.unlink(file);
                }
                consola.success(`Deleted: ${file}`);
              }
            } catch (error) {
              consola.warn(`Could not delete: ${file}`);
            }
          }
        } else {
          consola.box(
            `The following files were added and may need to be removed:\n\n` +
            undoData.addedFiles.map((f) => `  - ${f}`).join("\n") +
            `\n\nRun with --delete-files to automatically remove them.`
          );
        }
      }

      // Show dependencies that were added (user needs to remove manually)
      if (undoData.addedDependencies && undoData.addedDependencies.length > 0) {
        consola.box(
          `The following dependencies were added:\n\n` +
          undoData.addedDependencies.map((d) => `  - ${d}`).join("\n") +
          `\n\nRemove them manually from package.json if no longer needed.`
        );
      }

      // Remove the history entry
      await removeHistoryEntry(projectDir, lastEntry.timestamp);

      consola.success("Undo completed!");
      consola.info("Run your package manager to sync dependencies.");
    } catch (error) {
      showError(Errors.unknown(error));
      process.exit(1);
    }
  },
});

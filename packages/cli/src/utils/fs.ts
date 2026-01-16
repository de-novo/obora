/**
 * File System Utilities
 *
 * Re-exports from @obora/preset-engine and adds CLI-specific utilities
 */

import { promises as fs } from "node:fs";
import { dirname, join, normalize, relative } from "pathe";
import { consola } from "consola";

// Re-export from preset-engine
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
} from "@obora/preset-engine";

/**
 * Copy directory recursively
 */
export async function copyDir(src: string, dest: string): Promise<void> {
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

/**
 * Read and replace placeholders in file
 */
export async function readTemplate(
  path: string,
  replacements: Record<string, string>
): Promise<string> {
  let content = await fs.readFile(path, "utf-8");

  for (const [key, value] of Object.entries(replacements)) {
    content = content.replace(new RegExp(`{{${key}}}`, "g"), value);
  }

  return content;
}

/**
 * Write file with replacements
 */
export async function writeTemplate(
  srcPath: string,
  destPath: string,
  replacements: Record<string, string>
): Promise<void> {
  const content = await readTemplate(srcPath, replacements);
  await fs.mkdir(dirname(destPath), { recursive: true });
  await fs.writeFile(destPath, content);
}

/**
 * Copy directory with placeholder replacements
 */
export async function copyTemplateDir(
  src: string,
  dest: string,
  replacements: Record<string, string>,
  options?: {
    overwrite?: boolean;
    logSkipped?: boolean;
    filter?: (relativePath: string, kind: "file" | "dir") => boolean;
    root?: string;
  }
): Promise<void> {
  const overwrite = options?.overwrite ?? true;
  const logSkipped = options?.logSkipped ?? true;
  const root = options?.root ?? src;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    // Replace placeholders in filename too
    let destName = entry.name;
    for (const [key, value] of Object.entries(replacements)) {
      destName = destName.replace(new RegExp(`{{${key}}}`, "g"), value);
    }
    const destPath = join(dest, destName);

    if (entry.isDirectory()) {
      const relDir = normalize(relative(root, srcPath));
      if (options?.filter && !options.filter(relDir, "dir")) {
        if (logSkipped) {
          consola.warn(`Skipped directory ${destPath} by filter.`);
        }
        continue;
      }
      const destStat = await fs.stat(destPath).catch(() => null);
      if (destStat && !destStat.isDirectory()) {
        if (logSkipped) {
          consola.warn(`Skipped directory ${destPath} (file already exists).`);
        }
        continue;
      }
      await copyTemplateDir(srcPath, destPath, replacements, { ...options, root });
    } else {
      const relFile = normalize(relative(root, srcPath));
      if (options?.filter && !options.filter(relFile, "file")) {
        if (logSkipped) {
          consola.warn(`Skipped file ${destPath} by filter.`);
        }
        continue;
      }
      const destStat = await fs.stat(destPath).catch(() => null);
      if (destStat) {
        if (destStat.isDirectory()) {
          if (logSkipped) {
            consola.warn(`Skipped file ${destPath} (directory already exists).`);
          }
          continue;
        }
        if (!overwrite) {
          if (logSkipped) {
            consola.warn(`Skipped existing file ${destPath}.`);
          }
          continue;
        }
      }
      // Check if it's a text file that needs placeholder replacement
      const textExtensions = [
        ".ts",
        ".tsx",
        ".js",
        ".jsx",
        ".json",
        ".md",
        ".yaml",
        ".yml",
        ".env",
        ".example",
      ];

      if (textExtensions.some((e) => entry.name.endsWith(e))) {
        await writeTemplate(srcPath, destPath, replacements);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  consola.success(`Copied template to ${dest}`);
}

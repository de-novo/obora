/**
 * @obora/preset-engine - File System Utilities
 */

import { promises as fs } from "node:fs";
import { dirname, join, relative, normalize } from "pathe";
import { consola } from "consola";
import type { CopyOptions } from "./types.js";

/**
 * Check if a directory exists
 */
export async function dirExists(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a file exists
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    const stat = await fs.stat(path);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Create directory if it doesn't exist
 */
export async function ensureDir(path: string): Promise<void> {
  await fs.mkdir(path, { recursive: true });
}

/**
 * Read JSON file
 */
export async function readJson<T = unknown>(path: string): Promise<T> {
  const content = await fs.readFile(path, "utf-8");
  return JSON.parse(content) as T;
}

/**
 * Write JSON file
 */
export async function writeJson(path: string, data: unknown): Promise<void> {
  await ensureDir(dirname(path));
  await fs.writeFile(path, JSON.stringify(data, null, 2) + "\n");
}

/**
 * Apply placeholder replacements to string
 */
export function applyReplacements(
  input: string,
  replacements: Record<string, string>
): string {
  let output = input;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return output;
}

/**
 * Binary file extensions that should not have replacements applied
 */
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "ico", "woff", "woff2", "ttf", "eot", "svg"
]);

/**
 * Directories to ignore during copy
 */
const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".pnpm", ".turbo", "dist", "build"
]);

/**
 * Copy files/directories with placeholder replacements
 */
export async function copyTemplateWithReplacements(
  src: string,
  dest: string,
  replacements: Record<string, string>,
  options?: CopyOptions
): Promise<void> {
  const overwrite = options?.overwrite ?? true;
  const logSkipped = options?.logSkipped ?? true;
  const root = options?.root ?? src;
  const stat = await fs.stat(src).catch(() => null);

  if (!stat) {
    return;
  }

  if (stat.isDirectory()) {
    const relDir = normalize(relative(root, src));
    if (options?.filter && !options.filter(relDir, "dir")) {
      if (logSkipped) {
        consola.warn(`Skipped directory ${dest} by filter.`);
      }
      return;
    }
    const destStat = await fs.stat(dest).catch(() => null);
    if (destStat && !destStat.isDirectory()) {
      if (logSkipped) {
        consola.warn(`Skipped directory ${dest} (file already exists).`);
      }
      return;
    }
    const dirName = src.split("/").pop() || "";
    if (IGNORED_DIRS.has(dirName)) {
      return;
    }
    await ensureDir(dest);
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await copyTemplateWithReplacements(
        join(src, entry.name),
        join(dest, entry.name),
        replacements,
        { ...options, root }
      );
    }
  } else {
    await ensureDir(dirname(dest));

    const ext = src.split(".").pop()?.toLowerCase() || "";
    const relFile = normalize(relative(root, src));

    if (options?.filter && !options.filter(relFile, "file")) {
      if (logSkipped) {
        consola.warn(`Skipped file ${dest} by filter.`);
      }
      return;
    }

    const destStat = await fs.stat(dest).catch(() => null);
    if (destStat) {
      if (destStat.isDirectory()) {
        if (logSkipped) {
          consola.warn(`Skipped file ${dest} (directory already exists).`);
        }
        return;
      }
      if (!overwrite) {
        if (logSkipped) {
          consola.warn(`Skipped existing file ${dest}.`);
        }
        return;
      }
    }

    if (BINARY_EXTENSIONS.has(ext)) {
      await fs.copyFile(src, dest);
    } else {
      let content = await fs.readFile(src, "utf-8");
      content = applyReplacements(content, replacements);
      await fs.writeFile(dest, content, "utf-8");
    }
  }
}

/**
 * Remove .gitkeep files from directory
 */
export async function removeGitkeepFiles(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      await removeGitkeepFiles(fullPath);
    } else if (entry.name === ".gitkeep") {
      await fs.rm(fullPath);
    }
  }
}

/**
 * Deep merge two objects
 */
export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        value as Record<string, unknown>
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Escape string for use in RegExp
 */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Indent multiline string
 */
export function indentMultiline(content: string, indent: string): string {
  return content
    .split("\n")
    .map((line) => (line.length > 0 ? `${indent}${line}` : line))
    .join("\n");
}

/**
 * Deduplicate array of strings
 */
export function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (!line || seen.has(line)) continue;
    seen.add(line);
    result.push(line);
  }
  return result;
}

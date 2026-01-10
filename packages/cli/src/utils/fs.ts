import { promises as fs } from "node:fs";
import { join, dirname } from "pathe";
import { consola } from "consola";

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
 * Copy directory recursively
 */
export async function copyDir(src: string, dest: string): Promise<void> {
  await ensureDir(dest);
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
  await ensureDir(dirname(destPath));
  await fs.writeFile(destPath, content);
}

/**
 * Copy directory with placeholder replacements
 */
export async function copyTemplateDir(
  src: string,
  dest: string,
  replacements: Record<string, string>
): Promise<void> {
  await ensureDir(dest);
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
      await copyTemplateDir(srcPath, destPath, replacements);
    } else {
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
      const ext = entry.name.substring(entry.name.lastIndexOf("."));

      if (textExtensions.some((e) => entry.name.endsWith(e))) {
        await writeTemplate(srcPath, destPath, replacements);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  consola.success(`Copied template to ${dest}`);
}

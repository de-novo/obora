import { readdir } from "node:fs/promises";
import { extname, join, normalize, relative } from "pathe";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const PRESETS_DIR = fileURLToPath(new URL("../../../../presets", import.meta.url));

const forbiddenFilePaths = [
  "app/layout.tsx",
  "app/providers.tsx",
  "src/app.module.ts",
];

async function collectForbiddenFiles(root: string): Promise<string[]> {
  const matches: string[] = [];

  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (extname(entry.name) === "") continue;
      const rel = normalize(relative(PRESETS_DIR, fullPath));
      for (const forbidden of forbiddenFilePaths) {
        if (rel.endsWith(`/files/${forbidden}`)) {
          matches.push(rel);
        }
      }
    }
  }

  await walk(PRESETS_DIR);
  return matches;
}

describe("preset files", () => {
  it("should not include shared app files (use inject markers instead)", async () => {
    const matches = await collectForbiddenFiles(PRESETS_DIR);
    expect(matches, `Found forbidden files:\n${matches.join("\n")}`).toEqual([]);
  });
});

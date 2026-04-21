import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("legacy shim boundary", () => {
  it("keeps only retained legacy command files as thin re-export shims", async () => {
    const fixtures = [
      ["../new.ts", 'export * from "./_legacy/new.js";'],
      ["../done.ts", 'export * from "./_legacy/done.js";'],
    ] as const;

    await Promise.all(
      fixtures.map(async ([relativePath, expectedSource]) => {
        const content = await readFile(new URL(relativePath, import.meta.url), "utf8");
        expect(content.trim()).toBe(expectedSource);
      })
    );
  });
});
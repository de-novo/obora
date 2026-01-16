import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import {
  dirExists,
  fileExists,
  ensureDir,
  readJson,
  writeJson,
  applyReplacements,
  deepMerge,
  escapeRegExp,
  indentMultiline,
  dedupeLines,
} from "../fs-utils.js";

const TEST_DIR = join(process.cwd(), ".test-fs-utils");

describe("fs-utils", () => {
  beforeEach(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
  });

  describe("dirExists", () => {
    it("should return true for existing directory", async () => {
      expect(await dirExists(TEST_DIR)).toBe(true);
    });

    it("should return false for non-existing directory", async () => {
      expect(await dirExists(join(TEST_DIR, "nonexistent"))).toBe(false);
    });

    it("should return false for file path", async () => {
      const filePath = join(TEST_DIR, "test.txt");
      await fs.writeFile(filePath, "test");
      expect(await dirExists(filePath)).toBe(false);
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const filePath = join(TEST_DIR, "test.txt");
      await fs.writeFile(filePath, "test");
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for non-existing file", async () => {
      expect(await fileExists(join(TEST_DIR, "nonexistent.txt"))).toBe(false);
    });

    it("should return false for directory path", async () => {
      expect(await fileExists(TEST_DIR)).toBe(false);
    });
  });

  describe("ensureDir", () => {
    it("should create directory if not exists", async () => {
      const newDir = join(TEST_DIR, "new-dir");
      await ensureDir(newDir);
      expect(await dirExists(newDir)).toBe(true);
    });

    it("should create nested directories", async () => {
      const nestedDir = join(TEST_DIR, "a", "b", "c");
      await ensureDir(nestedDir);
      expect(await dirExists(nestedDir)).toBe(true);
    });

    it("should not fail if directory already exists", async () => {
      await ensureDir(TEST_DIR);
      expect(await dirExists(TEST_DIR)).toBe(true);
    });
  });

  describe("readJson / writeJson", () => {
    it("should write and read JSON correctly", async () => {
      const filePath = join(TEST_DIR, "test.json");
      const data = { name: "test", version: "1.0.0" };

      await writeJson(filePath, data);
      const result = await readJson(filePath);

      expect(result).toEqual(data);
    });

    it("should handle nested JSON", async () => {
      const filePath = join(TEST_DIR, "nested.json");
      const data = {
        name: "test",
        config: {
          enabled: true,
          options: ["a", "b", "c"],
        },
      };

      await writeJson(filePath, data);
      const result = await readJson(filePath);

      expect(result).toEqual(data);
    });

    it("should create parent directories when writing", async () => {
      const filePath = join(TEST_DIR, "sub", "dir", "test.json");
      const data = { test: true };

      await writeJson(filePath, data);
      expect(await fileExists(filePath)).toBe(true);
    });
  });

  describe("applyReplacements", () => {
    it("should replace single placeholder", () => {
      const result = applyReplacements("Hello {{NAME}}!", { NAME: "World" });
      expect(result).toBe("Hello World!");
    });

    it("should replace multiple occurrences", () => {
      const result = applyReplacements("{{X}} + {{X}} = 2{{X}}", { X: "1" });
      expect(result).toBe("1 + 1 = 21");
    });

    it("should replace multiple different placeholders", () => {
      const result = applyReplacements("{{A}} and {{B}}", { A: "foo", B: "bar" });
      expect(result).toBe("foo and bar");
    });

    it("should leave unknown placeholders unchanged", () => {
      const result = applyReplacements("{{KNOWN}} {{UNKNOWN}}", { KNOWN: "yes" });
      expect(result).toBe("yes {{UNKNOWN}}");
    });

    it("should handle empty replacements", () => {
      const result = applyReplacements("no placeholders", {});
      expect(result).toBe("no placeholders");
    });
  });

  describe("deepMerge", () => {
    it("should merge simple objects", () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3, c: 4 };
      const result = deepMerge(base, override);
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should merge nested objects", () => {
      const base = { config: { debug: false, port: 3000 } };
      const override = { config: { debug: true } };
      const result = deepMerge(base, override);
      expect(result).toEqual({ config: { debug: true, port: 3000 } });
    });

    it("should override arrays instead of merging", () => {
      const base = { items: [1, 2, 3] };
      const override = { items: [4, 5] };
      const result = deepMerge(base, override);
      expect(result).toEqual({ items: [4, 5] });
    });

    it("should not modify original objects", () => {
      const base = { a: 1 };
      const override = { b: 2 };
      deepMerge(base, override);
      expect(base).toEqual({ a: 1 });
      expect(override).toEqual({ b: 2 });
    });
  });

  describe("escapeRegExp", () => {
    it("should escape special regex characters", () => {
      expect(escapeRegExp("a.b*c?d")).toBe("a\\.b\\*c\\?d");
    });

    it("should escape brackets", () => {
      expect(escapeRegExp("[abc]")).toBe("\\[abc\\]");
    });

    it("should handle empty string", () => {
      expect(escapeRegExp("")).toBe("");
    });

    it("should not escape normal characters", () => {
      expect(escapeRegExp("hello")).toBe("hello");
    });
  });

  describe("indentMultiline", () => {
    it("should indent all lines", () => {
      const input = "line1\nline2\nline3";
      const result = indentMultiline(input, "  ");
      expect(result).toBe("  line1\n  line2\n  line3");
    });

    it("should not indent empty lines", () => {
      const input = "line1\n\nline3";
      const result = indentMultiline(input, "  ");
      expect(result).toBe("  line1\n\n  line3");
    });

    it("should handle single line", () => {
      const result = indentMultiline("single", "    ");
      expect(result).toBe("    single");
    });
  });

  describe("dedupeLines", () => {
    it("should remove duplicate lines", () => {
      const result = dedupeLines(["a", "b", "a", "c", "b"]);
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("should preserve order", () => {
      const result = dedupeLines(["c", "a", "b", "a"]);
      expect(result).toEqual(["c", "a", "b"]);
    });

    it("should filter empty strings", () => {
      const result = dedupeLines(["a", "", "b", ""]);
      expect(result).toEqual(["a", "b"]);
    });

    it("should handle empty array", () => {
      const result = dedupeLines([]);
      expect(result).toEqual([]);
    });
  });
});

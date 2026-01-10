import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "pathe";
import { tmpdir } from "node:os";
import {
  dirExists,
  fileExists,
  ensureDir,
  copyDir,
  readJson,
  writeJson,
  readTemplate,
  writeTemplate,
  copyTemplateDir,
} from "../../src/utils/fs";

describe("fs utilities", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `obora-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("dirExists", () => {
    it("should return true for existing directory", async () => {
      expect(await dirExists(testDir)).toBe(true);
    });

    it("should return false for non-existing directory", async () => {
      expect(await dirExists(join(testDir, "nonexistent"))).toBe(false);
    });

    it("should return false for file path", async () => {
      const filePath = join(testDir, "file.txt");
      await fs.writeFile(filePath, "test");
      expect(await dirExists(filePath)).toBe(false);
    });
  });

  describe("fileExists", () => {
    it("should return true for existing file", async () => {
      const filePath = join(testDir, "file.txt");
      await fs.writeFile(filePath, "test");
      expect(await fileExists(filePath)).toBe(true);
    });

    it("should return false for non-existing file", async () => {
      expect(await fileExists(join(testDir, "nonexistent.txt"))).toBe(false);
    });

    it("should return false for directory path", async () => {
      expect(await fileExists(testDir)).toBe(false);
    });
  });

  describe("ensureDir", () => {
    it("should create directory if it doesn't exist", async () => {
      const newDir = join(testDir, "new", "nested", "dir");
      await ensureDir(newDir);
      expect(await dirExists(newDir)).toBe(true);
    });

    it("should not throw if directory already exists", async () => {
      await expect(ensureDir(testDir)).resolves.not.toThrow();
    });
  });

  describe("copyDir", () => {
    it("should copy directory contents", async () => {
      const srcDir = join(testDir, "src");
      const destDir = join(testDir, "dest");

      await fs.mkdir(srcDir);
      await fs.writeFile(join(srcDir, "file1.txt"), "content1");
      await fs.writeFile(join(srcDir, "file2.txt"), "content2");

      await copyDir(srcDir, destDir);

      expect(await fileExists(join(destDir, "file1.txt"))).toBe(true);
      expect(await fileExists(join(destDir, "file2.txt"))).toBe(true);

      const content1 = await fs.readFile(join(destDir, "file1.txt"), "utf-8");
      expect(content1).toBe("content1");
    });

    it("should copy nested directories", async () => {
      const srcDir = join(testDir, "src");
      const destDir = join(testDir, "dest");

      await fs.mkdir(join(srcDir, "nested"), { recursive: true });
      await fs.writeFile(join(srcDir, "nested", "file.txt"), "nested content");

      await copyDir(srcDir, destDir);

      expect(await fileExists(join(destDir, "nested", "file.txt"))).toBe(true);
    });
  });

  describe("readJson / writeJson", () => {
    it("should write and read JSON file", async () => {
      const filePath = join(testDir, "data.json");
      const data = { name: "test", version: "1.0.0" };

      await writeJson(filePath, data);
      const result = await readJson<typeof data>(filePath);

      expect(result).toEqual(data);
    });

    it("should create parent directories if needed", async () => {
      const filePath = join(testDir, "nested", "dir", "data.json");
      const data = { test: true };

      await writeJson(filePath, data);
      expect(await fileExists(filePath)).toBe(true);
    });
  });

  describe("readTemplate", () => {
    it("should replace placeholders in template", async () => {
      const filePath = join(testDir, "template.txt");
      await fs.writeFile(filePath, "Hello {{NAME}}, welcome to {{PROJECT}}!");

      const result = await readTemplate(filePath, {
        NAME: "User",
        PROJECT: "Obora",
      });

      expect(result).toBe("Hello User, welcome to Obora!");
    });

    it("should replace multiple occurrences", async () => {
      const filePath = join(testDir, "template.txt");
      await fs.writeFile(filePath, "{{VAR}} and {{VAR}} again");

      const result = await readTemplate(filePath, { VAR: "value" });

      expect(result).toBe("value and value again");
    });
  });

  describe("writeTemplate", () => {
    it("should write file with replacements", async () => {
      const srcPath = join(testDir, "template.txt");
      const destPath = join(testDir, "output.txt");

      await fs.writeFile(srcPath, "Project: {{PROJECT_NAME}}");

      await writeTemplate(srcPath, destPath, { PROJECT_NAME: "my-app" });

      const content = await fs.readFile(destPath, "utf-8");
      expect(content).toBe("Project: my-app");
    });
  });

  describe("copyTemplateDir", () => {
    it("should copy directory with placeholder replacements", async () => {
      const srcDir = join(testDir, "template");
      const destDir = join(testDir, "output");

      await fs.mkdir(srcDir);
      await fs.writeFile(
        join(srcDir, "package.json"),
        '{"name": "@{{PROJECT_NAME}}/app"}'
      );
      await fs.writeFile(join(srcDir, "README.md"), "# {{PROJECT_NAME}}");

      await copyTemplateDir(srcDir, destDir, { PROJECT_NAME: "my-project" });

      const packageJson = await fs.readFile(join(destDir, "package.json"), "utf-8");
      const readme = await fs.readFile(join(destDir, "README.md"), "utf-8");

      expect(packageJson).toBe('{"name": "@my-project/app"}');
      expect(readme).toBe("# my-project");
    });

    it("should copy binary files without modification", async () => {
      const srcDir = join(testDir, "template");
      const destDir = join(testDir, "output");

      await fs.mkdir(srcDir);
      const binaryContent = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
      await fs.writeFile(join(srcDir, "image.png"), binaryContent);

      await copyTemplateDir(srcDir, destDir, { PROJECT_NAME: "test" });

      const copied = await fs.readFile(join(destDir, "image.png"));
      expect(copied).toEqual(binaryContent);
    });
  });
});

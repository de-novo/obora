import { describe, it, expect, beforeEach } from "vitest";

import { PromptTemplateRegistry } from "../../prompts/registry";
import { PromptTemplate } from "../../prompts/template";

describe("PromptTemplateRegistry", () => {
  let registry: PromptTemplateRegistry;

  beforeEach(() => {
    registry = new PromptTemplateRegistry();
  });

  it("should register and retrieve templates", () => {
    registry.register("test", "Hello {{name}}");
    const template = registry.get("test");

    expect(template).toBeDefined();
    expect(template?.render({ name: "World" })).toBe("Hello World");
  });

  it("should render template by name", () => {
    registry.register("greeting", "Hello {{name}}!");
    const result = registry.render("greeting", { name: "Alice" });

    expect(result).toBe("Hello Alice!");
  });

  it("should throw error when rendering non-existent template", () => {
    expect(() => {
      registry.render("non-existent", {});
    }).toThrow("Template not found: non-existent");
  });

  it("should list all registered templates", () => {
    registry.register("template1", "Template 1");
    registry.register("template2", "Template 2");
    const list = registry.list();

    expect(list).toHaveLength(2);
    expect(list).toContain("template1");
    expect(list).toContain("template2");
  });

  it("should create alias for template", () => {
    registry.register("original", "Original template");
    registry.alias("original", "alias");

    const original = registry.get("original");
    const aliased = registry.get("alias");

    expect(original?.render({})).toBe(aliased?.render({}));
  });

  it("should clear all templates", () => {
    registry.register("template1", "Template 1");
    registry.register("template2", "Template 2");
    registry.clear();

    expect(registry.list()).toHaveLength(0);
  });

  it("should extend template with parent", () => {
    registry.register("parent", "Parent: {{parentVar}}");
    registry.register("child", "Child: {{childVar}}");
    registry.extend("child", "parent");

    const result = registry.render("child", {
      parentVar: "P",
      childVar: "C",
    });

    expect(result).toContain("Parent: P");
    expect(result).toContain("Child: C");
  });

  it("should throw error when extending non-existent template", () => {
    registry.register("child", "Child template");

    expect(() => {
      registry.extend("child", "non-existent-parent");
    }).toThrow("Template not found: non-existent-parent");
  });

  it("should handle multiple aliases", () => {
    registry.register("original", "Original: {{value}}");
    registry.alias("original", "alias1");
    registry.alias("original", "alias2");

    const result1 = registry.render("alias1", { value: "V1" });
    const result2 = registry.render("alias2", { value: "V2" });

    expect(result1).toBe("Original: V1");
    expect(result2).toBe("Original: V2");
  });

  it("should load template from file", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const testDir = path.join(process.cwd(), "packages/agents/src/__tests__/prompts/fixtures");
    const testFile = path.join(testDir, "test-template.md");

    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, "File loaded: {{content}}");

    await registry.loadFromFile(testFile, "fileTemplate");

    const result = registry.render("fileTemplate", { content: "Test" });
    expect(result).toBe("File loaded: Test");

    await fs.unlink(testFile);
    await fs.rmdir(testDir);
  });

  it("should load templates from directory", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const testDir = path.join(process.cwd(), "packages/agents/src/__tests__/prompts/fixtures");

    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(path.join(testDir, "template1.md"), "Template 1: {{a}}");
    await fs.writeFile(path.join(testDir, "template2.md"), "Template 2: {{b}}");

    await registry.loadFromDirectory(testDir);

    expect(registry.list()).toContain("template1");
    expect(registry.list()).toContain("template2");

    await fs.unlink(path.join(testDir, "template1.md"));
    await fs.unlink(path.join(testDir, "template2.md"));
    await fs.rmdir(testDir);
  });

  it("should extract name from file path", async () => {
    const fs = await import("fs/promises");
    const path = await import("path");
    const testDir = path.join(process.cwd(), "packages/agents/src/__tests__/prompts/fixtures");
    const testFile = path.join(testDir, "my-template.md");

    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, "Template: {{value}}");

    await registry.loadFromFile(testFile);

    expect(registry.get("my-template")).toBeDefined();

    await fs.unlink(testFile);
    await fs.rmdir(testDir);
  });

  it("should throw error when loading file in non-Node environment", async () => {
    const originalProcess = global.process;
    delete (global as any).process;

    await expect(registry.loadFromFile("/path/to/file")).rejects.toThrow(
      "loadFromFile is only available in Node.js environment"
    );

    global.process = originalProcess;
  });
});

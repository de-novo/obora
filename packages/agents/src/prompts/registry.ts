import { PromptTemplate } from "./template";

export class PromptTemplateRegistry {
  private templates: Map<string, PromptTemplate>;
  private aliases: Map<string, string>;

  constructor() {
    this.templates = new Map();
    this.aliases = new Map();
  }

  register(name: string, template: string): void {
    this.templates.set(name, new PromptTemplate(template));
  }

  get(name: string): PromptTemplate | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.templates.get(resolvedName);
  }

  render(name: string, variables: Record<string, unknown>): string {
    const template = this.get(name);
    if (!template) {
      throw new Error(`Template not found: ${name}`);
    }
    return template.render(variables);
  }

  alias(name: string, alias: string): void {
    this.aliases.set(alias, name);
  }

  extend(name: string, parent: string): void {
    const child = this.get(name);
    const parentTemplate = this.get(parent);

    if (!child || !parentTemplate) {
      throw new Error(`Template not found: ${!child ? name : parent}`);
    }

    child.extend(parentTemplate);
  }

  list(): string[] {
    return Array.from(this.templates.keys());
  }

  async loadFromFile(path: string, name?: string): Promise<void> {
    if (typeof process === "undefined") {
      throw new Error("loadFromFile is only available in Node.js environment");
    }

    const fs = await import("fs/promises");
    const content = await fs.readFile(path, "utf-8");
    const templateName = name ?? this.extractNameFromPath(path);
    this.register(templateName, content);
  }

  async loadFromDirectory(dir: string): Promise<void> {
    if (typeof process === "undefined") {
      throw new Error("loadFromDirectory is only available in Node.js environment");
    }

    const fs = await import("fs/promises");
    const path = await import("path");
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(".md")) {
        const fullPath = path.join(dir, entry.name);
        await this.loadFromFile(fullPath);
      }
    }
  }

  private extractNameFromPath(path: string): string {
    const filename = path.split("/").pop() ?? path;
    return filename.replace(/\.(md|txt)$/, "");
  }

  clear(): void {
    this.templates.clear();
    this.aliases.clear();
  }
}

export const globalPromptRegistry = new PromptTemplateRegistry();

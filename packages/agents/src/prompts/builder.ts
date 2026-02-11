import { PromptTemplate } from "./template";

export class PromptTemplateBuilder {
  private parts: string[];
  private sections: Map<string, string>;
  private extendsTemplate?: string;

  constructor() {
    this.parts = [];
    this.sections = new Map();
  }

  addText(text: string): this {
    this.parts.push(text);
    return this;
  }

  addSection(name: string, content: string): this {
    this.sections.set(name, content);
    this.parts.push(`{{section:${name}}}`);
    return this;
  }

  addConditional(variable: string, content: string): this {
    this.parts.push(`{{#if ${variable}}}${content}{{/if}}`);
    return this;
  }

  addUnless(variable: string, content: string): this {
    this.parts.push(`{{#unless ${variable}}}${content}{{/unless}}`);
    return this;
  }

  addEach(variable: string, content: string): this {
    this.parts.push(`{{#each ${variable}}}${content}{{/each}}`);
    return this;
  }

  addVariable(name: string, defaultValue?: string): this {
    const placeholder = defaultValue ? `{{${name}|${defaultValue}}}` : `{{${name}}}`;
    this.parts.push(placeholder);
    return this;
  }

  addHeader(level: number, text: string): this {
    const prefix = "#".repeat(level);
    this.parts.push(`\n${prefix} ${text}\n`);
    return this;
  }

  addList(items: string[], ordered: boolean = false): this {
    if (ordered) {
      const numberedItems = items.map((item, index) => `${index + 1}. ${item}`);
      this.parts.push("\n" + numberedItems.join("\n") + "\n");
    } else {
      this.parts.push("\n" + items.map((item) => `- ${item}`).join("\n") + "\n");
    }
    return this;
  }

  addCodeBlock(code: string, language: string = ""): this {
    this.parts.push(`\n\`\`\`${language}\n${code}\n\`\`\`\n`);
    return this;
  }

  addTable(headers: string[], rows: string[][]): this {
    this.parts.push(`\n| ${headers.join(" | ")} |\n`);
    this.parts.push(`| ${headers.map(() => "---").join(" | ")} |\n`);

    for (const row of rows) {
      this.parts.push(`| ${row.join(" | ")} |\n`);
    }

    return this;
  }

  addDivider(): this {
    this.parts.push("\n---\n");
    return this;
  }

  addNewline(count: number = 1): this {
    this.parts.push("\n".repeat(count));
    return this;
  }

  extends(template: string): this {
    this.extendsTemplate = template;
    return this;
  }

  build(): PromptTemplate {
    const template = this.parts.join("");

    const promptTemplate = new PromptTemplate(template);
    if (this.extendsTemplate) {
      promptTemplate.parentName = this.extendsTemplate;
    }

    return promptTemplate;
  }

  toString(): string {
    return this.parts.join("");
  }

  reset(): this {
    this.parts = [];
    this.sections.clear();
    this.extendsTemplate = undefined;
    return this;
  }

  clone(): PromptTemplateBuilder {
    const builder = new PromptTemplateBuilder();
    builder.parts = [...this.parts];
    builder.sections = new Map(this.sections);
    builder.extendsTemplate = this.extendsTemplate;
    return builder;
  }
}

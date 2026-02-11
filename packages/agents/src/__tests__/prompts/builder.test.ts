import { describe, it, expect, beforeEach } from "vitest";

import { PromptTemplateBuilder } from "../../prompts/builder";

describe("PromptTemplateBuilder", () => {
  let builder: PromptTemplateBuilder;

  beforeEach(() => {
    builder = new PromptTemplateBuilder();
  });

  it("should add text", () => {
    const result = builder.addText("Hello, World!").build().render({});
    expect(result).toContain("Hello, World!");
  });

  it("should add headers", () => {
    const result = builder.addHeader(1, "Main Title").addHeader(2, "Subtitle").build().render({});

    expect(result).toContain("# Main Title");
    expect(result).toContain("## Subtitle");
  });

  it("should add lists", () => {
    const result = builder.addList(["Item 1", "Item 2", "Item 3"]).build().render({});

    expect(result).toContain("- Item 1");
    expect(result).toContain("- Item 2");
    expect(result).toContain("- Item 3");
  });

  it("should add ordered lists", () => {
    const result = builder.addList(["First", "Second", "Third"], true).build().render({});

    expect(result).toContain("1. First");
    expect(result).toContain("2. Second");
    expect(result).toContain("3. Third");
  });

  it("should add code blocks", () => {
    const result = builder.addCodeBlock("const x = 1;", "javascript").build().render({});

    expect(result).toContain("```javascript");
    expect(result).toContain("const x = 1;");
    expect(result).toContain("```");
  });

  it("should add code blocks without language", () => {
    const result = builder.addCodeBlock("code without language").build().render({});

    expect(result).toContain("```\ncode without language\n```");
  });

  it("should add tables", () => {
    const result = builder
      .addTable(
        ["Name", "Age", "City"],
        [
          ["Alice", "30", "NYC"],
          ["Bob", "25", "LA"],
        ]
      )
      .build()
      .render({});

    expect(result).toContain("| Name | Age | City |");
    expect(result).toContain("| Alice | 30 | NYC |");
    expect(result).toContain("| Bob | 25 | LA |");
    expect(result).toContain("| --- | --- | --- |");
  });

  it("should add divider", () => {
    const result = builder.addDivider().build().render({});

    expect(result).toContain("---");
  });

  it("should add newlines", () => {
    const result = builder.addText("Start").addNewline(3).addText("End").build().render({});

    expect(result).toContain("Start");
    expect(result).toContain("End");
    expect(result).match(/Start\s{3,}End/);
  });

  it("should add variables with default values", () => {
    const templateString = builder.addVariable("name", "Guest").toString();
    expect(templateString).toContain("{{name|Guest}}");
  });

  it("should add variables without default values", () => {
    const templateString = builder.addVariable("name").toString();
    expect(templateString).toContain("{{name}}");
  });

  it("should add conditional sections", () => {
    const templateString = builder.addConditional("show", "Show this content").toString();
    expect(templateString).toContain("{{#if show}}Show this content{{/if}}");
  });

  it("should add unless sections", () => {
    const templateString = builder.addUnless("hide", "Unless content").toString();
    expect(templateString).toContain("{{#unless hide}}Unless content{{/unless}}");
  });

  it("should add each sections", () => {
    const templateString = builder.addEach("items", "- {{this}}").toString();
    expect(templateString).toContain("{{#each items}}- {{this}}{{/each}}");
  });

  it("should chain multiple builder methods", () => {
    const result = builder
      .addHeader(1, "Report")
      .addText("Introduction")
      .addDivider()
      .addHeader(2, "Findings")
      .addList(["Finding 1", "Finding 2"])
      .build()
      .render({});

    expect(result).toContain("# Report");
    expect(result).toContain("Introduction");
    expect(result).toContain("---");
    expect(result).toContain("## Findings");
    expect(result).toContain("- Finding 1");
    expect(result).toContain("- Finding 2");
  });

  it("should reset builder", () => {
    builder.addText("Content").addHeader(1, "Title").reset();

    const result = builder.build().render({});
    expect(result).toBe("");
  });

  it("should clone builder", () => {
    const original = builder.addText("Original").addHeader(1, "Title");

    const cloned = original.clone().addText(" - Clone");

    const originalResult = original.build().render({});
    const clonedResult = cloned.build().render({});

    expect(originalResult).toContain("Original");
    expect(originalResult).not.toContain("Clone");
    expect(clonedResult).toContain("Original");
    expect(clonedResult).toContain("Clone");
  });

  it("should set extends template", () => {
    builder.extends("parent-template");
    const template = builder.build();

    expect(template.parentName).toBe("parent-template");
  });

  it("should return template string", () => {
    builder.addText("Line 1").addNewline().addText("Line 2");

    const templateString = builder.toString();
    expect(templateString).toContain("Line 1");
    expect(templateString).toContain("Line 2");
  });

  it("should build valid PromptTemplate", () => {
    const template = builder
      .addHeader(1, "Analysis")
      .addText("Context: {{context}}")
      .addNewline()
      .addHeader(2, "Findings")
      .addList(["{{finding1}}", "{{finding2}}"])
      .build();

    const result = template.render({
      context: "Test context",
      finding1: "Result 1",
      finding2: "Result 2",
    });

    expect(result).toContain("# Analysis");
    expect(result).toContain("Context: Test context");
    expect(result).toContain("## Findings");
    expect(result).toContain("Result 1");
    expect(result).toContain("Result 2");
  });

  it("should handle empty builder", () => {
    const template = builder.build();
    const result = template.render({});
    expect(result).toBe("");
  });

  it("should support method chaining", () => {
    const template = builder
      .addHeader(2, "Section")
      .addText("Content")
      .addDivider()
      .addList(["Item"])
      .build();

    const result = template.render({});
    expect(result).toContain("## Section");
    expect(result).toContain("Content");
    expect(result).toContain("---");
    expect(result).toContain("- Item");
  });
});

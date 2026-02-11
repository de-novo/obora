import { describe, it, expect } from "vitest";

import {
  PromptTemplate,
  type PromptTemplateConfig,
  type ValidationResult,
  type AgentRole,
} from "../../prompts/template";

describe("PromptTemplate", () => {
  it("should render simple template with variable substitution", () => {
    const template = new PromptTemplate("Hello {{name}}, you are assigned to: {{task}}");
    const result = template.render({
      name: "Alice",
      task: "Analyze data",
    });

    expect(result).toBe("Hello Alice, you are assigned to: Analyze data");
  });

  it("should handle default values", () => {
    const template = new PromptTemplate("Hello {{name|Guest}}, from {{location|Unknown}}");
    const result = template.render({});

    expect(result).toBe("Hello Guest, from Unknown");
  });

  it("should handle conditional sections with if", () => {
    const template = new PromptTemplate("{{#if deadline}}Deadline: {{deadline}}{{/if}}");
    const result = template.render({ deadline: "2026-02-10" });

    expect(result).toBe("Deadline: 2026-02-10");
  });

  it("should handle conditional sections without if", () => {
    const template = new PromptTemplate("{{#if deadline}}Deadline: {{deadline}}{{/if}}");
    const result = template.render({});

    expect(result).toBe("");
  });

  it("should handle conditional sections with unless", () => {
    const template = new PromptTemplate("{{#unless deadline}}No deadline set{{/unless}}");
    const result = template.render({});

    expect(result).toBe("No deadline set");
  });

  it("should handle nested variable paths", () => {
    const template = new PromptTemplate("User: {{userName}}");
    const result = template.render({
      userName: "Bob",
    });

    expect(result).toBe("User: Bob");
  });

  it("should create template from config", () => {
    const config: PromptTemplateConfig = {
      id: "test-template",
      name: "Test Template",
      role: "analyst" as AgentRole,
      system: "You are a test assistant.",
      user: "Analyze: {{context}}",
      variables: [
        {
          name: "context",
          type: "string",
          required: true,
          description: "Analysis context",
        },
      ],
    };

    const template = new PromptTemplate(config);

    expect(template.id).toBe("test-template");
    expect(template.name).toBe("Test Template");
    expect(template.role).toBe("analyst");
    const messages = template.toMessages({ context: "Test" });
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("You are a test assistant.");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toBe("Analyze: Test");
  });

  it("should validate variables", () => {
    const config: PromptTemplateConfig = {
      id: "validation-template",
      name: "Validation Template",
      role: "analyst" as AgentRole,
      system: "System prompt",
      user: "Analyze: {{context}}",
      variables: [
        {
          name: "context",
          type: "string",
          required: true,
          description: "Analysis context",
        },
      ],
    };

    const template = new PromptTemplate(config);

    const result1: ValidationResult = template.validate({
      context: "Valid context",
    });
    expect(result1.valid).toBe(true);
    expect(result1.errors).toBeUndefined();

    const result2: ValidationResult = template.validate({});
    expect(result2.valid).toBe(false);
    expect(result2.errors).toHaveLength(1);
    expect(result2.errors?.[0]).toContain("Required variable 'context'");
  });

  it("should validate array type correctly", () => {
    const config: PromptTemplateConfig = {
      id: "array-validation-template",
      name: "Array Validation Template",
      role: "analyst" as AgentRole,
      system: "System prompt",
      user: "Analyze: {{items}}",
      variables: [
        {
          name: "items",
          type: "array",
          required: true,
          description: "Items to analyze",
        },
      ],
    };

    const template = new PromptTemplate(config);

    const result1: ValidationResult = template.validate({
      items: ["item1", "item2", "item3"],
    });
    expect(result1.valid).toBe(true);
    expect(result1.errors).toBeUndefined();

    const result2: ValidationResult = template.validate({
      items: "not an array",
    });
    expect(result2.valid).toBe(false);
    expect(result2.errors).toHaveLength(1);
    expect(result2.errors?.[0]).toContain("should be type 'array'");
  });

  it("should get variables from template", () => {
    const template = new PromptTemplate("Hello {{name}}, task: {{task}}");
    const variables = template.getVariables();

    expect(variables).toEqual(["name", "task"]);
  });

  it("should clone template", () => {
    const config: PromptTemplateConfig = {
      id: "clone-template",
      name: "Clone Template",
      role: "executor" as AgentRole,
      system: "System",
      user: "Execute: {{action}}",
      variables: [],
    };

    const original = new PromptTemplate(config);
    const cloned = original.clone();

    expect(cloned.id).toBe(original.id);
    expect(cloned.name).toBe(original.name);
    expect(cloned.role).toBe(original.role);
  });

  it("should handle empty variables gracefully", () => {
    const template = new PromptTemplate("Hello {{name}}, how are you?");
    const result = template.render({});

    expect(result).toBe("Hello , how are you?");
  });

  it("should merge two templates", () => {
    const template1 = new PromptTemplate("Part 1: {{a}}");
    const template2 = new PromptTemplate("Part 2: {{b}}");
    const merged = template1.merge(template2);
    const result = merged.render({ a: "A", b: "B" });

    expect(result).toContain("Part 1: A");
    expect(result).toContain("Part 2: B");
  });

  it("should handle parent template", () => {
    const parent = new PromptTemplate("Parent: {{parentVar}}");
    const child = new PromptTemplate("Child: {{childVar}}");
    child.extend(parent);

    const result = child.render({ parentVar: "P", childVar: "C" });
    expect(result).toContain("Parent: P");
    expect(result).toContain("Child: C");
  });

  it("should set system prompt", () => {
    const template = new PromptTemplate("User prompt");
    template.setSystemPrompt("System prompt");

    const messages = template.toMessages({});
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toBe("System prompt");
    expect(messages[1].role).toBe("user");
  });

  it("should render template without system prompt", () => {
    const template = new PromptTemplate("User prompt");

    const messages = template.toMessages({});
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("user");
    expect(messages[0].content).toBe("User prompt");
  });

  it("should handle truthy values correctly in conditionals", () => {
    const template = new PromptTemplate(
      "{{#if show}}Show this{{/if}}{{#unless hide}}Unless this{{/unless}}"
    );
    const result = template.render({ show: true, hide: false });

    expect(result).toContain("Show this");
    expect(result).toContain("Unless this");
  });

  it("should handle falsy values correctly in conditionals", () => {
    const template = new PromptTemplate(
      "{{#if show}}Show this{{/if}}{{#unless hide}}Unless this{{/unless}}"
    );
    const result = template.render({ show: false, hide: true });

    expect(result).not.toContain("Show this");
    expect(result).not.toContain("Unless this");
  });
});

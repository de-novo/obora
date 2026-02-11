import { describe, it, expect } from "vitest";

import {
  buildAnalystTemplate,
  buildExecutorTemplate,
  buildVerifierTemplate,
  buildDirectorTemplate,
} from "../../prompts/role-templates";

describe("Role Templates", () => {
  describe("buildAnalystTemplate", () => {
    it("should build analyst template", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({
        context: "Test context",
        confidence: 90,
      });

      expect(result).toContain("expert analyst");
      expect(result).toContain("Your responsibilities");
      expect(result).toContain("Summary");
      expect(result).toContain("Key Findings");
      expect(result).toContain("Recommendations");
      expect(result).toContain("Confidence");
      expect(result).toContain("Reasoning");
      expect(result).toContain("90");
    });

    it("should accept custom responsibilities", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({ responsibilities: "Custom responsibility description" });

      expect(result).toContain("Custom responsibility description");
      expect(result).not.toContain("Analyze the provided information thoroughly");
    });

    it("should include context when provided", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({
        context: "Market analysis Q4",
      });

      expect(result).toContain("Context: Market analysis Q4");
    });

    it("should include sources when provided", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({
        sources: "Source 1, Source 2",
      });

      expect(result).toContain("Sources");
      expect(result).toContain("Source 1, Source 2");
    });

    it("should have default confidence value", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("85/100");
    });

    it("should respect custom confidence value", () => {
      const builder = buildAnalystTemplate();
      const template = builder.build();
      const result = template.render({ confidence: 95 });

      expect(result).toContain("95/100");
    });
  });

  describe("buildExecutorTemplate", () => {
    it("should build executor template", () => {
      const builder = buildExecutorTemplate();
      const template = builder.build();
      const result = template.render({
        action: "Execute task",
        tools: "tool1, tool2",
      });

      expect(result).toContain("executor agent");
      expect(result).toContain("Your responsibilities");
      expect(result).toContain("Understand the task requirements clearly");
      expect(result).toContain("Available tools: tool1, tool2");
      expect(result).toContain("Action");
      expect(result).toContain("Tool");
      expect(result).toContain("Parameters");
      expect(result).toContain("Steps");
      expect(result).toContain("Expected Outcome");
    });

    it("should accept custom responsibilities", () => {
      const builder = buildExecutorTemplate({
        responsibilities: "Custom executor responsibility",
      });
      const template = builder.build();
      const result = template.render({ responsibilities: "Custom executor responsibility" });

      expect(result).toContain("Custom executor responsibility");
      expect(result).not.toContain("Understand the task requirements clearly");
    });

    it("should use default tools value when not provided in config", () => {
      const builder = buildExecutorTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("Available tools: none");
    });

    it("should use custom tools value from config", () => {
      const builder = buildExecutorTemplate({
        tools: "file-writer, api-caller",
      });
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("Available tools: file-writer, api-caller");
    });

    it("should include safety notes when provided", () => {
      const builder = buildExecutorTemplate({
        safetyNotes: "Ensure all operations are rate-limited",
      });
      const template = builder.build();
      const result = template.render({
        safetyNotes: "Check permissions before execution",
      });

      expect(result).toContain("Safety Notes");
      expect(result).toContain("Check permissions before execution");
    });

    it("should handle tool information", () => {
      const builder = buildExecutorTemplate();
      const template = builder.build();
      const result = template.render({
        tool: "execute-api",
        parameters: '{"endpoint": "/api/v1/data"}',
      });

      expect(result).toContain("Tool: execute-api");
      expect(result).toContain('{"endpoint": "/api/v1/data"}');
    });

    it("should handle no tool scenario", () => {
      const builder = buildExecutorTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("No tool required");
    });
  });

  describe("buildVerifierTemplate", () => {
    it("should build verifier template", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({ passed: true });

      expect(result).toContain("verifier agent");
      expect(result).toContain("Your responsibilities");
      expect(result).toContain("Review the provided work thoroughly");
      expect(result).toContain("Overall Result");
      expect(result).toContain("✅ PASSED");
      expect(result).toContain("Verification Checks");
      expect(result).toContain("Summary");
      expect(result).toContain("Issues Found");
      expect(result).toContain("Suggestions");
    });

    it("should accept custom responsibilities", () => {
      const builder = buildVerifierTemplate({
        responsibilities: "Custom verifier responsibility",
      });
      const template = builder.build();
      const result = template.render({ responsibilities: "Custom verifier responsibility" });

      expect(result).toContain("Custom verifier responsibility");
      expect(result).not.toContain("Review the provided work thoroughly");
    });

    it("should show failed status when not passed", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({ passed: false });

      expect(result).toContain("❌ FAILED");
    });

    it("should handle issues list", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({
        passed: false,
        issues: [
          {
            severity: "critical",
            description: "Memory leak detected",
            location: "src/memory.ts:42",
            recommendation: "Fix memory allocation",
          },
        ],
      });

      expect(result).toContain("Memory leak detected");
      expect(result).toContain("critical");
      expect(result).toContain("src/memory.ts:42");
      expect(result).toContain("Fix memory allocation");
    });

    it("should show no issues found when issues empty", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("No issues found.");
    });

    it("should handle suggestions list", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({
        suggestions: ["Improve performance", "Add error handling"],
      });

      expect(result).toContain("Improve performance");
      expect(result).toContain("Add error handling");
    });

    it("should show no suggestions when empty", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("No suggestions.");
    });

    it("should include severity levels", () => {
      const builder = buildVerifierTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("Critical");
      expect(result).toContain("High");
      expect(result).toContain("Medium");
      expect(result).toContain("Low");
    });
  });

  describe("buildDirectorTemplate", () => {
    it("should build director template", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({
        agenda: "Project kickoff meeting",
      });

      expect(result).toContain("director agent");
      expect(result).toContain("Your responsibilities");
      expect(result).toContain("Understand the overall goal and requirements");
      expect(result).toContain("Agenda");
      expect(result).toContain("Project kickoff meeting");
      expect(result).toContain("Participants");
      expect(result).toContain("Steps");
      expect(result).toContain("Timeline");
      expect(result).toContain("Expected Outcome");
      expect(result).toContain("Key Principles for Coordination");
    });

    it("should accept custom responsibilities", () => {
      const builder = buildDirectorTemplate({
        responsibilities: "Custom director responsibility",
      });
      const template = builder.build();
      const result = template.render({ responsibilities: "Custom director responsibility" });

      expect(result).toContain("Custom director responsibility");
      expect(result).not.toContain("Understand the overall goal and requirements");
    });

    it("should handle participants list", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({
        participants: ["Alice", "Bob", "Charlie"],
      });

      expect(result).toContain("- Alice");
      expect(result).toContain("- Bob");
      expect(result).toContain("- Charlie");
    });

    it("should handle steps with details", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({
        steps: [
          {
            description: "Define scope",
            assignee: "Alice",
            dependencies: "None",
            estimatedDuration: "1 hour",
          },
          {
            description: "Create plan",
            assignee: "Bob",
            dependencies: "Define scope",
            estimatedDuration: "2 hours",
          },
        ],
      });

      expect(result).toContain("Define scope");
      expect(result).toContain("Create plan");
      expect(result).toContain("Assignee: Alice");
      expect(result).toContain("Assignee: Bob");
      expect(result).toContain("Dependencies: Define scope");
      expect(result).toContain("Duration: 1 hour");
      expect(result).toContain("Duration: 2 hours");
    });

    it("should handle timeline list", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({
        timeline: ["Week 1: Planning", "Week 2: Execution", "Week 3: Review"],
      });

      expect(result).toContain("Week 1: Planning");
      expect(result).toContain("Week 2: Execution");
      expect(result).toContain("Week 3: Review");
    });

    it("should include notes when provided", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({
        notes: "Additional meeting notes",
      });

      expect(result).toContain("Notes");
      expect(result).toContain("Additional meeting notes");
    });

    it("should include coordination principles", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("Clear communication");
      expect(result).toContain("Inclusive participation");
      expect(result).toContain("Transparent decision-making");
      expect(result).toContain("Agile adaptation to changes");
      expect(result).toContain("Focus on results");
    });

    it("should use default agenda when not provided", () => {
      const builder = buildDirectorTemplate();
      const template = builder.build();
      const result = template.render({});

      expect(result).toContain("The main goal or purpose");
    });
  });

  describe("Integration", () => {
    it("should render all role templates successfully", () => {
      const analyst = buildAnalystTemplate().build();
      const executor = buildExecutorTemplate().build();
      const verifier = buildVerifierTemplate().build();
      const director = buildDirectorTemplate().build();

      expect(() => analyst.render({})).not.toThrow();
      expect(() => executor.render({})).not.toThrow();
      expect(() => verifier.render({})).not.toThrow();
      expect(() => director.render({})).not.toThrow();
    });

    it("should allow chaining with additional content", () => {
      const builder = buildAnalystTemplate();
      builder.addNewline().addText("--- END OF REPORT ---");

      const template = builder.build();
      const result = template.render({ context: "Test" });

      expect(result).toContain("expert analyst");
      expect(result).toContain("END OF REPORT");
    });
  });
});

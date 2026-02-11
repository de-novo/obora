import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { VerifierAgent, createVerifierAgent } from "../../roles/verifier-agent";
import { AgentRole, VerifierOutput, AgentContext } from "../../roles/base-agent";
import { Blackboard } from "@obora-kit/blackboard";
import { ChatMessage } from "../../llm/adapter";

describe("VerifierAgent", () => {
  let mockLlm: MockLLMAdapter;
  let blackboard: Blackboard;
  let agent: VerifierAgent;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
    blackboard = new Blackboard();
    agent = new VerifierAgent({
      id: "verifier-1",
      llm: mockLlm,
    });
  });

  describe("constructor", () => {
    it("should create agent with VERIFIER role", () => {
      expect(agent.id).toBe("verifier-1");
      expect(agent.role).toBe(AgentRole.VERIFIER);
    });

    it("should have correct system prompt", () => {
      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("verifier agent");
      expect(systemPrompt).toContain("validating results");
      expect(systemPrompt).toContain("ensuring quality");
    });
  });

  describe("createVerifierAgent", () => {
    it("should create verifier agent using factory function", () => {
      const factoryAgent = createVerifierAgent("verifier-factory", mockLlm);

      expect(factoryAgent).toBeInstanceOf(VerifierAgent);
      expect(factoryAgent.id).toBe("verifier-factory");
      expect(factoryAgent.role).toBe(AgentRole.VERIFIER);
    });
  });

  describe("execute", () => {
    const task = {
      id: "task-1",
      type: "verification",
      description: "Verify implementation",
      input: {
        content: "Verify the code implementation",
        artifact: {
          id: "artifact-1",
          type: "code",
          name: "implementation.ts",
          content: "const x = 1;",
        },
      },
      priority: 1,
    };

    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should execute verification task successfully", async () => {
      const jsonResponse = JSON.stringify({
        passed: true,
        score: 95,
        checks: [
          {
            name: "Syntax check",
            description: "Code syntax validation",
            status: "passed" as const,
            evidence: "No syntax errors found",
          },
        ],
        findings: [],
        suggestions: [],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as VerifierOutput).type).toBe("verification");
      expect((result.output as VerifierOutput).passed).toBe(true);
    });

    it("should parse JSON response correctly", async () => {
      const jsonResponse = JSON.stringify({
        passed: true,
        score: 88,
        checks: [
          {
            name: "Test check",
            description: "Test description",
            status: "passed" as const,
            evidence: "Test evidence",
          },
        ],
        findings: [
          {
            id: "finding-1",
            type: "warning" as const,
            description: "Test finding",
            severity: "medium" as const,
          },
        ],
        suggestions: ["Suggestion 1", "Suggestion 2"],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      const output = result.output as VerifierOutput;
      expect(output.passed).toBe(true);
      expect(output.score).toBe(88);
      expect(output.checks).toHaveLength(1);
      expect(output.checks[0].name).toBe("Test check");
      expect(output.findings).toHaveLength(1);
      expect(output.findings[0].id).toBe("finding-1");
      expect(output.suggestions).toEqual(["Suggestion 1", "Suggestion 2"]);
    });

    it("should handle non-JSON response gracefully", async () => {
      mockLlm.setResponse("Verify implementation", "This is a plain text response");

      const result = await agent.execute(task, context);

      const output = result.output as VerifierOutput;
      expect(output.type).toBe("verification");
      expect(output.passed).toBe(false);
      expect(output.score).toBe(0);
      expect(output.checks).toEqual([]);
      expect(output.findings).toEqual([]);
      expect(output.suggestions).toEqual([]);
    });

    it("should parse JSON without markdown code block", async () => {
      mockLlm.setResponse(
        "Verify implementation",
        `{"passed": true, "score": 90, "checks": [], "findings": [], "suggestions": []}`
      );

      const result = await agent.execute(task, context);

      const output = result.output as VerifierOutput;
      expect(output.passed).toBe(true);
      expect(output.score).toBe(90);
    });

    it("should write verification to knowledge section", async () => {
      const jsonResponse = JSON.stringify({
        passed: true,
        score: 80,
        checks: [
          {
            name: "Test check",
            description: "Test description",
            status: "passed" as const,
            evidence: "Test evidence",
          },
        ],
        findings: [],
        suggestions: [],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      const knowledge = blackboard.read("knowledge", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(knowledge).toBeDefined();

      const verificationSection = knowledge?.verification as Record<string, unknown> | undefined;
      expect(verificationSection).toBeDefined();

      const verifierKeys = Object.keys(verificationSection ?? {}).filter((k) =>
        k.startsWith("verifier-1")
      );
      expect(verifierKeys.length).toBeGreaterThan(0);

      const timestampKeys = Object.keys(
        (verificationSection?.["verifier-1"] as Record<string, unknown>) ?? {}
      );
      expect(timestampKeys.length).toBeGreaterThan(0);
    });

    it("should emit verification.completed event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.completed", eventSpy);

      const jsonResponse = JSON.stringify({
        passed: true,
        score: 85,
        checks: [],
        findings: [],
        suggestions: [],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("verifier-1");
      expect(eventData.result).toBeDefined();
    });

    it("should emit verification.critical event for critical findings", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.critical", eventSpy);

      const jsonResponse = JSON.stringify({
        passed: false,
        score: 50,
        checks: [],
        findings: [
          {
            id: "critical-1",
            type: "error" as const,
            description: "Critical issue",
            severity: "critical" as const,
          },
          {
            id: "warning-1",
            type: "warning" as const,
            description: "Warning issue",
            severity: "medium" as const,
          },
        ],
        suggestions: [],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("verifier-1");
      expect(eventData.findings).toHaveLength(1);
      expect(eventData.findings[0].id).toBe("critical-1");
    });

    it("should not emit verification.critical event when no critical findings", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.critical", eventSpy);

      const jsonResponse = JSON.stringify({
        passed: true,
        score: 75,
        checks: [],
        findings: [
          {
            id: "warning-1",
            type: "warning" as const,
            description: "Warning issue",
            severity: "medium" as const,
          },
        ],
        suggestions: [],
      });
      mockLlm.setResponse("Verify implementation", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(eventSpy).not.toHaveBeenCalled();
    });

    it("should include content from original response", async () => {
      const content = "Verification content goes here";
      const jsonResponse = JSON.stringify({
        passed: true,
        score: 90,
        checks: [],
        findings: [],
        suggestions: [],
      });
      mockLlm.setResponse(
        "Verify implementation",
        `${content}\n\`\`\`json\n${jsonResponse}\n\`\`\``
      );

      const result = await agent.execute(task, context);

      const output = result.output as VerifierOutput;
      expect(output.content).toContain(content);
    });
  });

  describe("parseResponse", () => {
    const task = {
      id: "task-1",
      type: "verification",
      description: "Test task",
      input: {},
      priority: 1,
    };

    it("should parse markdown JSON block", () => {
      const jsonContent = JSON.stringify({
        passed: true,
        score: 85,
        checks: [
          {
            name: "Test check",
            description: "Test description",
            status: "passed" as const,
            evidence: "Test evidence",
          },
        ],
        findings: [],
        suggestions: [],
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("verification");
      expect((result as VerifierOutput).passed).toBe(true);
      expect((result as VerifierOutput).score).toBe(85);
    });

    it("should parse plain JSON", () => {
      const jsonContent = JSON.stringify({
        passed: false,
        score: 60,
        checks: [],
        findings: [
          {
            id: "finding-1",
            type: "error" as const,
            description: "Plain JSON finding",
            severity: "high" as const,
          },
        ],
        suggestions: ["Plain suggestion"],
      });
      const content = jsonContent;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("verification");
      expect((result as VerifierOutput).passed).toBe(false);
      expect((result as VerifierOutput).score).toBe(60);
    });

    it("should handle invalid JSON", () => {
      const content = "This is not valid JSON {invalid";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("verification");
      expect((result as VerifierOutput).passed).toBe(false);
      expect((result as VerifierOutput).score).toBe(0);
    });

    it("should handle empty JSON block", () => {
      const content = "\`\`\`json\n{}\n\`\`\`";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("verification");
    });

    it("should parse all severity levels of findings", () => {
      const jsonContent = JSON.stringify({
        passed: false,
        score: 50,
        checks: [],
        findings: [
          {
            id: "critical",
            type: "error" as const,
            description: "Critical issue",
            severity: "critical" as const,
          },
          {
            id: "high",
            type: "error" as const,
            description: "High issue",
            severity: "high" as const,
          },
          {
            id: "medium",
            type: "warning" as const,
            description: "Medium issue",
            severity: "medium" as const,
          },
          {
            id: "low",
            type: "info" as const,
            description: "Low issue",
            severity: "low" as const,
          },
        ],
        suggestions: [],
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      const findings = (result as VerifierOutput).findings;
      expect(findings).toHaveLength(4);
      expect(findings[0].severity).toBe("critical");
      expect(findings[1].severity).toBe("high");
      expect(findings[2].severity).toBe("medium");
      expect(findings[3].severity).toBe("low");
    });

    it("should parse all check statuses", () => {
      const jsonContent = JSON.stringify({
        passed: true,
        score: 75,
        checks: [
          {
            name: "passed",
            description: "Passed check",
            status: "passed" as const,
            evidence: "Evidence",
          },
          {
            name: "failed",
            description: "Failed check",
            status: "failed" as const,
            evidence: "Evidence",
          },
          {
            name: "skipped",
            description: "Skipped check",
            status: "skipped" as const,
            evidence: "Evidence",
          },
        ],
        findings: [],
        suggestions: [],
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      const checks = (result as VerifierOutput).checks;
      expect(checks).toHaveLength(3);
      expect(checks[0].status).toBe("passed");
      expect(checks[1].status).toBe("failed");
      expect(checks[2].status).toBe("skipped");
    });
  });

  describe("act", () => {
    const task = {
      id: "task-1",
      type: "verification",
      description: "Test task",
      input: {},
      priority: 1,
    };

    let context: { sessionId: string; board: Blackboard; history: ChatMessage[] };

    beforeEach(() => {
      context = {
        sessionId: "session-1",
        board: blackboard,
        history: [],
      };
    });

    it("should write verification result to knowledge", async () => {
      const verification: VerifierOutput = {
        type: "verification",
        content: "Test content",
        passed: true,
        score: 85,
        checks: [
          {
            name: "Test check",
            description: "Test description",
            status: "passed" as const,
            evidence: "Test evidence",
          },
        ],
        findings: [],
        suggestions: ["Test suggestion"],
      };

      const result = await agent["act"](verification, context);

      expect(result).toEqual(verification);

      const knowledge = blackboard.read("knowledge", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(knowledge).toBeDefined();
    });

    it("should emit verification.completed event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.completed", eventSpy);

      const verification: VerifierOutput = {
        type: "verification",
        content: "Test content",
        passed: true,
        score: 90,
        checks: [],
        findings: [],
        suggestions: [],
      };

      await agent["act"](verification, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("verifier-1");
      expect(eventData.result).toBe(verification);
    });

    it("should emit verification.critical event when critical findings exist", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.critical", eventSpy);

      const verification: VerifierOutput = {
        type: "verification",
        content: "Test content",
        passed: false,
        score: 50,
        checks: [],
        findings: [
          {
            id: "critical-1",
            type: "error" as const,
            description: "Critical issue",
            severity: "critical" as const,
          },
          {
            id: "warning-1",
            type: "warning" as const,
            description: "Warning issue",
            severity: "medium" as const,
          },
        ],
        suggestions: [],
      };

      await agent["act"](verification, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("verifier-1");
      expect(eventData.findings).toHaveLength(1);
      expect(eventData.findings[0].id).toBe("critical-1");
    });

    it("should not emit verification.critical event when no critical findings", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("verification.critical", eventSpy);

      const verification: VerifierOutput = {
        type: "verification",
        content: "Test content",
        passed: true,
        score: 80,
        checks: [],
        findings: [
          {
            id: "warning-1",
            type: "warning" as const,
            description: "Warning issue",
            severity: "medium" as const,
          },
        ],
        suggestions: [],
      };

      await agent["act"](verification, context);

      expect(eventSpy).not.toHaveBeenCalled();
    });
  });
});

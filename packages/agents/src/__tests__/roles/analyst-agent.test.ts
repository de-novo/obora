import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { AnalystAgent, createAnalystAgent } from "../../roles/analyst-agent";
import { AgentRole, AnalystOutput, AgentContext } from "../../roles/base-agent";
import { Blackboard } from "@obora-kit/blackboard";
import { ChatMessage } from "../../llm/adapter";

describe("AnalystAgent", () => {
  let mockLlm: MockLLMAdapter;
  let blackboard: Blackboard;
  let agent: AnalystAgent;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
    blackboard = new Blackboard();
    agent = new AnalystAgent({
      id: "analyst-1",
      llm: mockLlm,
    });
  });

  describe("constructor", () => {
    it("should create agent with ANALYST role", () => {
      expect(agent.id).toBe("analyst-1");
      expect(agent.role).toBe(AgentRole.ANALYST);
    });

    it("should have correct system prompt", () => {
      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("expert analyst");
      expect(systemPrompt).toContain("data analysis");
      expect(systemPrompt).toContain("risk assessment");
    });
  });

  describe("createAnalystAgent", () => {
    it("should create analyst agent using factory function", () => {
      const factoryAgent = createAnalystAgent("analyst-factory", mockLlm);

      expect(factoryAgent).toBeInstanceOf(AnalystAgent);
      expect(factoryAgent.id).toBe("analyst-factory");
      expect(factoryAgent.role).toBe(AgentRole.ANALYST);
    });
  });

  describe("execute", () => {
    const task = {
      id: "task-1",
      type: "analysis",
      description: "Analyze market data",
      input: {
        content: "Market data analysis request",
        goal: "Identify trends",
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

    it("should execute analysis task successfully", async () => {
      const jsonResponse = JSON.stringify({
        summary: "Market is trending upward",
        keyFindings: ["Growth in Q3", "Increased demand"],
        recommendations: ["Increase production", "Expand marketing"],
        confidence: 85,
        reasoning: "Based on historical data",
      });
      mockLlm.setResponse("Analyze market data", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect((result.output as AnalystOutput).type).toBe("analysis");
      expect((result.output as AnalystOutput).summary).toBe("Market is trending upward");
    });

    it("should parse JSON response correctly", async () => {
      const jsonResponse = JSON.stringify({
        summary: "Test summary",
        keyFindings: ["Finding 1", "Finding 2"],
        recommendations: ["Recommendation 1"],
        confidence: 90,
        reasoning: "Test reasoning",
      });
      mockLlm.setResponse("Analyze market data", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      const output = result.output as AnalystOutput;
      expect(output.summary).toBe("Test summary");
      expect(output.keyFindings).toEqual(["Finding 1", "Finding 2"]);
      expect(output.recommendations).toEqual(["Recommendation 1"]);
      expect(output.confidence).toBe(90);
      expect(output.reasoning).toBe("Test reasoning");
    });

    it("should handle non-JSON response gracefully", async () => {
      mockLlm.setResponse("Analyze market data", "This is a plain text response");

      const result = await agent.execute(task, context);

      const output = result.output as AnalystOutput;
      expect(output.type).toBe("analysis");
      expect(output.summary).toBe("This is a plain text response");
      expect(output.keyFindings).toEqual([]);
      expect(output.recommendations).toEqual([]);
      expect(output.confidence).toBe(50);
    });

    it("should parse JSON without markdown code block", async () => {
      const jsonResponse = JSON.stringify({
        summary: "Parsed summary",
        keyFindings: ["Parsed finding"],
        recommendations: ["Parsed recommendation"],
        confidence: 75,
        reasoning: "Parsed reasoning",
      });
      mockLlm.setResponse(
        "Analyze market data",
        `{"summary": "Parsed summary", "keyFindings": ["Parsed finding"], "recommendations": ["Parsed recommendation"], "confidence": 75, "reasoning": "Parsed reasoning"}`
      );

      const result = await agent.execute(task, context);

      const output = result.output as AnalystOutput;
      expect(output.summary).toBe("Parsed summary");
      expect(output.confidence).toBe(75);
    });

    it("should write analysis to knowledge section", async () => {
      const jsonResponse = JSON.stringify({
        summary: "Test analysis",
        keyFindings: ["Test finding"],
        recommendations: ["Test recommendation"],
        confidence: 80,
        reasoning: "Test reasoning",
      });
      mockLlm.setResponse("Analyze market data", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      const knowledge = blackboard.read("knowledge", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(knowledge).toBeDefined();

      const analysisSection = knowledge?.analysis as Record<string, unknown> | undefined;
      expect(analysisSection).toBeDefined();

      const analystKeys = Object.keys(analysisSection ?? {}).filter((k) =>
        k.startsWith("analyst-1")
      );
      expect(analystKeys.length).toBeGreaterThan(0);

      const timestampKeys = Object.keys(
        (analysisSection?.["analyst-1"] as Record<string, unknown>) ?? {}
      );
      expect(timestampKeys.length).toBeGreaterThan(0);
    });

    it("should emit analysis.completed event", async () => {
      const eventSpy = vi.fn();
      blackboard.on?.("analysis.completed", eventSpy);

      const jsonResponse = JSON.stringify({
        summary: "Test analysis",
        keyFindings: ["Test finding"],
        recommendations: ["Test recommendation"],
        confidence: 80,
        reasoning: "Test reasoning",
      });
      mockLlm.setResponse("Analyze market data", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(eventSpy).toHaveBeenCalled();
      const eventData = eventSpy.mock.calls[0][0];
      expect(eventData.agentId).toBe("analyst-1");
      expect(eventData.result).toBeDefined();
    });

    it("should include content from original response", async () => {
      const content = "Analysis content goes here";
      const jsonResponse = JSON.stringify({
        summary: "Test summary",
        keyFindings: ["Test finding"],
        recommendations: ["Test recommendation"],
        confidence: 80,
        reasoning: "Test reasoning",
      });
      mockLlm.setResponse("Analyze market data", `${content}\n\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      const output = result.output as AnalystOutput;
      expect(output.content).toContain(content);
    });
  });

  describe("parseResponse", () => {
    const task = {
      id: "task-1",
      type: "analysis",
      description: "Test task",
      input: {},
      priority: 1,
    };

    it("should parse markdown JSON block", () => {
      const jsonContent = JSON.stringify({
        summary: "Summary",
        keyFindings: ["Finding"],
        recommendations: ["Recommendation"],
        confidence: 70,
        reasoning: "Reasoning",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("analysis");
      expect((result as AnalystOutput).summary).toBe("Summary");
    });

    it("should parse plain JSON", () => {
      const jsonContent = JSON.stringify({
        summary: "Plain JSON Summary",
        keyFindings: ["Plain Finding"],
        recommendations: ["Plain Recommendation"],
        confidence: 60,
        reasoning: "Plain Reasoning",
      });
      const content = jsonContent;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("analysis");
      expect((result as AnalystOutput).summary).toBe("Plain JSON Summary");
    });

    it("should handle invalid JSON", () => {
      const content = "This is not valid JSON {invalid";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("analysis");
      expect((result as AnalystOutput).summary).toBe(content);
      expect((result as AnalystOutput).confidence).toBe(50);
    });

    it("should handle empty JSON block", () => {
      const content = "\`\`\`json\n{}\n\`\`\`";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("analysis");
    });

    it("should include sources if provided", () => {
      const jsonContent = JSON.stringify({
        summary: "Summary",
        keyFindings: ["Finding"],
        recommendations: ["Recommendation"],
        confidence: 85,
        reasoning: "Reasoning",
        sources: ["source1", "source2"],
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect((result as AnalystOutput).sources).toEqual(["source1", "source2"]);
    });
  });

  describe("act", () => {
    const task = {
      id: "task-1",
      type: "analysis",
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

    it("should write analysis result to knowledge", async () => {
      const analysisResult: AnalystOutput = {
        type: "analysis",
        content: "Test content",
        summary: "Test summary",
        keyFindings: ["Test finding"],
        recommendations: ["Test recommendation"],
        confidence: 80,
        reasoning: "Test reasoning",
      };

      const result = await agent["act"](analysisResult, context);

      expect(result).toEqual(analysisResult);

      const knowledge = blackboard.read("knowledge", { strict: false }) as Record<
        string,
        unknown
      > | null;
      expect(knowledge).toBeDefined();
    });
  });
});

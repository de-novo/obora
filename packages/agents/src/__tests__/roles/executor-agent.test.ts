import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { ExecutorAgent, createExecutorAgent } from "../../roles/executor-agent";
import { AgentRole, ExecutorOutput, AgentContext } from "../../roles/base-agent";
import { Blackboard } from "@obora-kit/blackboard";
import { ChatMessage } from "../../llm/adapter";
import type { ToolRegistry } from "../../tools";

describe("ExecutorAgent", () => {
  let mockLlm: MockLLMAdapter;
  let blackboard: Blackboard;
  let agent: ExecutorAgent;
  let mockToolRegistry: ToolRegistry;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
    blackboard = new Blackboard();
    mockToolRegistry = {
      listTools: vi.fn().mockReturnValue([
        { name: "tool1", description: "Test tool 1" },
        { name: "tool2", description: "Test tool 2" },
      ]),
      execute: vi.fn().mockResolvedValue({ result: "executed" }),
    } as unknown as ToolRegistry;
    agent = new ExecutorAgent({
      id: "executor-1",
      llm: mockLlm,
      toolRegistry: mockToolRegistry,
    });
  });

  describe("constructor", () => {
    it("should create agent with EXECUTOR role", () => {
      expect(agent.id).toBe("executor-1");
      expect(agent.role).toBe(AgentRole.EXECUTOR);
    });

    it("should have correct system prompt", () => {
      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("executor agent");
      expect(systemPrompt).toContain("taking action");
      expect(systemPrompt).toContain("executing tasks");
    });

    it("should include available tools in system prompt", () => {
      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("tool1");
      expect(systemPrompt).toContain("tool2");
    });
  });

  describe("createExecutorAgent", () => {
    it("should create executor agent using factory function", () => {
      const factoryAgent = createExecutorAgent("executor-factory", mockLlm);

      expect(factoryAgent).toBeInstanceOf(ExecutorAgent);
      expect(factoryAgent.id).toBe("executor-factory");
      expect(factoryAgent.role).toBe(AgentRole.EXECUTOR);
    });

    it("should create executor agent with tool registry", () => {
      const factoryAgent = createExecutorAgent("executor-factory", mockLlm, mockToolRegistry);

      expect(factoryAgent).toBeInstanceOf(ExecutorAgent);
    });
  });

  describe("execute", () => {
    const task = {
      id: "task-1",
      type: "execution",
      description: "Execute file processing",
      input: {
        content: "Process data files",
        taskDescription: "Process data files",
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

    it("should execute task successfully", async () => {
      const jsonResponse = JSON.stringify({
        action: "process files",
        tool: "tool1",
        parameters: { input: "data.txt" },
        steps: ["Read file", "Process data", "Write output"],
        expectedOutcome: "Files processed successfully",
      });
      mockLlm.setResponse("Execute file processing", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output).toEqual({ result: "executed" });
    });

    it("should parse JSON response correctly", async () => {
      const jsonResponse = JSON.stringify({
        action: "Test action",
        tool: "tool2",
        parameters: { key: "value" },
        steps: ["Step 1", "Step 2"],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse("Execute file processing", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      const result = await agent.execute(task, context);

      expect(result.output).toEqual({ result: "executed" });
      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        "tool2",
        { key: "value" },
        expect.any(Object)
      );
    });

    it("should handle non-JSON response gracefully", async () => {
      mockLlm.setResponse("Execute file processing", "This is a plain text response");

      const result = await agent.execute(task, context);

      const output = result.output as ExecutorOutput;
      expect(output.type).toBe("execution");
      expect(output.action).toBe("This is a plain text response");
      expect(output.parameters).toEqual({});
      expect(output.steps).toEqual(["This is a plain text response"]);
      expect(output.expectedOutcome).toBe("Task execution");
    });

    it("should parse JSON without markdown code block", async () => {
      mockLlm.setResponse(
        "Execute file processing",
        `{"action": "Parsed action", "tool": "tool1", "parameters": {"key": "value"}, "steps": ["Step 1"], "expectedOutcome": "Parsed outcome"}`
      );

      const result = await agent.execute(task, context);

      expect(result.output).toEqual({ result: "executed" });
      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        "tool1",
        { key: "value" },
        expect.any(Object)
      );
    });

    it("should write execution result to state section", async () => {
      const jsonResponse = JSON.stringify({
        action: "Test action",
        steps: ["Step 1"],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse("Execute file processing", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      const state = blackboard.read("state", { strict: false }) as Record<string, unknown> | null;
      expect(state).toBeDefined();

      const executionSection = state?.execution as Record<string, unknown> | undefined;
      expect(executionSection).toBeDefined();

      const executorKeys = Object.keys(executionSection ?? {}).filter((k) =>
        k.startsWith("executor-1")
      );
      expect(executorKeys.length).toBeGreaterThan(0);
    });

    it("should execute tool when tool is specified", async () => {
      const jsonResponse = JSON.stringify({
        action: "Execute tool1",
        tool: "tool1",
        parameters: { input: "test" },
        steps: ["Step 1"],
        expectedOutcome: "Tool executed",
      });
      mockLlm.setResponse("Execute file processing", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        "tool1",
        {
          input: "test",
        },
        expect.any(Object)
      );
    });

    it("should write execution state with tool result", async () => {
      const jsonResponse = JSON.stringify({
        action: "Execute tool1",
        tool: "tool1",
        parameters: { input: "test" },
        steps: ["Step 1"],
        expectedOutcome: "Tool executed",
      });
      mockLlm.setResponse("Execute file processing", `\`\`\`json\n${jsonResponse}\n\`\`\``);

      await agent.execute(task, context);

      const state = blackboard.read("state", { strict: false }) as Record<string, unknown> | null;
      const executionSection = state?.execution as Record<string, unknown> | undefined;
      const executorKeys = Object.keys(executionSection ?? {}).filter((k) =>
        k.startsWith("executor-1")
      );
      const firstKey = executorKeys[0];
      const firstExecutionData = (executionSection?.[firstKey] as Record<string, unknown>) ?? {};
      const timestampKey = Object.keys(firstExecutionData)[0];
      const executionData = firstExecutionData[timestampKey] as Record<string, unknown> | undefined;

      expect(executionData?.toolResult).toBeDefined();
    });

    it("should include content from original response", async () => {
      const content = "Execution plan content";
      const jsonResponse = JSON.stringify({
        action: "Test action",
        steps: ["Step 1"],
        expectedOutcome: "Test outcome",
      });
      mockLlm.setResponse(
        "Execute file processing",
        `${content}\n\`\`\`json\n${jsonResponse}\n\`\`\``
      );

      const result = await agent.execute(task, context);

      const output = result.output as ExecutorOutput;
      expect(output.content).toContain(content);
    });
  });

  describe("parseResponse", () => {
    const task = {
      id: "task-1",
      type: "execution",
      description: "Test task",
      input: {},
      priority: 1,
    };

    it("should parse markdown JSON block", () => {
      const jsonContent = JSON.stringify({
        action: "Execute action",
        tool: "tool1",
        parameters: { key: "value" },
        steps: ["Step 1", "Step 2"],
        expectedOutcome: "Execution completed",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("execution");
      expect((result as ExecutorOutput).action).toBe("Execute action");
    });

    it("should parse plain JSON", () => {
      const jsonContent = JSON.stringify({
        action: "Plain JSON action",
        tool: "tool2",
        parameters: {},
        steps: ["Plain step"],
        expectedOutcome: "Plain outcome",
      });
      const content = jsonContent;

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("execution");
      expect((result as ExecutorOutput).action).toBe("Plain JSON action");
    });

    it("should handle invalid JSON", () => {
      const content = "This is not valid JSON {invalid";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("execution");
      expect((result as ExecutorOutput).action).toBe(content);
      expect((result as ExecutorOutput).parameters).toEqual({});
    });

    it("should handle empty JSON block", () => {
      const content = "\`\`\`json\n{}\n\`\`\`";

      const result = agent["parseResponse"](content, task);

      expect(result.type).toBe("execution");
    });

    it("should parse response with tool specified", () => {
      const jsonContent = JSON.stringify({
        action: "Execute tool",
        tool: "tool1",
        parameters: { input: "data" },
        steps: ["Execute"],
        expectedOutcome: "Done",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect((result as ExecutorOutput).tool).toBe("tool1");
      expect((result as ExecutorOutput).parameters).toEqual({ input: "data" });
    });

    it("should parse response without tool", () => {
      const jsonContent = JSON.stringify({
        action: "Direct action",
        steps: ["Step 1", "Step 2"],
        expectedOutcome: "Action completed",
      });
      const content = `\`\`\`json\n${jsonContent}\n\`\`\``;

      const result = agent["parseResponse"](content, task);

      expect((result as ExecutorOutput).action).toBe("Direct action");
      expect((result as ExecutorOutput).tool).toBeUndefined();
    });
  });

  describe("act", () => {
    const task = {
      id: "task-1",
      type: "execution",
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

    it("should write execution result to state", async () => {
      const plan: ExecutorOutput = {
        type: "execution",
        content: "Test content",
        action: "Test action",
        parameters: { key: "value" },
        steps: ["Step 1", "Step 2"],
        expectedOutcome: "Test outcome",
      };

      const result = await agent["act"](plan, context);

      expect(result).toEqual(plan);

      const state = blackboard.read("state", { strict: false }) as Record<string, unknown> | null;
      expect(state).toBeDefined();
    });

    it("should execute tool when tool is provided", async () => {
      const plan: ExecutorOutput = {
        type: "execution",
        content: "Test content",
        action: "Test action",
        tool: "tool1",
        parameters: { input: "test" },
        steps: ["Step 1"],
        expectedOutcome: "Test outcome",
      };

      const result = await agent["act"](plan, context);

      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        "tool1",
        {
          input: "test",
        },
        expect.any(Object)
      );
      expect(result).toEqual({ result: "executed" });
    });
  });

  describe("setToolRegistry", () => {
    it("should set tool registry", () => {
      const newToolRegistry = {
        listTools: vi.fn().mockReturnValue([{ name: "newTool", description: "New tool" }]),
        execute: vi.fn().mockResolvedValue({ result: "new result" }),
      } as unknown as ToolRegistry;

      agent.setToolRegistry(newToolRegistry);

      const systemPrompt = agent["getDefaultSystemPrompt"]();
      expect(systemPrompt).toContain("newTool");
    });
  });
});

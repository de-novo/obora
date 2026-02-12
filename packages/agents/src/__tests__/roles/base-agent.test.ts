import { describe, it, expect, beforeEach } from "vitest";
import { MockLLMAdapter } from "../../llm/mock-adapter";
import { AgentRole, AgentState, BaseAgent, Task, TaskResult } from "../../roles/base-agent";
import { Blackboard } from "@obora-kit/blackboard";
import type { AgentContext } from "../../roles/base-agent";
import type { ChatMessage } from "../../llm/adapter";

class TestAgent extends BaseAgent {
  protected getDefaultSystemPrompt(): string {
    return "You are a test agent.";
  }

  protected async act(action: unknown, _context: unknown): Promise<unknown> {
    return action;
  }

  protected parseResponse(content: string, _task: Task): unknown {
    return { content };
  }
}

describe("BaseAgent", () => {
  let mockLlm: MockLLMAdapter;
  let blackboard: Blackboard;
  let agent: TestAgent;
  let context: AgentContext;

  beforeEach(() => {
    mockLlm = new MockLLMAdapter();
    blackboard = new Blackboard();
    agent = new TestAgent({
      id: "test-agent",
      role: AgentRole.ANALYST,
      llm: mockLlm,
    });
    context = {
      sessionId: "session-1",
      board: blackboard,
      history: [] as ChatMessage[],
    };
    mockLlm.clearResponses();
  });

  describe("constructor", () => {
    it("should create agent with given id and role", () => {
      expect(agent.id).toBe("test-agent");
      expect(agent.role).toBe(AgentRole.ANALYST);
    });

    it("should generate id if not provided", () => {
      const agentWithoutId = new TestAgent({
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });
      expect(agentWithoutId.id).toMatch(/^analyst-\d+$/);
    });

    it("should use default system prompt if not provided", () => {
      const agentWithoutPrompt = new TestAgent({
        id: "test-agent-2",
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });
      expect(agentWithoutPrompt["systemPrompt"]).toBe("You are a test agent.");
    });

    it("should use custom system prompt if provided", () => {
      const agentWithCustomPrompt = new TestAgent({
        id: "test-agent-3",
        role: AgentRole.ANALYST,
        llm: mockLlm,
        systemPrompt: "Custom system prompt",
      });
      expect(agentWithCustomPrompt["systemPrompt"]).toBe("Custom system prompt");
    });

    it("should use default max errors if not provided", () => {
      const agentWithoutMaxErrors = new TestAgent({
        id: "test-agent-4",
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });
      expect(agentWithoutMaxErrors["maxErrors"]).toBe(3);
    });

    it("should use custom max errors if provided", () => {
      const agentWithCustomMaxErrors = new TestAgent({
        id: "test-agent-5",
        role: AgentRole.ANALYST,
        llm: mockLlm,
        maxErrors: 5,
      });
      expect(agentWithCustomMaxErrors["maxErrors"]).toBe(5);
    });

    it("should initialize state to IDLE", () => {
      expect(agent["state"]).toBe(AgentState.IDLE);
      expect(agent["errorCount"]).toBe(0);
    });
  });

  describe("execute", () => {
    const task: Task = {
      id: "task-1",
      type: "test",
      description: "Test task",
      input: { test: "data" },
      priority: 1,
    };

    // outer beforeEach에서 초기화된 context 사용 (shadow 선언 제거)

    it("should execute task successfully", async () => {
      mockLlm.setResponse("", () => "Test response");

      const result = await agent.execute(task, context);

      expect(result.success).toBe(true);
      expect(result.taskId).toBe("task-1");
      expect(result.output).toEqual({ content: "Test response" });
      expect(result.duration).toBeGreaterThan(0);
      expect(result.tokensUsed.prompt).toBe(10);
      expect(result.tokensUsed.completion).toBe(20);
      expect(result.tokensUsed.total).toBe(30);
    });

    it("should set state to THINKING during execution", async () => {
      mockLlm.setResponse("", () => "Test response");

      const executePromise = agent.execute(task, context);
      expect(agent["state"]).toBe(AgentState.THINKING);
      await executePromise;
    });

    it("should set state to IDLE after successful execution", async () => {
      mockLlm.setResponse("", () => "Test response");

      await agent.execute(task, context);
      expect(agent["state"]).toBe(AgentState.IDLE);
    });

    it("should reset error count after successful execution", async () => {
      mockLlm.setResponse("", () => "Test response");

      agent["errorCount"] = 2;
      await agent.execute(task, context);
      expect(agent["errorCount"]).toBe(0);
    });

    it("should handle errors during execution", async () => {
      const errorAgent = new (class extends BaseAgent {
        protected getDefaultSystemPrompt(): string {
          return "Error agent";
        }

        protected async act(_action: unknown, _context: unknown): Promise<unknown> {
          throw new Error("Test error");
        }

        protected parseResponse(_content: string, _task: Task): unknown {
          return null;
        }
      })({
        id: "error-agent",
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });

      mockLlm.setResponse("", () => "Test response");

      const result = await errorAgent.execute(task, context);

      expect(result.success).toBe(false);
      expect(result.output).toBe(null);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe("Test error");
    });

    it("should increment error count on error", async () => {
      const errorAgent = new (class extends BaseAgent {
        protected getDefaultSystemPrompt(): string {
          return "Error agent";
        }

        protected async act(_action: unknown, _context: unknown): Promise<unknown> {
          throw new Error("Test error");
        }

        protected parseResponse(_content: string, _task: Task): unknown {
          return null;
        }
      })({
        id: "error-agent",
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });

      mockLlm.setResponse("", () => "Test response");

      await errorAgent.execute(task, context);
      expect(errorAgent["errorCount"]).toBe(1);
    });

    it("should set state to ERROR on error", async () => {
      const errorAgent = new (class extends BaseAgent {
        protected getDefaultSystemPrompt(): string {
          return "Error agent";
        }

        protected async act(_action: unknown, _context: unknown): Promise<unknown> {
          throw new Error("Test error");
        }

        protected parseResponse(_content: string, _task: Task): unknown {
          return null;
        }
      })({
        id: "error-agent",
        role: AgentRole.ANALYST,
        llm: mockLlm,
      });

      mockLlm.setResponse("", () => "Test response");

      await errorAgent.execute(task, context);
      expect(errorAgent["state"]).toBe(AgentState.ERROR);
    });

    it("should block execution when max errors exceeded", async () => {
      agent["errorCount"] = 3;

      const result = await agent.execute(task, context);

      expect(result.success).toBe(false);
      expect(result.taskId).toBe("task-1");
      expect(result.output).toBe(null);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain("has exceeded maximum error count");
      expect(result.duration).toBe(0);
      expect(result.tokensUsed.prompt).toBe(0);
      expect(result.tokensUsed.completion).toBe(0);
      expect(result.tokensUsed.total).toBe(0);
      expect(agent["state"]).toBe(AgentState.ERROR);
    });
  });

  describe("observe", () => {
    it("should read state and knowledge from blackboard", async () => {
      blackboard.write("state.context.test", { value: "test" });

      const observation = await agent["observe"]({
        sessionId: "session-1",
        board: blackboard,
        history: [] as ChatMessage[],
      });

      expect(observation.currentState).toMatchObject({ context: { test: { value: "test" } } });
      expect(observation.availableKnowledge).toMatchObject({
        facts: [],
        inferences: [],
        patterns: [],
      });
    });

    it("should handle missing state/knowledge gracefully", async () => {
      const observation = await agent["observe"]({
        sessionId: "session-1",
        board: blackboard,
        history: [] as ChatMessage[],
      });

      expect(observation.currentState).toBeDefined();
      expect(observation.availableKnowledge).toBeDefined();
    });
  });

  describe("getStatus", () => {
    it("should return correct status", () => {
      const status = agent.getStatus();

      expect(status.id).toBe("test-agent");
      expect(status.role).toBe(AgentRole.ANALYST);
      expect(status.state).toBe(AgentState.IDLE);
      expect(status.lastActivity).toBeInstanceOf(Date);
      expect(status.currentTask).toBeUndefined();
      expect(status.errorCount).toBe(0);
    });

    it("should reflect error count", () => {
      agent["errorCount"] = 2;
      const status = agent.getStatus();

      expect(status.errorCount).toBe(2);
    });
  });

  describe("resetErrorCount", () => {
    it("should reset error count to zero", () => {
      agent["errorCount"] = 3;
      agent.resetErrorCount();
      expect(agent["errorCount"]).toBe(0);
    });
  });

  describe("hasExceededMaxErrors", () => {
    it("should return false when error count is below max", () => {
      agent["errorCount"] = 2;
      expect(agent.hasExceededMaxErrors()).toBe(false);
    });

    it("should return true when error count equals max", () => {
      agent["errorCount"] = 3;
      expect(agent.hasExceededMaxErrors()).toBe(true);
    });

    it("should return true when error count exceeds max", () => {
      agent["errorCount"] = 4;
      expect(agent.hasExceededMaxErrors()).toBe(true);
    });

    it("should use custom max errors", () => {
      const agentWithCustomMax = new TestAgent({
        id: "test-custom-max",
        role: AgentRole.ANALYST,
        llm: mockLlm,
        maxErrors: 5,
      });

      agentWithCustomMax["errorCount"] = 4;
      expect(agentWithCustomMax.hasExceededMaxErrors()).toBe(false);

      agentWithCustomMax["errorCount"] = 5;
      expect(agentWithCustomMax.hasExceededMaxErrors()).toBe(true);

      agentWithCustomMax["errorCount"] = 6;
      expect(agentWithCustomMax.hasExceededMaxErrors()).toBe(true);
    });
  });

  describe("report", () => {
    it("should write result to blackboard", async () => {
      const task: Task = {
        id: "task-1",
        type: "test",
        description: "Test task",
        input: {},
        priority: 1,
      };

      const result = { testResult: "value" };

      await agent["report"](task, result, {
        sessionId: "session-1",
        board: blackboard,
        history: [] as ChatMessage[],
      });

      const stored = blackboard.read("state.agent.test-agent.lastResult");
      expect(stored).toEqual({
        taskId: "task-1",
        timestamp: expect.any(Date),
        result: { testResult: "value" },
      });
    });
  });
});

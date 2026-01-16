/**
 * Type Safety Tests
 *
 * TypeScript 타입 시스템을 활용한 컴파일 타임 테스트와
 * 런타임 타입 검증 테스트
 */

import { describe, it, expect } from "vitest";
import type {
  AgentDefinition,
  WorkflowStep,
  WorkflowPlan,
  AgentProvider,
  AgentMessage,
  AgentRunOptions,
  AgentResult,
  TokenUsage,
  ProjectConfig,
  ProjectIdentifier,
  ResolvedProject,
} from "../types.js";

describe("types", () => {
  describe("AgentDefinition", () => {
    it("should accept valid agent definition", () => {
      const agent: AgentDefinition = {
        name: "test-agent",
        description: "Test agent",
        allowedTools: ["Read", "Write"],
        systemPrompt: "Test prompt",
      };

      expect(agent.name).toBe("test-agent");
      expect(agent.description).toBe("Test agent");
      expect(agent.allowedTools).toHaveLength(2);
      expect(agent.systemPrompt).toBe("Test prompt");
    });

    it("should allow empty tools array", () => {
      const agent: AgentDefinition = {
        name: "no-tools",
        description: "Agent without tools",
        allowedTools: [],
        systemPrompt: "Prompt",
      };

      expect(agent.allowedTools).toHaveLength(0);
    });
  });

  describe("WorkflowStep", () => {
    it("should accept minimal workflow step", () => {
      const step: WorkflowStep = {
        agent: "test-agent",
        task: "Do something",
      };

      expect(step.agent).toBe("test-agent");
      expect(step.task).toBe("Do something");
    });

    it("should accept workflow step with all fields", () => {
      const step: WorkflowStep = {
        agent: "test-agent",
        task: "Do something",
        reason: "Because it's needed",
        critical: true,
        parallelWith: ["agent2", "agent3"],
      };

      expect(step.critical).toBe(true);
      expect(step.parallelWith).toHaveLength(2);
    });

    it("should allow optional fields to be undefined", () => {
      const step: WorkflowStep = {
        agent: "test",
        task: "task",
        reason: undefined,
        critical: undefined,
        parallelWith: undefined,
      };

      expect(step.reason).toBeUndefined();
    });
  });

  describe("WorkflowPlan", () => {
    it("should accept minimal workflow plan", () => {
      const plan: WorkflowPlan = {
        analysis: "Analysis text",
        workflow: [],
      };

      expect(plan.analysis).toBe("Analysis text");
      expect(plan.workflow).toHaveLength(0);
    });

    it("should accept workflow plan with feedback loop", () => {
      const plan: WorkflowPlan = {
        analysis: "Analysis",
        workflow: [
          { agent: "agent1", task: "task1" },
          { agent: "agent2", task: "task2" },
        ],
        feedbackLoop: {
          enabled: true,
          maxIterations: 3,
        },
      };

      expect(plan.feedbackLoop?.enabled).toBe(true);
      expect(plan.feedbackLoop?.maxIterations).toBe(3);
    });

    it("should allow disabled feedback loop", () => {
      const plan: WorkflowPlan = {
        analysis: "Analysis",
        workflow: [],
        feedbackLoop: {
          enabled: false,
          maxIterations: 0,
        },
      };

      expect(plan.feedbackLoop?.enabled).toBe(false);
    });
  });

  describe("AgentProvider", () => {
    it("should implement provider interface", async () => {
      const mockProvider: AgentProvider = {
        name: "mock",
        async *runAgent() {
          yield { type: "text", content: "Hello" };
          yield { type: "result", content: "Done" };
        },
      };

      expect(mockProvider.name).toBe("mock");

      const messages: AgentMessage[] = [];
      for await (const msg of mockProvider.runAgent(
        {
          name: "test",
          description: "test",
          allowedTools: [],
          systemPrompt: "test",
        },
        "task",
        "/tmp"
      )) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(2);
      expect(messages[0]?.type).toBe("text");
      expect(messages[1]?.type).toBe("result");
    });

    it("should handle empty message stream", async () => {
      const emptyProvider: AgentProvider = {
        name: "empty",
        async *runAgent() {
          // Empty stream
        },
      };

      const messages: AgentMessage[] = [];
      for await (const msg of emptyProvider.runAgent(
        { name: "test", description: "test", allowedTools: [], systemPrompt: "test" },
        "task",
        "/tmp"
      )) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(0);
    });
  });

  describe("AgentMessage", () => {
    it("should accept text message", () => {
      const msg: AgentMessage = {
        type: "text",
        content: "Hello world",
      };

      expect(msg.type).toBe("text");
      expect(msg.content).toBe("Hello world");
    });

    it("should accept tool_use message with metadata", () => {
      const msg: AgentMessage = {
        type: "tool_use",
        content: "",
        metadata: {
          toolName: "Read",
          toolInput: { file_path: "/test.ts" },
        },
      };

      expect(msg.metadata?.toolName).toBe("Read");
      expect(msg.metadata?.toolInput).toEqual({ file_path: "/test.ts" });
    });

    it("should accept result message with token usage", () => {
      const msg: AgentMessage = {
        type: "result",
        content: "Task completed",
        metadata: {
          tokens: {
            inputTokens: 100,
            outputTokens: 50,
            totalTokens: 150,
          },
        },
      };

      expect(msg.metadata?.tokens?.totalTokens).toBe(150);
    });

    it("should accept error message", () => {
      const msg: AgentMessage = {
        type: "error",
        content: "Something went wrong",
      };

      expect(msg.type).toBe("error");
    });
  });

  describe("AgentRunOptions", () => {
    it("should accept empty options", () => {
      const options: AgentRunOptions = {};

      expect(options.maxTurns).toBeUndefined();
    });

    it("should accept all options", () => {
      const onMessage = (msg: AgentMessage) => {
        console.log(msg);
      };

      const mockTracker = {
        startAgentRun: () => "run-1",
        updateCurrentTool: () => {},
        completeToolCall: () => {},
        completeAgentRun: () => {},
        startStep: () => {},
        completeStep: () => {},
      };

      const options: AgentRunOptions = {
        maxTurns: 10,
        onMessage,
        tracker: mockTracker,
        model: "sonnet",
      };

      expect(options.maxTurns).toBe(10);
      expect(options.model).toBe("sonnet");
    });
  });

  describe("AgentResult", () => {
    it("should accept successful result", () => {
      const result: AgentResult = {
        success: true,
        output: "Task completed successfully",
      };

      expect(result.success).toBe(true);
      expect(result.output).toBe("Task completed successfully");
    });

    it("should accept failed result", () => {
      const result: AgentResult = {
        success: false,
        output: "",
        error: "Task failed",
      };

      expect(result.success).toBe(false);
      expect(result.error).toBe("Task failed");
    });

    it("should allow error in successful result", () => {
      const result: AgentResult = {
        success: true,
        output: "Done",
        error: undefined,
      };

      expect(result.success).toBe(true);
    });
  });

  describe("TokenUsage", () => {
    it("should accept valid token usage", () => {
      const usage: TokenUsage = {
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
      };

      expect(usage.totalTokens).toBe(150);
    });

    it("should accept zero tokens", () => {
      const usage: TokenUsage = {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      };

      expect(usage.totalTokens).toBe(0);
    });
  });

  describe("ProjectConfig", () => {
    it("should accept minimal project config", () => {
      const config: ProjectConfig = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Test Project",
        createdAt: "2026-01-16T00:00:00Z",
      };

      expect(config.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(config.name).toBe("Test Project");
    });

    it("should accept full project config", () => {
      const config: ProjectConfig = {
        id: "550e8400-e29b-41d4-a716-446655440000",
        name: "Full Project",
        description: "A complete project",
        createdAt: "2026-01-16T00:00:00Z",
        workflow: {
          defaultType: "implement",
          feedbackLoop: {
            enabled: true,
            maxIterations: 3,
          },
        },
        sync: {
          enabled: true,
          organizationId: "org-123",
          autoSync: true,
        },
      };

      expect(config.workflow?.defaultType).toBe("implement");
      expect(config.sync?.enabled).toBe(true);
    });
  });

  describe("ProjectIdentifier", () => {
    it("should accept only local path", () => {
      const identifier: ProjectIdentifier = {
        localPath: "/path/to/project",
      };

      expect(identifier.localPath).toBe("/path/to/project");
    });

    it("should accept all identifiers", () => {
      const identifier: ProjectIdentifier = {
        configId: "550e8400-e29b-41d4-a716-446655440000",
        gitRemote: "https://github.com/user/repo.git",
        localPath: "/path/to/project",
      };

      expect(identifier.configId).toBeDefined();
      expect(identifier.gitRemote).toBeDefined();
    });
  });

  describe("ResolvedProject", () => {
    it("should accept resolved project identified by config", () => {
      const project: ResolvedProject = {
        id: "db-id-123",
        name: "My Project",
        path: "/path/to/project",
        identifiedBy: "config",
        hasConfig: true,
        syncEnabled: false,
      };

      expect(project.identifiedBy).toBe("config");
      expect(project.hasConfig).toBe(true);
    });

    it("should accept resolved project identified by git", () => {
      const project: ResolvedProject = {
        id: "db-id-456",
        name: "Git Project",
        path: "/path/to/git-project",
        identifiedBy: "git",
        hasConfig: false,
        syncEnabled: false,
      };

      expect(project.identifiedBy).toBe("git");
      expect(project.hasConfig).toBe(false);
    });

    it("should accept resolved project identified by path", () => {
      const project: ResolvedProject = {
        id: "db-id-789",
        name: "Local Project",
        path: "/local/project",
        identifiedBy: "path",
        hasConfig: false,
        syncEnabled: true,
      };

      expect(project.identifiedBy).toBe("path");
      expect(project.syncEnabled).toBe(true);
    });
  });

  describe("Type Guards", () => {
    it("should distinguish between success and error results", () => {
      const successResult: AgentResult = {
        success: true,
        output: "Done",
      };

      const errorResult: AgentResult = {
        success: false,
        output: "",
        error: "Failed",
      };

      if (successResult.success) {
        expect(successResult.output).toBe("Done");
      }

      if (!errorResult.success) {
        expect(errorResult.error).toBe("Failed");
      }
    });

    it("should distinguish message types", () => {
      const messages: AgentMessage[] = [
        { type: "text", content: "Hello" },
        { type: "tool_use", content: "", metadata: { toolName: "Read" } },
        { type: "result", content: "Done" },
        { type: "error", content: "Failed" },
      ];

      const textMessages = messages.filter((m) => m.type === "text");
      const toolMessages = messages.filter((m) => m.type === "tool_use");
      const resultMessages = messages.filter((m) => m.type === "result");
      const errorMessages = messages.filter((m) => m.type === "error");

      expect(textMessages).toHaveLength(1);
      expect(toolMessages).toHaveLength(1);
      expect(resultMessages).toHaveLength(1);
      expect(errorMessages).toHaveLength(1);
    });
  });
});

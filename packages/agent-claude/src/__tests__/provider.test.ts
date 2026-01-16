/**
 * Claude Agent Provider Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClaudeAgentProvider, simpleQuery } from "../provider.js";
import type { AgentDefinition } from "@obora/workflow-core";

// Hoist mock before imports
const mockQuery = vi.hoisted(() => vi.fn());
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: mockQuery,
}));

describe("ClaudeAgentProvider", () => {
  let provider: ClaudeAgentProvider;
  let mockAgent: AgentDefinition;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new ClaudeAgentProvider();
    mockAgent = {
      name: "test-agent",
      description: "Test agent",
      allowedTools: ["Read", "Write"],
      systemPrompt: "You are a test agent.",
    };
  });

  describe("constructor", () => {
    it("should create provider with default options", () => {
      const defaultProvider = new ClaudeAgentProvider();

      expect(defaultProvider.name).toBe("claude");
    });

    it("should accept custom options", () => {
      const customProvider = new ClaudeAgentProvider({
        maxTurns: 20,
        settingSources: ["project", "user"],
      });

      expect(customProvider.name).toBe("claude");
    });
  });

  describe("runAgent", () => {
    it("should yield text messages", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "text",
                text: "Hello from agent",
              },
            ],
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Do something", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe("text");
      expect(messages[0]?.content).toBe("Hello from agent");
    });

    it("should yield tool_use messages", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [
              {
                type: "tool_use",
                name: "Read",
                input: { file_path: "/test.ts" },
              },
            ],
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Read a file", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe("tool_use");
      expect(messages[0]?.metadata?.toolName).toBe("Read");
      expect(messages[0]?.metadata?.toolInput).toEqual({ file_path: "/test.ts" });
    });

    it("should yield tool_result messages", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                content: "File content here",
              },
            ],
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe("tool_result");
      expect(messages[0]?.content).toBe("File content here");
    });

    it("should yield result message with token usage", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Processing..." }],
            usage: {
              input_tokens: 100,
              output_tokens: 50,
            },
          },
        };
        yield {
          type: "result",
          result: "Task completed",
          is_error: false,
          usage: {
            total_tokens: 150,
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      const resultMsg = messages.find((m) => m.type === "result");
      expect(resultMsg).toBeDefined();
      expect(resultMsg?.content).toBe("Task completed");
      expect(resultMsg?.metadata?.tokens?.inputTokens).toBe(100);
      expect(resultMsg?.metadata?.tokens?.outputTokens).toBe(50);
      expect(resultMsg?.metadata?.tokens?.totalTokens).toBe(150);
    });

    it("should yield error message when result has error", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "result",
          result: "Something went wrong",
          is_error: true,
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe("error");
      expect(messages[0]?.content).toBe("Something went wrong");
    });

    it("should handle SDK exceptions", async () => {
      mockQuery.mockImplementation(async function* () {
        throw new Error("SDK error");
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(1);
      expect(messages[0]?.type).toBe("error");
      expect(messages[0]?.content).toBe("SDK error");
    });

    it("should accumulate token usage from multiple messages", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 1" }],
            usage: { input_tokens: 50, output_tokens: 25 },
          },
        };
        yield {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Step 2" }],
            usage: { input_tokens: 30, output_tokens: 20 },
          },
        };
        yield {
          type: "result",
          result: "Done",
          is_error: false,
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      const resultMsg = messages.find((m) => m.type === "result");
      expect(resultMsg?.metadata?.tokens?.inputTokens).toBe(80);
      expect(resultMsg?.metadata?.tokens?.outputTokens).toBe(45);
      expect(resultMsg?.metadata?.tokens?.totalTokens).toBe(125);
    });

    it("should include cache tokens in input count", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: [{ type: "text", text: "Cached" }],
            usage: {
              input_tokens: 50,
              output_tokens: 25,
              cache_creation_input_tokens: 10,
              cache_read_input_tokens: 5,
            },
          },
        };
        yield {
          type: "result",
          result: "Done",
          is_error: false,
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      const resultMsg = messages.find((m) => m.type === "result");
      expect(resultMsg?.metadata?.tokens?.inputTokens).toBe(65);
    });

    it("should construct full prompt with system prompt and task", async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: "result", result: "Done", is_error: false };
      });

      for await (const msg of provider.runAgent(mockAgent, "Do task", "/test/dir")) {
        // Consume messages
      }

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: expect.stringContaining("You are a test agent."),
        options: {
          cwd: "/test/dir",
          allowedTools: ["Read", "Write"],
          maxTurns: 10,
          settingSources: ["project"],
        },
      });

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: expect.stringContaining("Do task"),
        options: expect.any(Object),
      });
    });

    it("should handle non-string tool result content", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                content: { data: "object" },
              },
            ],
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      expect(messages[0]?.type).toBe("tool_result");
      expect(messages[0]?.content).toBe("");
    });

    it("should handle non-array message content", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "assistant",
          message: {
            content: "Not an array",
          },
        };
      });

      const messages = [];
      for await (const msg of provider.runAgent(mockAgent, "Task", "/tmp")) {
        messages.push(msg);
      }

      expect(messages).toHaveLength(0);
    });
  });

  describe("simpleQuery", () => {
    it("should execute simple query and return result", async () => {
      mockQuery.mockImplementation(async function* () {
        yield {
          type: "result",
          result: "Query result",
          is_error: false,
        };
      });

      const result = await simpleQuery("What is 2+2?", "/tmp");

      expect(result).toBe("Query result");
    });

    it("should use default allowed tools", async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: "result", result: "Done", is_error: false };
      });

      await simpleQuery("Task", "/tmp");

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Task",
        options: {
          cwd: "/tmp",
          allowedTools: ["Read", "Glob", "Grep", "Bash"],
          maxTurns: 5,
          settingSources: ["project"],
        },
      });
    });

    it("should accept custom allowed tools", async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: "result", result: "Done", is_error: false };
      });

      await simpleQuery("Task", "/tmp", ["Read", "Write"]);

      expect(mockQuery).toHaveBeenCalledWith({
        prompt: "Task",
        options: {
          cwd: "/tmp",
          allowedTools: ["Read", "Write"],
          maxTurns: 5,
          settingSources: ["project"],
        },
      });
    });

    it("should call onMessage callback for each message", async () => {
      const { query } = await import("@anthropic-ai/claude-agent-sdk");
      const mockQuery = vi.mocked(query);

      const messages: unknown[] = [];
      const onMessage = vi.fn((msg) => messages.push(msg));

      mockQuery.mockImplementation(async function* () {
        yield { type: "assistant", message: { content: [] } };
        yield { type: "result", result: "Done", is_error: false };
      });

      await simpleQuery("Task", "/tmp", undefined, onMessage);

      expect(onMessage).toHaveBeenCalledTimes(2);
    });

    it("should return empty string when no result message", async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: "assistant", message: { content: [] } };
      });

      const result = await simpleQuery("Task", "/tmp");

      expect(result).toBe("");
    });

    it("should return last result when multiple results", async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: "result", result: "First", is_error: false };
        yield { type: "result", result: "Second", is_error: false };
        yield { type: "result", result: "Third", is_error: false };
      });

      const result = await simpleQuery("Task", "/tmp");

      expect(result).toBe("Third");
    });
  });
});

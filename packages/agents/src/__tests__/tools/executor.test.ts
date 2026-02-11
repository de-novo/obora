import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../tools/registry";
import { ToolExecutor } from "../../tools/executor";
import { ToolContext } from "../../tools/types";

describe("ToolExecutor", () => {
  const context: ToolContext = {
    sessionId: "s1",
    agentId: "a1",
    permissions: new Set(["*"]),
  };

  it("should return error on invalid JSON arguments", async () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);
    const response = await executor.handleFunctionCall(
      { id: "1", name: "noop", arguments: "{invalid" },
      context
    );
    expect(response.error).toContain("Invalid JSON");
  });

  it("should execute tool and return JSON result", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "greet",
      description: "greet",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { message: "hi" };
      },
    });
    const executor = new ToolExecutor(registry);
    const response = await executor.handleFunctionCall(
      { id: "1", name: "greet", arguments: "{}" },
      context
    );
    expect(response.result).toBe(JSON.stringify({ message: "hi" }));
    expect(response.error).toBeUndefined();
  });

  it("should format tool responses as messages", () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);
    const messages = executor.formatAsMessages([
      { id: "1", result: '{"ok":true}' },
      { id: "2", result: "", error: "Boom" },
    ]);
    expect(messages[0].role).toBe("tool");
    expect(messages[0].toolCallId).toBe("1");
    expect(messages[0].content).toBe('{"ok":true}');
    expect(messages[1].content).toBe("Error: Boom");
  });

  it("should handle multiple function calls", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      async execute(p: any) {
        return p;
      },
    });
    const executor = new ToolExecutor(registry);
    const responses = await executor.handleFunctionCalls(
      [
        { id: "1", name: "echo", arguments: '{"a":1}' },
        { id: "2", name: "echo", arguments: '{"b":2}' },
      ],
      context
    );
    expect(responses).toHaveLength(2);
    expect(responses[0].result).toBe(JSON.stringify({ a: 1 }));
    expect(responses[1].result).toBe(JSON.stringify({ b: 2 }));
  });
});

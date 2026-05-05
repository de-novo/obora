import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../tools/registry";
import { ToolExecutor, ToolExecutionChain } from "../../tools/executor";
import type { FunctionCallRequest, FunctionCallResponse, ToolContext } from "../../tools/types";

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
    expect(messages[0]!.role).toBe("tool");
    expect(messages[0]!.toolCallId).toBe("1");
    expect(messages[0]!.content).toBe('{"ok":true}');
    expect(messages[1]!.content).toBe("Error: Boom");
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
    expect(responses[0]!.result).toBe(JSON.stringify({ a: 1 }));
    expect(responses[1]!.result).toBe(JSON.stringify({ b: 2 }));
  });

  it("should handle tool that returns undefined", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "void_tool",
      description: "returns undefined",
      parameters: { type: "object", properties: {} },
      async execute() {
        return undefined;
      },
    });
    const executor = new ToolExecutor(registry);
    const response = await executor.handleFunctionCall(
      { id: "1", name: "void_tool", arguments: "{}" },
      context
    );
    expect(response.result).toBe("null");
    expect(response.error).toBeUndefined();
  });

  it("should normalize registry execution failures into function call errors", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "explode",
      description: "throws",
      parameters: { type: "object", properties: {} },
      async execute() {
        throw new Error("tool exploded");
      },
    });
    const executor = new ToolExecutor(registry);

    const response = await executor.handleFunctionCall(
      { id: "1", name: "explode", arguments: "{}" },
      context
    );

    expect(response).toEqual({
      id: "1",
      result: "",
      error: "tool exploded",
    });
  });
});

describe("ToolExecutionChain", () => {
  const context: ToolContext = {
    sessionId: "s1",
    agentId: "a1",
    permissions: new Set(["*"]),
  };

  it("should execute tool chain with JSON parsing error handling", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "greet",
      description: "greet",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { message: "hello" };
      },
    });
    registry.register({
      name: "echo",
      description: "echo",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "plain text";
      },
    });

    const executor = new ToolExecutor(registry);
    const chain = new ToolExecutionChain(executor);

    const results = await chain.then("greet", {}).then("echo", {}).execute(context);

    expect(results).toHaveLength(2);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.data).toEqual({ message: "hello" });
    expect(results[1]!.success).toBe(true);
    expect(results[1]!.data).toBe("plain text");
  });

  it("should handle empty result string", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "empty",
      description: "returns empty string",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "";
      },
    });

    const executor = new ToolExecutor(registry);
    const chain = new ToolExecutionChain(executor);

    const results = await chain.then("empty", {}).execute(context);

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.data).toBe("");
  });

  it("should handle tool that returns null", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "null_tool",
      description: "returns null",
      parameters: { type: "object", properties: {} },
      async execute() {
        return null;
      },
    });

    const executor = new ToolExecutor(registry);
    const chain = new ToolExecutionChain(executor);

    const results = await chain.then("null_tool", {}).execute(context);

    expect(results).toHaveLength(1);
    expect(results[0]!.success).toBe(true);
    expect(results[0]!.data).toBe(null);
  });

  it("should pass previous results into function-based step params", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "seed",
      description: "seed",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { count: 2 };
      },
    });
    registry.register({
      name: "next",
      description: "next",
      parameters: { type: "object", properties: {} },
      async execute(params: { count?: number }) {
        return { count: (params.count ?? 0) + 1 };
      },
    });

    const executor = new ToolExecutor(registry);
    const chain = new ToolExecutionChain(executor);

    const results = await chain
      .then("seed", {})
      .then("next", (prev) => ({ count: (prev as { count: number }).count }))
      .execute(context);

    expect(results.map((result) => result.data)).toEqual([{ count: 2 }, { count: 3 }]);
  });

  it("should stop chain execution after the first failed step", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "fail",
      description: "fail",
      parameters: { type: "object", properties: {} },
      async execute() {
        throw new Error("chain failed");
      },
    });
    registry.register({
      name: "after",
      description: "after",
      parameters: { type: "object", properties: {} },
      async execute() {
        return "should not run";
      },
    });

    const executor = new ToolExecutor(registry);
    const chain = new ToolExecutionChain(executor);

    const results = await chain.then("fail", {}).then("after", {}).execute(context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: false,
      error: { code: "EXECUTION_ERROR", message: "chain failed" },
    });
  });

  it("should preserve non-JSON successful function responses", async () => {
    class RawResultExecutor extends ToolExecutor {
      constructor() {
        super(new ToolRegistry());
      }

      override async handleFunctionCall(
        call: FunctionCallRequest,
        _context: ToolContext
      ): Promise<FunctionCallResponse> {
        return { id: call.id, result: "plain text" };
      }
    }

    const chain = new ToolExecutionChain(new RawResultExecutor());

    const results = await chain.then("raw", {}).execute(context);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      success: true,
      data: "plain text",
    });
  });
});

import { describe, expect, it } from "vitest";
import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import {
  ToolExecutor,
  ToolRegistry,
  agentToolToToolDefinition,
  toolDefinitionToAgentTool,
  type ToolContext,
  type ToolDefinition,
} from "../../tools";

const context: ToolContext = {
  sessionId: "session-1",
  agentId: "agent-1",
  permissions: new Set(["tool:read"]),
};

describe("tool-call conformance", () => {
  it("round-trips public function tool definitions through AgentTool shape", async () => {
    const definition: ToolDefinition = {
      type: "function",
      function: {
        name: "lookup",
        description: "Lookup a record",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
      },
    };

    const agentTool = toolDefinitionToAgentTool(definition);
    expect(agentTool).toMatchObject({
      name: "lookup",
      label: "lookup",
      description: "Lookup a record",
    });
    await expect(agentTool.execute("tool-call-1", {})).resolves.toEqual({
      content: [{ type: "text", text: "lookup is not implemented yet" }],
      details: { stub: true },
    });

    const realAgentTool: AgentTool = {
      name: "deploy",
      label: "Deploy",
      description: "Deploy a build",
      parameters: Type.Object({}, { additionalProperties: true }),
      execute: async () => ({
        content: [{ type: "text", text: "deployed" }],
        details: {},
      }),
    };

    expect(agentToolToToolDefinition(realAgentTool)).toEqual({
      type: "function",
      function: {
        name: "deploy",
        description: "Deploy a build",
        parameters: {},
      },
    });
  });

  it("enforces permission and validation contracts before tool execution", async () => {
    const registry = new ToolRegistry();
    let executed = false;
    registry.register({
      name: "secure_lookup",
      description: "Secure lookup",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      requiredPermissions: ["tool:write"],
      validate: (params): params is { query: string } =>
        typeof params === "object" &&
        params !== null &&
        "query" in params &&
        typeof params.query === "string",
      async execute(params: { query: string }) {
        executed = true;
        return { query: params.query.toUpperCase() };
      },
    });

    await expect(registry.execute("secure_lookup", { query: "a" }, context)).resolves.toMatchObject({
      success: false,
      error: { code: "PERMISSION_DENIED" },
    });
    expect(executed).toBe(false);

    const allowedContext = {
      ...context,
      permissions: new Set(["tool:write"]),
    };
    await expect(
      registry.execute("secure_lookup", { query: 1 }, allowedContext)
    ).resolves.toMatchObject({
      success: false,
      error: { code: "INVALID_PARAMS" },
    });
    expect(executed).toBe(false);

    await expect(
      registry.execute("secure_lookup", { query: "release" }, allowedContext)
    ).resolves.toMatchObject({
      success: true,
      data: { query: "RELEASE" },
    });
    expect(executed).toBe(true);
  });

  it("keeps executor response ordering and converts errors into tool messages", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "Echo",
      parameters: { type: "object", properties: {} },
      async execute(params: Record<string, unknown>) {
        return params;
      },
    });
    const executor = new ToolExecutor(registry);

    const responses = await executor.handleFunctionCalls(
      [
        { id: "one", name: "echo", arguments: "{\"value\":1}" },
        { id: "two", name: "missing", arguments: "{}" },
      ],
      context
    );

    expect(responses).toEqual([
      { id: "one", result: JSON.stringify({ value: 1 }) },
      { id: "two", result: "", error: "Tool \"missing\" not found" },
    ]);
    expect(executor.formatAsMessages(responses)).toEqual([
      { role: "tool", content: JSON.stringify({ value: 1 }), toolCallId: "one" },
      { role: "tool", content: "Error: Tool \"missing\" not found", toolCallId: "two" },
    ]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  builtinTools,
  calculatorTool,
  getCurrentTimeTool,
  httpRequestTool,
  parseJsonTool,
  randomGeneratorTool,
  registerBuiltinTools,
  searchTextTool,
} from "../../tools/builtin";
import { ToolRegistry } from "../../tools/registry";
import {
  agentToolToToolDefinition,
  toolDefinitionToAgentTool,
  type ToolContext,
} from "../../tools/types";

const context: ToolContext = {
  sessionId: "session-1",
  agentId: "agent-1",
  permissions: new Set(["network"]),
  timeout: 50,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("builtin tools", () => {
  it("registers all builtin tools", () => {
    const registry = new ToolRegistry();

    registerBuiltinTools(registry);

    expect(registry.size).toBe(builtinTools.length);
    expect(registry.listByCategory("utility").map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["get_current_time", "calculator", "parse_json", "random_generator"])
    );
  });

  it("executes utility and text tools without side effects", async () => {
    await expect(getCurrentTimeTool.execute({}, context)).resolves.toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
    await expect(parseJsonTool.execute({ json: '{"ok":true}' }, context)).resolves.toEqual({
      ok: true,
    });
    await expect(parseJsonTool.execute({ json: "{bad" }, context)).rejects.toThrow();

    await expect(
      searchTextTool.execute(
        { text: "Alpha alpha ALPHA", query: "alpha", caseSensitive: false },
        context
      )
    ).resolves.toEqual({
      found: true,
      matches: ["Alpha", "alpha", "ALPHA"],
    });
    await expect(
      searchTextTool.execute(
        { text: "Alpha alpha ALPHA", query: "alpha", caseSensitive: true },
        context
      )
    ).resolves.toEqual({
      found: true,
      matches: ["alpha"],
    });
    await expect(
      searchTextTool.execute({ text: "Alpha", query: "missing" }, context)
    ).resolves.toEqual({
      found: false,
      matches: [],
    });
  });

  it("normalizes calculator failures when the optional evaluator is unavailable", async () => {
    await expect(calculatorTool.execute({ expression: "2 + 2" }, context)).rejects.toThrow(
      "Invalid expression:"
    );
  });

  it("executes HTTP requests through fetch and returns response metadata", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("created", {
          status: 201,
          headers: { "x-test": "yes" },
        })
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      httpRequestTool.execute(
        {
          url: "https://example.test/resource",
          method: "POST",
          headers: { authorization: "Bearer token" },
          body: "{}",
        },
        context
      )
    ).resolves.toEqual({
      status: 201,
      headers: { "content-type": "text/plain;charset=UTF-8", "x-test": "yes" },
      body: "created",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/resource",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer token" },
        body: "{}",
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("uses default HTTP request options when optional fields are omitted", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("ok", {
          status: 200,
        })
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      httpRequestTool.execute(
        {
          url: "https://example.test/defaults",
        },
        { ...context, timeout: undefined }
      )
    ).resolves.toMatchObject({
      status: 200,
      body: "ok",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://example.test/defaults",
      expect.objectContaining({
        method: "GET",
        headers: undefined,
        body: undefined,
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("uses random generator defaults for number and string modes", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(randomGeneratorTool.execute({ type: "number" }, context)).resolves.toBe(0);
    await expect(randomGeneratorTool.execute({ type: "string" }, context)).resolves.toBe(
      "AAAAAAAAAA"
    );
  });

  it("generates deterministic random values when Math.random is controlled", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);

    await expect(
      randomGeneratorTool.execute({ type: "number", min: 10, max: 20 }, context)
    ).resolves.toBe(10);
    await expect(
      randomGeneratorTool.execute({ type: "string", length: 4 }, context)
    ).resolves.toBe("AAAA");
    await expect(randomGeneratorTool.execute({ type: "uuid" }, context)).resolves.toBe(
      "00000000-0000-4000-8000-000000000000"
    );
    await expect(
      randomGeneratorTool.execute({ type: "unknown" as "number" }, context)
    ).rejects.toThrow("Unknown type: unknown");
  });

  it("converts between adapter tool definitions and agent tools", async () => {
    const definition = {
      type: "function" as const,
      function: {
        name: "echo",
        description: "Echo input",
        parameters: { type: "object", properties: {} },
      },
    };

    const agentTool = toolDefinitionToAgentTool(definition);
    expect(agentTool).toMatchObject({
      name: "echo",
      label: "echo",
      description: "Echo input",
    });
    await expect(agentTool.execute("call-1", {})).resolves.toMatchObject({
      details: { stub: true },
    });
    expect(agentToolToToolDefinition(agentTool)).toMatchObject({
      type: "function",
      function: {
        name: "echo",
        description: "Echo input",
      },
    });
  });
});

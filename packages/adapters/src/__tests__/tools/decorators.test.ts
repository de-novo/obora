import { afterEach, describe, expect, it } from "vitest";
import { globalToolRegistry } from "../../tools/registry";
import { params, tool } from "../../tools/decorators";
import type { ToolContext } from "../../tools/types";

const context: ToolContext = {
  sessionId: "session-1",
  agentId: "agent-1",
  permissions: new Set(),
};

afterEach(() => {
  globalToolRegistry.unregister("decorated_echo");
});

describe("tool decorators", () => {
  it("builds parameter schemas for all supported property types", () => {
    const schema = params()
      .string("name", "Name", {
        required: true,
        enum: ["alpha", "beta"],
        default: "alpha",
        minLength: 1,
        maxLength: 10,
        pattern: "^[a-z]+$",
      })
      .number("count", "Count", {
        required: true,
        minimum: 1,
        maximum: 10,
        default: 1,
      })
      .boolean("enabled", "Enabled", { default: true })
      .array("tags", "Tags", { type: "string" }, { required: true })
      .object("metadata", "Metadata", { source: { type: "string" } }, { required: true })
      .build();

    expect(schema).toEqual({
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Name",
          enum: ["alpha", "beta"],
          default: "alpha",
          minLength: 1,
          maxLength: 10,
          pattern: "^[a-z]+$",
        },
        count: {
          type: "number",
          description: "Count",
          minimum: 1,
          maximum: 10,
          default: 1,
        },
        enabled: { type: "boolean", description: "Enabled", default: true },
        tags: { type: "array", description: "Tags", items: { type: "string" } },
        metadata: {
          type: "object",
          description: "Metadata",
          properties: { source: { type: "string" } },
        },
      },
      required: ["name", "count", "tags", "metadata"],
    });
  });

  it("registers stateless decorated methods as global tools", async () => {
    class ToolHost {
      static echo(input: { value: string }, toolContext: ToolContext): string {
        return `${toolContext.agentId}:${input.value}`;
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(ToolHost, "echo");
    if (!descriptor) {
      throw new Error("missing descriptor");
    }

    tool({
      name: "decorated_echo",
      description: "Decorated echo",
      parameters: params().string("value", "Value", { required: true }).build(),
      category: "test",
      version: "1.0.0",
      hasSideEffects: false,
      requiredPermissions: ["echo"],
    })(ToolHost, "echo", descriptor);

    const registered = globalToolRegistry.get("decorated_echo");
    expect(registered).toMatchObject({
      name: "decorated_echo",
      description: "Decorated echo",
      category: "test",
      version: "1.0.0",
      hasSideEffects: false,
      requiredPermissions: ["echo"],
    });
    await expect(registered?.execute({ value: "ok" }, context)).resolves.toBe("agent-1:ok");
  });

  it("uses default decorator metadata and optional parameter schema branches", async () => {
    class MinimalToolHost {
      static ping(): string {
        return "pong";
      }
    }

    const descriptor = Object.getOwnPropertyDescriptor(MinimalToolHost, "ping");
    if (!descriptor) {
      throw new Error("missing descriptor");
    }

    tool({
      name: "decorated_echo",
      description: "Minimal decorated tool",
    })(MinimalToolHost, "ping", descriptor);

    const registered = globalToolRegistry.get("decorated_echo");
    expect(registered).toMatchObject({
      name: "decorated_echo",
      description: "Minimal decorated tool",
      parameters: { type: "object", properties: {} },
      hasSideEffects: true,
    });
    await expect(registered?.execute({}, context)).resolves.toBe("pong");

    const schema = params()
      .string("optionalString", "Optional string", { required: false })
      .number("optionalNumber", "Optional number", { required: false })
      .boolean("optionalBoolean", "Optional boolean", { required: false })
      .array("optionalArray", "Optional array", { type: "string" }, { required: false })
      .object("optionalObject", "Optional object", {}, { required: false })
      .build();

    expect(schema.required).toEqual([]);
  });
});

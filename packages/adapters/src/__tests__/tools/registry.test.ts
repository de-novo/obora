import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry } from "../../tools/registry";
import { ToolContext } from "../../tools/types";

describe("ToolRegistry", () => {
  let registry: ToolRegistry;
  let context: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    context = {
      sessionId: "test-session",
      agentId: "test-agent",
      permissions: new Set(["*"]),
    };
  });

  describe("register", () => {
    it("should register a tool successfully", () => {
      registry.register({
        name: "test-tool",
        description: "Test tool",
        parameters: { type: "object", properties: {} },
        async execute() {
          return "result";
        },
      });
      expect(registry.has("test-tool")).toBe(true);
      expect(registry.size).toBe(1);
    });

    it("should throw on duplicate registration", () => {
      const tool = {
        name: "dup",
        description: "dup",
        parameters: { type: "object" as const, properties: {} },
        async execute() {
          return "ok";
        },
      };
      registry.register(tool);
      expect(() => registry.register(tool)).toThrow("already registered");
    });
  });

  describe("execute", () => {
    it("should execute tool successfully", async () => {
      registry.register({
        name: "greet",
        description: "Greet",
        parameters: { type: "object", properties: {} },
        async execute(params: any) {
          return `Hello, ${params.name}!`;
        },
      });
      const result = await registry.execute("greet", { name: "Alice" }, context);
      expect(result.success).toBe(true);
      expect(result.data).toBe("Hello, Alice!");
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should return TOOL_NOT_FOUND for missing tool", async () => {
      const result = await registry.execute("nonexistent", {}, context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("TOOL_NOT_FOUND");
    });

    it("should deny when permissions are missing", async () => {
      registry.register({
        name: "secure",
        description: "Secure",
        parameters: { type: "object", properties: {} },
        requiredPermissions: ["admin"],
        async execute() {
          return "ok";
        },
      });
      const result = await registry.execute(
        "secure",
        {},
        {
          ...context,
          permissions: new Set(["user"]),
        }
      );
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("PERMISSION_DENIED");
    });

    it("should fail validation when validate returns false", async () => {
      registry.register({
        name: "validated",
        description: "Validated",
        parameters: { type: "object", properties: {} },
        validate(params: unknown): params is unknown {
          return false;
        },
        async execute() {
          return "ok";
        },
      });
      const result = await registry.execute("validated", {}, context);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("INVALID_PARAMS");
    });

    it("should timeout on long execution", async () => {
      registry.register({
        name: "slow",
        description: "Slow",
        parameters: { type: "object", properties: {} },
        async execute() {
          return new Promise((resolve) => setTimeout(() => resolve("done"), 10000));
        },
      });
      const result = await registry.execute("slow", {}, { ...context, timeout: 50 });
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe("EXECUTION_ERROR");
      expect(result.error?.message).toContain("timeout");
    }, 10000);
  });

  describe("alias", () => {
    it("should resolve aliases", () => {
      registry.register({
        name: "original",
        description: "Original",
        parameters: { type: "object", properties: {} },
        async execute() {
          return "ok";
        },
      });
      registry.alias("original", "shortcut");
      expect(registry.has("shortcut")).toBe(true);
      expect(registry.get("shortcut")?.name).toBe("original");
    });

    it("should throw when aliasing nonexistent tool", () => {
      expect(() => registry.alias("missing", "alias")).toThrow("not found");
    });
  });

  describe("categories", () => {
    it("should list tools by category", () => {
      registry.register({
        name: "tool1",
        description: "Tool 1",
        parameters: { type: "object", properties: {} },
        category: "utility",
        async execute() {
          return "ok";
        },
      });
      registry.register({
        name: "tool2",
        description: "Tool 2",
        parameters: { type: "object", properties: {} },
        category: "utility",
        async execute() {
          return "ok";
        },
      });
      const tools = registry.listByCategory("utility");
      expect(tools).toHaveLength(2);
      expect(registry.listCategories()).toContain("utility");
    });
  });

  describe("toToolDefinitions", () => {
    it("should convert tools to OpenAI format", () => {
      registry.register({
        name: "test",
        description: "Test",
        parameters: { type: "object", properties: {} },
        async execute() {
          return "ok";
        },
      });
      const defs = registry.toToolDefinitions();
      expect(defs).toHaveLength(1);
      expect(defs[0].type).toBe("function");
      expect(defs[0].function.name).toBe("test");
    });
  });

  describe("unregister", () => {
    it("should unregister tool", () => {
      registry.register({
        name: "removable",
        description: "Removable",
        parameters: { type: "object", properties: {} },
        async execute() {
          return "ok";
        },
      });
      expect(registry.unregister("removable")).toBe(true);
      expect(registry.has("removable")).toBe(false);
    });

    it("should return false for nonexistent tool", () => {
      expect(registry.unregister("missing")).toBe(false);
    });
  });
});

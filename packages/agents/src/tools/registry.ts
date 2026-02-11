import { Tool, ToolContext, ToolExecutionResult, ToolDefinition } from "./types";

export class ToolRegistry {
  private tools: Map<string, Tool>;
  private categories: Map<string, Set<string>>;
  private aliases: Map<string, string>;

  constructor() {
    this.tools = new Map();
    this.categories = new Map();
    this.aliases = new Map();
  }

  register<TParams, TResult>(tool: Tool<TParams, TResult>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }
    this.tools.set(tool.name, tool as Tool);
    if (tool.category) {
      if (!this.categories.has(tool.category)) {
        this.categories.set(tool.category, new Set());
      }
      this.categories.get(tool.category)!.add(tool.name);
    }
  }

  unregister(name: string): boolean {
    const tool = this.tools.get(name);
    if (!tool) return false;
    this.tools.delete(name);
    if (tool.category) {
      this.categories.get(tool.category)?.delete(name);
    }
    for (const [alias, target] of this.aliases.entries()) {
      if (target === name) {
        this.aliases.delete(alias);
      }
    }
    return true;
  }

  get(name: string): Tool | undefined {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.tools.get(resolvedName);
  }

  has(name: string): boolean {
    const resolvedName = this.aliases.get(name) ?? name;
    return this.tools.has(resolvedName);
  }

  alias(name: string, alias: string): void {
    if (!this.has(name)) {
      throw new Error(`Tool "${name}" not found`);
    }
    this.aliases.set(alias, name);
  }

  listTools(): Array<{ name: string; description: string; category?: string }> {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      category: tool.category,
    }));
  }

  listByCategory(category: string): Tool[] {
    const names = this.categories.get(category);
    if (!names) return [];
    return Array.from(names)
      .map((name) => this.tools.get(name)!)
      .filter(Boolean);
  }

  listCategories(): string[] {
    return Array.from(this.categories.keys());
  }

  async execute<TResult = unknown>(
    name: string,
    params: Record<string, unknown>,
    context: ToolContext
  ): Promise<ToolExecutionResult<TResult>> {
    const startTime = Date.now();
    const tool = this.get(name);

    if (!tool) {
      return {
        success: false,
        error: { code: "TOOL_NOT_FOUND", message: `Tool "${name}" not found` },
        duration: Date.now() - startTime,
      };
    }

    if (tool.requiredPermissions) {
      const missingPermissions = tool.requiredPermissions.filter(
        (p) => !context.permissions.has(p)
      );
      if (missingPermissions.length > 0) {
        return {
          success: false,
          error: {
            code: "PERMISSION_DENIED",
            message: `Missing permissions: ${missingPermissions.join(", ")}`,
          },
          duration: Date.now() - startTime,
        };
      }
    }

    if (tool.validate && !tool.validate(params)) {
      return {
        success: false,
        error: { code: "INVALID_PARAMS", message: "Parameter validation failed" },
        duration: Date.now() - startTime,
      };
    }

    try {
      const timeoutMs = context.timeout ?? 30000;
      const result = await Promise.race([
        tool.execute(params, context),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tool execution timeout")), timeoutMs)
        ),
      ]);
      return {
        success: true,
        data: result as TResult,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: "EXECUTION_ERROR",
          message: (error as Error).message,
          details: error,
        },
        duration: Date.now() - startTime,
      };
    }
  }

  async executeBatch(
    calls: Array<{ name: string; params: Record<string, unknown> }>,
    context: ToolContext
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(calls.map((call) => this.execute(call.name, call.params, context)));
  }

  toToolDefinitions(names?: string[]): ToolDefinition[] {
    const toolNames = names ?? Array.from(this.tools.keys());
    return toolNames
      .map((name) => this.tools.get(name))
      .filter((tool): tool is Tool => tool !== undefined)
      .map((tool) => ({
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters as unknown as Record<string, unknown>,
        },
      }));
  }

  /** @deprecated toToolDefinitions 사용 권장 */
  toFunctionCallingSchema(names?: string[]): ToolDefinition[] {
    return this.toToolDefinitions(names);
  }

  clear(): void {
    this.tools.clear();
    this.categories.clear();
    this.aliases.clear();
  }

  get size(): number {
    return this.tools.size;
  }
}

export const globalToolRegistry = new ToolRegistry();

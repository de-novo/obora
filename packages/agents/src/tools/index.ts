export interface ToolRegistry {
  listTools(): Array<{ name: string; description: string }>;
  execute(toolName: string, parameters: Record<string, unknown>): Promise<unknown>;
}

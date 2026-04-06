declare module "@obora/adapters" {
  export interface ChatMessage {
    role: string;
    content: unknown;
    name?: string;
    toolCallId?: string;
    [key: string]: unknown;
  }

  export interface LLMAdapter {
    id: string;
    complete?(input: unknown): Promise<unknown>;
    chatCompletion?(input: unknown): Promise<{
      message: {
        content?: string;
        toolCalls?: Array<{ id?: string; function: { name?: string; arguments?: string } }>;
      };
      usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      model?: string;
      finishReason?: string;
    }>;
  }

  export interface AgentConfig {
    provider?: string;
    model?: string;
    authRef?: string;
    baseUrl?: string;
    systemPrompt?: string;
    [key: string]: unknown;
  }

  export type LLMProvider = string;

  export interface ToolContext {
    sessionId?: string;
    agentId?: string;
    taskId?: string;
    metadata?: unknown;
    permissions?: Set<string>;
    [key: string]: unknown;
  }

  export class ToolRegistry {
    listTools(): Array<{ name: string }>;
    execute(toolName: string, params: unknown, context: ToolContext): Promise<unknown>;
  }

  export class SkillRegistry {
    constructor(options?: { cwd?: string });
  }

  export class SkillLoader {
    constructor(registry?: SkillRegistry);
    loadSkills(skills: string[], options?: { cwd?: string; agentId?: string; stepName?: string }): Promise<{ loaded: unknown[]; tools?: unknown[]; systemPrompt?: string }>;
    teardown(loaded: unknown[]): Promise<void>;
  }

  export function createAdapter(provider: string, config?: AgentConfig): Promise<LLMAdapter>;
}

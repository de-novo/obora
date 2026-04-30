export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionResult {
  id: string;
  model: string;
  message: {
    role: "assistant";
    content: string | null;
    toolCalls?: ToolCall[];
  };
  finishReason: "stop" | "length" | "tool_calls" | "error";
  toolCalls?: ToolCall[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  [key: string]: unknown;
}

export interface LLMAdapter {
  id: string;
  chatCompletion(params: unknown, options?: unknown): Promise<ChatCompletionResult>;
  streamChatCompletion?(
    params: unknown,
    onChunk: (chunk: unknown) => void,
  ): Promise<ChatCompletionResult>;
  supports?(feature: "streaming" | "function-calling" | "json-mode"): boolean;
}

export type LLMProvider = string;

export interface AgentConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  systemPrompt?: string;
  [key: string]: unknown;
}

export interface AgentResolutionLayer {
  kind: string;
  label: string;
  applied: Partial<AgentConfig>;
}

export interface AgentResolutionSnapshot {
  agentName: string;
  status: "resolved" | "unresolved";
  resolved: Partial<AgentConfig>;
  layers: AgentResolutionLayer[];
  diagnostics: string[];
}

export interface ToolRegistry {
  [key: string]: unknown;
}

export class RetryExhaustedError extends Error {
  constructor(message: string, options?: unknown);
}

export class SkillRegistry {
  constructor(...args: unknown[]);
}

export class SkillLoader {
  constructor(...args: unknown[]);
}

export class AgentConfigResolver {
  constructor(...args: unknown[]);
  static create(cwd?: string): Promise<AgentConfigResolver>;
  snapshot(agentName: string): AgentResolutionSnapshot;
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: Partial<AgentConfig>): AgentConfig;
  listAgentInventory(): Array<{ name: string; source: string }>;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
}

export class FileAuthManager {
  constructor(...args: unknown[]);
  listProviders(): Promise<Array<{ provider: string }>>;
}

export function createAdapter(provider: LLMProvider, config?: unknown): Promise<LLMAdapter>;

export function listPiAIModels(provider: string, query?: string): unknown[];
export function listPiAIProviders(): unknown[];

export function applyAgentOverride(...args: unknown[]): unknown;
export function previewAgentOverride(...args: unknown[]): unknown;

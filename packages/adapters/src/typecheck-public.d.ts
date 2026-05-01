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
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  baseUrl?: string;
  systemPrompt?: string;
  reviewModels?: Array<{ name?: string; provider: string; model: string }>;
  [key: string]: unknown;
}

export type AgentResolutionSourceKind =
  | "builtin-defaults"
  | "auth-aware-defaults"
  | "global-defaults"
  | "project-defaults"
  | "global-provider"
  | "project-provider"
  | "global-agent"
  | "project-agent";

export interface AgentResolutionLayer {
  kind: AgentResolutionSourceKind;
  label: string;
  applied: Partial<AgentConfig>;
  notes?: string[];
}

export interface AgentResolutionFailure {
  code: "provider-model-required";
  message: string;
}

export interface AgentResolutionSnapshot {
  agentName: string;
  status: "resolved" | "unresolved";
  resolved: Partial<AgentConfig>;
  layers: AgentResolutionLayer[];
  warnings: string[];
  failure?: AgentResolutionFailure;
}

export type AgentInventorySource = "config" | "default-fallback";
export type AgentMutationScope = "project" | "global";
export type AgentMutationAction = "set" | "reset";

export interface AgentOverridePreview {
  action: AgentMutationAction;
  scope: AgentMutationScope;
  agentName: string;
  targetPath: string;
  before: Partial<AgentConfig> | null;
  after: Partial<AgentConfig> | null;
  warnings: string[];
  nextConfigDocument: Record<string, unknown>;
  nextYaml: string;
}

export interface ToolRegistry {
  [key: string]: unknown;
}

export class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly originalError?: unknown;
  constructor(message: string, options?: unknown);
  getLastErrorCode?(): string | undefined;
  getRootCause?(): unknown;
}

export class SkillRegistry {
  constructor(...args: unknown[]);
}

export class SkillLoader {
  constructor(...args: unknown[]);
  loadSkills(
    names: string[],
    context: { cwd: string; agentId?: string; stepName?: string; metadata?: Record<string, unknown> },
  ): Promise<{ loaded: unknown[]; tools: unknown[]; systemPrompt: string }>;
  teardown(skills: unknown[]): Promise<void>;
}

export class AgentConfigResolver {
  constructor(...args: unknown[]);
  static create(cwd?: string): Promise<AgentConfigResolver>;
  snapshot(agentName: string): AgentResolutionSnapshot;
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: Partial<AgentConfig>): AgentConfig;
  listAgentInventory(): Array<{ name: string; source: AgentInventorySource }>;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
}

export class FileAuthManager {
  constructor(...args: unknown[]);
  addProvider(provider: string, auth: ProviderAuth): Promise<void>;
  getProvider(provider: string): Promise<ProviderAuth | undefined>;
  listProviders(): Promise<ProviderAuth[]>;
  removeProvider(provider: string): Promise<void>;
  testConnection(provider: string): Promise<boolean>;
}

export type AuthType = "apiKey" | "token" | "oauth";
export interface ProviderAuthBase {
  provider: string;
  type: AuthType;
  baseUrl?: string;
  addedAt: string;
  updatedAt: string;
}
export interface ApiKeyAuth extends ProviderAuthBase {
  type: "apiKey";
  apiKey: string;
}
export interface TokenAuth extends ProviderAuthBase {
  type: "token";
  token: string;
}
export interface OAuthAuth extends ProviderAuthBase {
  type: "oauth";
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
  scope?: string;
}
export type ProviderAuth = ApiKeyAuth | TokenAuth | OAuthAuth;

export function getDefaultAuthFilePath(): string;
export function maskProviderAuth(auth: Record<string, unknown> | object): Record<string, unknown>;

export function createAdapter(provider: LLMProvider, config?: unknown): Promise<LLMAdapter>;

export function listPiAIModels(provider: string, query?: string): string[];
export function listPiAIProviders(): string[];

export function applyAgentOverride(...args: unknown[]): Promise<AgentOverridePreview>;
export function previewAgentOverride(...args: unknown[]): Promise<AgentOverridePreview>;

export class MockLLMAdapter implements LLMAdapter {
  readonly id: string;
  constructor(...args: unknown[]);
  chatCompletion(params: unknown, options?: unknown): Promise<ChatCompletionResult>;
  streamChatCompletion?(
    params: unknown,
    onChunk: (chunk: unknown) => void,
  ): Promise<ChatCompletionResult>;
  supports?(feature: "streaming" | "function-calling" | "json-mode"): boolean;
}

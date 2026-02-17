export interface ProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface AgentModelConfig {
  name?: string;
  provider: string;
  model: string;
}

export interface AgentConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  baseUrl?: string;
  reviewModels?: AgentModelConfig[];
}

export interface AgentConfigFile {
  defaults?: Partial<AgentConfig>;
  providers?: Record<string, ProviderConfig>;
  agents?: Record<string, Partial<AgentConfig>>;
}

export interface AgentStepOverride {
  provider?: string;
  model?: string;
}

export interface AgentConfigResolverContract {
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: AgentStepOverride): AgentConfig;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
}

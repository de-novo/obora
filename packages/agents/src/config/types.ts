export interface ProviderConfig {
  baseUrl?: string;
  defaultModel?: string;
  timeout?: number;
  maxTokens?: number;
}

export interface AgentConfig {
  provider: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  systemPrompt?: string;
  baseUrl?: string;
}

export interface AgentConfigFile {
  defaults?: Partial<AgentConfig>;
  providers?: Record<string, ProviderConfig>;
  agents?: Record<string, Partial<AgentConfig>>;
}

export interface AgentConfigResolverContract {
  resolve(agentName: string): AgentConfig;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
}

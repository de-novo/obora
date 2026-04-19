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

export interface AgentConfigResolverContract {
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: AgentStepOverride): AgentConfig;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
  snapshot(agentName: string): AgentResolutionSnapshot;
}

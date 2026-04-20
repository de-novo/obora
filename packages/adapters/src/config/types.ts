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

export type AgentInventorySource = "config" | "default-fallback";

export interface AgentInventoryEntry {
  name: string;
  source: AgentInventorySource;
}

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

export interface AgentConfigResolverContract {
  resolve(agentName: string): AgentConfig;
  resolveForStep(agentName: string, override?: AgentStepOverride): AgentConfig;
  listAgents(): Array<{ name: string; config: AgentConfig }>;
  listAgentInventory(): AgentInventoryEntry[];
  snapshot(agentName: string): AgentResolutionSnapshot;
}

import type {
  AgentConfig,
  AgentConfigFile,
  AgentResolutionLayer,
  AgentResolutionSnapshot,
  AgentResolutionSourceKind,
  ProviderConfig,
} from "../config/types";

function mergeShallow<T extends object>(base: T, patch?: Partial<T>): T {
  return patch ? ({ ...base, ...patch } as T) : base;
}

function applyProviderLayer(
  config: Partial<AgentConfig>,
  layer?: ProviderConfig
): Partial<AgentConfig> {
  if (!layer) {
    return config;
  }

  const next = { ...config };

  if (layer.baseUrl !== undefined) next.baseUrl = layer.baseUrl;
  if (layer.defaultModel !== undefined) next.model = layer.defaultModel;
  if (layer.timeout !== undefined) next.timeout = layer.timeout;
  if (layer.maxTokens !== undefined) next.maxTokens = layer.maxTokens;

  return next;
}

function pushLayer(
  layers: AgentResolutionLayer[],
  kind: AgentResolutionSourceKind,
  label: string,
  patch?: Partial<AgentConfig>
) {
  if (!patch || Object.keys(patch).length === 0) {
    return;
  }

  layers.push({ kind, label, applied: patch });
}

function providerLayerToPatch(layer?: ProviderConfig): Partial<AgentConfig> | undefined {
  if (!layer) {
    return undefined;
  }

  const patch: Partial<AgentConfig> = {};
  if (layer.baseUrl !== undefined) patch.baseUrl = layer.baseUrl;
  if (layer.defaultModel !== undefined) patch.model = layer.defaultModel;
  if (layer.timeout !== undefined) patch.timeout = layer.timeout;
  if (layer.maxTokens !== undefined) patch.maxTokens = layer.maxTokens;

  return Object.keys(patch).length > 0 ? patch : undefined;
}

export interface BuildAgentResolutionSnapshotInput {
  agentName: string;
  globalConfig: AgentConfigFile;
  projectConfig: AgentConfigFile;
  authAwareDefaults: Partial<AgentConfig>;
  builtinDefaults: Partial<AgentConfig>;
}

export function buildAgentResolutionSnapshot({
  agentName,
  globalConfig,
  projectConfig,
  authAwareDefaults,
  builtinDefaults,
}: BuildAgentResolutionSnapshotInput): AgentResolutionSnapshot {
  const layers: AgentResolutionLayer[] = [];

  const state = { resolved: {} as Partial<AgentConfig> };

  state.resolved = mergeShallow(state.resolved, builtinDefaults);
  pushLayer(layers, "builtin-defaults", "Built-in defaults", builtinDefaults);

  state.resolved = mergeShallow(state.resolved, authAwareDefaults);
  pushLayer(layers, "auth-aware-defaults", "Authenticated provider defaults", authAwareDefaults);

  state.resolved = mergeShallow(state.resolved, globalConfig.defaults);
  pushLayer(layers, "global-defaults", "Global defaults", globalConfig.defaults);

  state.resolved = mergeShallow(state.resolved, projectConfig.defaults);
  pushLayer(layers, "project-defaults", "Project defaults", projectConfig.defaults);

  const providerName = state.resolved.provider;
  const globalProviderPatch = providerName
    ? providerLayerToPatch(globalConfig.providers?.[providerName])
    : undefined;
  state.resolved = applyProviderLayer(
    state.resolved,
    providerName ? globalConfig.providers?.[providerName] : undefined
  );
  pushLayer(
    layers,
    "global-provider",
    `Global provider (${providerName ?? "unresolved"})`,
    globalProviderPatch
  );

  const projectProviderPatch = providerName
    ? providerLayerToPatch(projectConfig.providers?.[providerName])
    : undefined;
  state.resolved = applyProviderLayer(
    state.resolved,
    providerName ? projectConfig.providers?.[providerName] : undefined
  );
  pushLayer(
    layers,
    "project-provider",
    `Project provider (${providerName ?? "unresolved"})`,
    projectProviderPatch
  );

  const globalAgentPatch = globalConfig.agents?.[agentName];
  state.resolved = mergeShallow(state.resolved, globalAgentPatch);
  pushLayer(layers, "global-agent", `Global agent (${agentName})`, globalAgentPatch);

  const projectAgentPatch = projectConfig.agents?.[agentName];
  state.resolved = mergeShallow(state.resolved, projectAgentPatch);
  pushLayer(layers, "project-agent", `Project agent (${agentName})`, projectAgentPatch);

  if (!state.resolved.provider || !state.resolved.model) {
    const message = `Unable to resolve agent config for '${agentName}': provider/model is required`;
    return {
      agentName,
      status: "unresolved",
      resolved: state.resolved,
      layers,
      warnings: ["provider/model is required"],
      failure: {
        code: "provider-model-required",
        message,
      },
    };
  }

  return {
    agentName,
    status: "resolved",
    resolved: state.resolved,
    layers,
    warnings: [],
  };
}

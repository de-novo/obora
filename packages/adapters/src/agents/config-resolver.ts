import { FileAuthManager } from "../auth";
import { getGlobalConfigPath, getProjectConfigPath, loadConfigFile } from "../config/loader";
import type {
  AgentConfig,
  AgentConfigFile,
  AgentConfigResolverContract,
  AgentStepOverride,
} from "../config/types";
import {
  getProviderDefaultModel,
  isSupportedProvider,
  pickPreferredProvider,
} from "../llm/factory";

const BUILTIN_DEFAULTS: AgentConfig = {
  provider: "pi-mono",
  model: "pi-mono-1",
  temperature: 0.2,
  maxTokens: 4096,
  timeout: 120,
};

function mergeShallow<T extends object>(base: T, patch?: Partial<T>): T {
  return patch ? ({ ...base, ...patch } as T) : base;
}

function applyProviderLayer(config: AgentConfig, layer?: { defaultModel?: string } & Partial<AgentConfig>) {
  if (!layer) {
    return config;
  }

  const next = { ...config };

  if (layer.baseUrl !== undefined) next.baseUrl = layer.baseUrl;
  if ((layer as { defaultModel?: string }).defaultModel !== undefined) {
    next.model = (layer as { defaultModel?: string }).defaultModel as string;
  }
  if (layer.timeout !== undefined) next.timeout = layer.timeout;
  if (layer.maxTokens !== undefined) next.maxTokens = layer.maxTokens;

  return next;
}

export class AgentConfigResolver implements AgentConfigResolverContract {
  private constructor(
    private readonly globalConfig: AgentConfigFile,
    private readonly projectConfig: AgentConfigFile,
    private readonly authAwareDefaults: Partial<AgentConfig>
  ) {}

  static async create(cwd: string = process.cwd()): Promise<AgentConfigResolver> {
    const authManager = new FileAuthManager();
    const [globalConfig, projectConfig, providers] = await Promise.all([
      loadConfigFile(getGlobalConfigPath()),
      loadConfigFile(getProjectConfigPath(cwd)),
      authManager.listProviders(),
    ]);

    const preferredProvider = pickPreferredProvider(
      providers.map((item) => item.provider).filter(isSupportedProvider)
    );
    const authAwareDefaults: Partial<AgentConfig> = preferredProvider
      ? {
        provider: preferredProvider,
        model: getProviderDefaultModel(preferredProvider) ?? BUILTIN_DEFAULTS.model,
      }
      : {};

    return new AgentConfigResolver(globalConfig, projectConfig, authAwareDefaults);
  }

  resolve(agentName: string): AgentConfig {
    // 1) built-in defaults + auth-aware defaults
    let resolved = mergeShallow({ ...BUILTIN_DEFAULTS }, this.authAwareDefaults);

    // 2) global defaults
    resolved = mergeShallow(resolved, this.globalConfig.defaults);

    // 3) project defaults
    resolved = mergeShallow(resolved, this.projectConfig.defaults);

    const providerName = resolved.provider;

    // 4) global providers[providerName]
    resolved = applyProviderLayer(resolved, this.globalConfig.providers?.[providerName]);

    // 5) project providers[providerName]
    resolved = applyProviderLayer(resolved, this.projectConfig.providers?.[providerName]);

    // 6) global agents[agentName]
    resolved = mergeShallow(resolved, this.globalConfig.agents?.[agentName]);

    // 7) project agents[agentName]
    resolved = mergeShallow(resolved, this.projectConfig.agents?.[agentName]);

    if (!resolved.provider || !resolved.model) {
      throw new Error(`Unable to resolve agent config for '${agentName}': provider/model is required`);
    }

    return resolved;
  }

  resolveForStep(agentName: string, override?: AgentStepOverride): AgentConfig {
    const base = this.resolve(agentName);

    if (!override?.provider && !override?.model) {
      return base;
    }

    return {
      ...base,
      ...(override.provider ? { provider: override.provider } : {}),
      ...(override.model ? { model: override.model } : {}),
    };
  }

  listAgents(): Array<{ name: string; config: AgentConfig }> {
    const names = new Set<string>([
      ...Object.keys(this.globalConfig.agents ?? {}),
      ...Object.keys(this.projectConfig.agents ?? {}),
    ]);

    if (names.size === 0) {
      names.add("default");
    }

    return [...names]
      .sort()
      .map((name) => ({
        name,
        config: this.resolve(name),
      }));
  }
}

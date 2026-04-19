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
import { buildAgentResolutionSnapshot } from "./resolution-snapshot";

const BUILTIN_DEFAULTS: AgentConfig = {
  provider: "pi-mono",
  model: "pi-mono-1",
  temperature: 0.2,
  maxTokens: 4096,
  timeout: 120,
};

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

  snapshot(agentName: string) {
    return buildAgentResolutionSnapshot({
      agentName,
      globalConfig: this.globalConfig,
      projectConfig: this.projectConfig,
      authAwareDefaults: this.authAwareDefaults,
      builtinDefaults: BUILTIN_DEFAULTS,
    });
  }

  resolve(agentName: string): AgentConfig {
    const snapshot = this.snapshot(agentName);

    if (snapshot.status !== "resolved" || !snapshot.resolved.provider || !snapshot.resolved.model) {
      throw new Error(
        `Unable to resolve agent config for '${agentName}': provider/model is required`
      );
    }

    return snapshot.resolved as AgentConfig;
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

    return [...names].sort().map((name) => ({
      name,
      config: this.resolve(name),
    }));
  }
}

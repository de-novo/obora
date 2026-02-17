import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import type { LLMConfig } from "./llm-config.js";
import { resolveAuthRef } from "./auth-resolver.js";
import { OboraError, OboraErrorCode } from "./runtime.js";

export interface OboraConfig {
  defaults?: {
    provider?: string;
    model?: string;
    temperature?: number;
    timeout?: number;
    maxTokens?: number;
  };
  providers?: Record<
    string,
    {
      authMode?: string;
      authRef?: string;
      defaultModel?: string;
      timeout?: number;
      maxTokens?: number;
      baseUrl?: string;
    }
  >;
  agents?: Record<
    string,
    {
      provider?: string;
      model?: string;
      temperature?: number;
    }
  >;
}

export interface ResolvedProviderConfig extends LLMConfig {
  temperature?: number;
  timeout?: number;
  maxTokens?: number;
}

interface ConfigSourceMeta {
  sources: string[];
}

const CONFIG_META_KEY = Symbol.for("obora.config.meta");

type ConfigWithMeta = OboraConfig & {
  [CONFIG_META_KEY]?: ConfigSourceMeta;
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function mergeConfig(base: OboraConfig | undefined, override: OboraConfig | undefined): OboraConfig | undefined {
  if (!base && !override) {
    return undefined;
  }

  const mergedProviders = Object.entries({ ...(base?.providers ?? {}), ...(override?.providers ?? {}) }).reduce<
    NonNullable<OboraConfig["providers"]>
  >((acc, [name, provider]) => {
    acc[name] = {
      ...(base?.providers?.[name] ?? {}),
      ...(provider ?? {}),
    };
    return acc;
  }, {});

  const mergedAgents = Object.entries({ ...(base?.agents ?? {}), ...(override?.agents ?? {}) }).reduce<
    NonNullable<OboraConfig["agents"]>
  >((acc, [name, agent]) => {
    acc[name] = {
      ...(base?.agents?.[name] ?? {}),
      ...(agent ?? {}),
    };
    return acc;
  }, {});

  return {
    defaults: { ...(base?.defaults ?? {}), ...(override?.defaults ?? {}) },
    providers: mergedProviders,
    agents: mergedAgents,
  };
}

async function readConfigFile(path: string): Promise<OboraConfig | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const content = await readFile(path, "utf-8");
  try {
    const parsed = parseYaml(content) as OboraConfig;
    return parsed;
  } catch (error) {
    throw new OboraError(
      `Failed to parse config YAML: ${path}`,
      OboraErrorCode.SDK_INVALID_WORKFLOW,
      undefined,
      undefined,
      error,
    );
  }
}

export async function loadConfig(configPath?: string): Promise<OboraConfig | undefined> {
  if (configPath) {
    const explicitPath = resolve(configPath);
    const explicit = (await readConfigFile(explicitPath)) as ConfigWithMeta | undefined;
    if (explicit) {
      explicit[CONFIG_META_KEY] = { sources: [explicitPath] };
    }
    return explicit;
  }

  const globalPath = join(homedir(), ".obora", "config.yaml");
  const projectPath = join(process.cwd(), ".obora", "config.yaml");

  const globalConfig = await readConfigFile(globalPath);
  const projectConfig = await readConfigFile(projectPath);

  const merged = mergeConfig(globalConfig, projectConfig) as ConfigWithMeta | undefined;
  if (!merged) {
    return undefined;
  }

  const sources: string[] = [];
  if (globalConfig) {
    sources.push(globalPath);
  }
  if (projectConfig) {
    sources.push(projectPath);
  }
  merged[CONFIG_META_KEY] = { sources };

  return merged;
}

export function resolveProviderConfig(
  config: OboraConfig,
  providerName?: string,
  options?: { verbose?: boolean },
): ResolvedProviderConfig | undefined {
  const selectedProviderName = providerName ?? config.defaults?.provider;
  if (!selectedProviderName) {
    return undefined;
  }

  const provider = config.providers?.[selectedProviderName];
  if (!provider?.authRef) {
    if (options?.verbose) {
      const sources = (config as ConfigWithMeta)[CONFIG_META_KEY]?.sources ?? [];
      const sourceInfo = sources.length > 0 ? sources.join(", ") : "unknown source";
      console.warn(
        `[obora] Provider config not found or missing authRef for '${selectedProviderName}'. Searched in: ${sourceInfo}`,
      );
    }
    return undefined;
  }

  const apiKey = resolveAuthRef(provider.authRef, { verbose: options?.verbose });
  if (!apiKey) {
    return undefined;
  }

  return {
    provider: selectedProviderName,
    apiKey,
    model: provider.defaultModel ?? config.defaults?.model,
    baseUrl: provider.baseUrl,
    timeout: provider.timeout ?? config.defaults?.timeout,
    maxTokens: provider.maxTokens ?? config.defaults?.maxTokens,
    temperature: config.defaults?.temperature,
  };
}

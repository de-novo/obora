import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import type { LLMConfig } from "./llm-config.js";
import { resolveAuthRef } from "./auth-resolver.js";

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

  return {
    defaults: { ...(base?.defaults ?? {}), ...(override?.defaults ?? {}) },
    providers: { ...(base?.providers ?? {}), ...(override?.providers ?? {}) },
    agents: { ...(base?.agents ?? {}), ...(override?.agents ?? {}) },
  };
}

async function readConfigFile(path: string): Promise<OboraConfig | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const content = await readFile(path, "utf-8");
  const parsed = parseYaml(content) as OboraConfig;
  return parsed;
}

export async function loadConfig(configPath?: string): Promise<OboraConfig | undefined> {
  if (configPath) {
    const explicitPath = resolve(configPath);
    return readConfigFile(explicitPath);
  }

  const globalPath = join(homedir(), ".obora", "config.yaml");
  const projectPath = join(process.cwd(), ".obora", "config.yaml");

  const globalConfig = await readConfigFile(globalPath);
  const projectConfig = await readConfigFile(projectPath);

  return mergeConfig(globalConfig, projectConfig);
}

export function resolveProviderConfig(config: OboraConfig, providerName?: string): ResolvedProviderConfig | undefined {
  const selectedProviderName = providerName ?? config.defaults?.provider;
  if (!selectedProviderName) {
    return undefined;
  }

  const provider = config.providers?.[selectedProviderName];
  if (!provider?.authRef) {
    return undefined;
  }

  const apiKey = resolveAuthRef(provider.authRef);
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

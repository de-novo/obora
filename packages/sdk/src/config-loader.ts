import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { parse as parseYaml } from "yaml";

import type { LLMConfig } from "./llm-config.js";
import { createAuthResolver } from "./auth-resolver.js";
import { OboraError, OboraErrorCode } from "./runtime.js";

export interface ModelPricing {
  model: string;
  promptPer1kTokens: number;
  completionPer1kTokens: number;
}

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
  persistence?: {
    enabled?: boolean;
    adapter?: "sqlite" | "custom";
    sqlite?: { path?: string };
    custom?: unknown;
  };
  artifacts?: {
    enabled?: boolean;
    store?: "local" | "custom";
    local?: { basePath?: string };
    custom?: { instance?: import("@obora/runtime").ArtifactStore };
  };
  sharedMemory?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: {
      basePath?: string;
      projectKey?: string;
      scopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
    };
    custom?: { instance?: import("./shared-memory/store.js").SharedMemoryStore };
  };
  tkgProjection?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: {
      basePath?: string;
      projectKey?: string;
      scopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
    };
    custom?: { instance?: import("./tkg/store.js").StagingTKGStore };
    promotion?: {
      enabled?: boolean;
      minConfidence?: number;
      confidenceSpreadThreshold?: number;
      allowedEventTypes?: import("./tkg/store.js").ProjectableTKGEventType[];
      applyScopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
      triggers?: import("./runtime-types.js").TKGPromotionTrigger[];
      evaluationMode?: import("./runtime-types.js").TKGPromotionEvaluationMode;
    };
    rollback?: {
      enabled?: boolean;
      adapter?: "file" | "custom";
      file?: { basePath?: string };
      custom?: { instance?: import("./tkg/rollback.js").TKGRollbackStore };
    };
    reviewQueue?: {
      enabled?: boolean;
      adapter?: "file" | "custom";
      file?: { basePath?: string };
      custom?: { instance?: import("./tkg/review-queue.js").TKGReviewQueueStore };
    };
  };
  resources?: {
    maxCostPerRun?: number;
    maxTokensPerStep?: number;
    maxCostPerStep?: number;
    onBudgetExceed?: "block" | "warn";
    // Preferred: pricing as model array + unknownModel/fallback as sibling keys.
    pricing?:
      | ModelPricing[]
      | {
          models: ModelPricing[];
          unknownModel?: "warn" | "block" | "estimate";
          fallbackPer1kTokens?: { prompt: number; completion: number };
        };
    unknownModel?: "warn" | "block" | "estimate";
    fallbackPer1kTokens?: { prompt: number; completion: number };
  };
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

const authResolver = createAuthResolver();

const PROVIDER_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  zai: "ZAI_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
};

function getYamlValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
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
    persistence: {
      ...(base?.persistence ?? {}),
      ...(override?.persistence ?? {}),
      sqlite: {
        ...(base?.persistence?.sqlite ?? {}),
        ...(override?.persistence?.sqlite ?? {}),
      },
      custom: override?.persistence?.custom ?? base?.persistence?.custom,
    },
    artifacts: {
      ...(base?.artifacts ?? {}),
      ...(override?.artifacts ?? {}),
      local: {
        ...(base?.artifacts?.local ?? {}),
        ...(override?.artifacts?.local ?? {}),
      },
      custom: override?.artifacts?.custom ?? base?.artifacts?.custom,
    },
    sharedMemory: {
      ...(base?.sharedMemory ?? {}),
      ...(override?.sharedMemory ?? {}),
      file: {
        ...(base?.sharedMemory?.file ?? {}),
        ...(override?.sharedMemory?.file ?? {}),
      },
      custom: override?.sharedMemory?.custom ?? base?.sharedMemory?.custom,
    },
    tkgProjection: {
      ...(base?.tkgProjection ?? {}),
      ...(override?.tkgProjection ?? {}),
      file: {
        ...(base?.tkgProjection?.file ?? {}),
        ...(override?.tkgProjection?.file ?? {}),
      },
      custom: override?.tkgProjection?.custom ?? base?.tkgProjection?.custom,
      promotion: {
        ...(base?.tkgProjection?.promotion ?? {}),
        ...(override?.tkgProjection?.promotion ?? {}),
      },
      rollback: {
        ...(base?.tkgProjection?.rollback ?? {}),
        ...(override?.tkgProjection?.rollback ?? {}),
        file: {
          ...(base?.tkgProjection?.rollback?.file ?? {}),
          ...(override?.tkgProjection?.rollback?.file ?? {}),
        },
        custom: override?.tkgProjection?.rollback?.custom ?? base?.tkgProjection?.rollback?.custom,
      },
      reviewQueue: {
        ...(base?.tkgProjection?.reviewQueue ?? {}),
        ...(override?.tkgProjection?.reviewQueue ?? {}),
        file: {
          ...(base?.tkgProjection?.reviewQueue?.file ?? {}),
          ...(override?.tkgProjection?.reviewQueue?.file ?? {}),
        },
        custom: override?.tkgProjection?.reviewQueue?.custom ?? base?.tkgProjection?.reviewQueue?.custom,
      },
    },
    resources: {
      ...(base?.resources ?? {}),
      ...(override?.resources ?? {}),
    },
  };
}

async function readConfigFile(path: string): Promise<OboraConfig | undefined> {
  if (!(await fileExists(path))) {
    return undefined;
  }

  const content = await readFile(path, "utf-8");
  try {
    const parsed = parseYaml(content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new OboraError(
        `Config must be a YAML object (mapping), got: ${getYamlValueType(parsed)}`,
        OboraErrorCode.SDK_INVALID_CONFIG,
      );
    }

    return parsed as OboraConfig;
  } catch (error) {
    if (error instanceof OboraError) {
      throw error;
    }

    throw new OboraError(
      `Failed to parse config YAML: ${path}`,
      OboraErrorCode.SDK_INVALID_CONFIG,
      undefined,
      undefined,
      error,
    );
  }
}

async function findNearestProjectConfigPath(startDir: string): Promise<string | undefined> {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, ".obora", "config.yaml");
    if (await fileExists(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }

    currentDir = parentDir;
  }
}

export async function loadConfig(configPath?: string): Promise<OboraConfig | undefined> {
  if (configPath) {
    const explicitPath = resolve(configPath);
    const explicit = (await readConfigFile(explicitPath)) as ConfigWithMeta | undefined;
    if (!explicit) {
      throw new OboraError(`Config file not found: ${explicitPath}`, OboraErrorCode.SDK_INVALID_CONFIG);
    }

    explicit[CONFIG_META_KEY] = { sources: [explicitPath] };
    return explicit;
  }

  const globalPath = join(homedir(), ".obora", "config.yaml");
  const projectPath = await findNearestProjectConfigPath(process.cwd());

  const globalConfig = await readConfigFile(globalPath);
  const projectConfig = projectPath ? await readConfigFile(projectPath) : undefined;

  const merged = mergeConfig(globalConfig, projectConfig) as ConfigWithMeta | undefined;
  if (!merged) {
    return undefined;
  }

  const sources: string[] = [];
  if (globalConfig) {
    sources.push(globalPath);
  }
  if (projectConfig && projectPath) {
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
  const authRef = provider?.authRef;

  let apiKey: string | undefined;
  if (authRef) {
    apiKey = authResolver.resolveAuthRef(authRef, { verbose: options?.verbose });
  } else {
    const fallbackEnv = PROVIDER_ENV_KEY_MAP[selectedProviderName] ?? `${selectedProviderName.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
    apiKey = process.env[fallbackEnv];

    if (options?.verbose) {
      const sources = (config as ConfigWithMeta)[CONFIG_META_KEY]?.sources ?? [];
      const sourceInfo = sources.length > 0 ? sources.join(", ") : "unknown source";
      console.warn(
        `[obora] Provider config missing authRef for '${selectedProviderName}'. Tried env fallback '${fallbackEnv}'. Searched in: ${sourceInfo}`,
      );
    }
  }

  if (!apiKey) {
    return undefined;
  }

  return {
    provider: selectedProviderName,
    apiKey,
    model: provider?.defaultModel ?? config.defaults?.model,
    baseUrl: provider?.baseUrl,
    timeout: provider?.timeout ?? config.defaults?.timeout,
    maxTokens: provider?.maxTokens ?? config.defaults?.maxTokens,
    temperature: config.defaults?.temperature,
  };
}

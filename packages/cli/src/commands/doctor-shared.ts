import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { listPiAIModels } from "@obora/adapters";
import type { OboraConfig } from "@obora/sdk";

import { formatter } from "../utils/formatter.js";

export interface DoctorOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

export interface DoctorChecks {
  node: boolean;
  projectConfigPath: string;
  projectConfig: boolean;
  globalConfigPath: string;
  globalConfig: boolean;
}

export interface DoctorProviderHint {
  configuredProvider: string | null;
  recommendedProvider: string | null;
  recommendedAuthEnvKey: string | null;
}

export interface ProviderSetupExamples {
  authExportExample: string | null;
  modelEnvExample: string | null;
  modelConfigExample: string | null;
  modelRecommendationReason: string | null;
}

export interface DoctorAuthDiagnostics extends ProviderSetupExamples {
  configuredProvider: string | null;
  recommendedProvider: string | null;
  recommendedAuthEnvKey: string | null;
  resolvedProvider: string | null;
  resolvedAuthEnvKey: string | null;
  resolvedModelEnvKey: string | null;
  resolvedAuthExportExample: string | null;
  resolvedModelEnvExample: string | null;
  resolvedModelConfigExample: string | null;
  modelRecommendationReason: string | null;
  resolvedModelRecommendationReason: string | null;
  detectedProviders: string[];
  providerMismatchWarning: string | null;
  conflictSummary: string | null;
  setupGuide: string;
}

export interface DoctorConfigDiagnostics {
  configSource: string;
  sourceChain: string[];
  globalConfigPath: string | null;
  projectConfigPath: string | null;
  activeConfigPath: string | null;
  nextPlaceToEdit: string;
}

export interface DoctorAction {
  kind: "run" | "env" | "shell" | "config" | "doc";
  command?: string;
  shellCommand?: string;
  envKey?: string;
  envKeys?: string[];
  path?: string;
  key?: string;
  value?: string;
}

export interface DoctorOutputSections {
  status: {
    heading: "Status";
    status: "ready" | "needs_config" | "stub_mode";
    message: string;
  };
  configuration: {
    heading: "Configuration";
    node: boolean;
    projectConfig: boolean;
    projectConfigPath: string;
    globalConfig: boolean;
    globalConfigPath: string;
    configuredProvider: string | null;
    configuredModel: string | null;
    authSource: string;
    configSource: string;
    mergedSources: string | null;
    activeConfigPath: string | null;
  };
  resolution: {
    heading: "Resolution";
    resolvedProvider: string | null;
    provider: string | null;
    resolvedModel: string | null;
    model: string | null;
    modelSource: string;
    chosenByPrecedence: string;
    fallbackStub: boolean;
    nextPlaceToEdit: string;
  };
  warnings: {
    heading: "Warnings";
    items: string[];
  };
  recommendedNextActions: {
    heading: "Recommended next actions";
    items: string[];
  };
}

export interface DoctorOverview {
  status: "ready" | "needs_config" | "stub_mode";
  message: string;
  configuredProvider: string | null;
  configuredModel: string | null;
  resolvedProvider: string | null;
  resolvedModel: string | null;
  fallbackStub: boolean;
  conflictSummary: string | null;
  nextPlaceToEdit: string;
}

export interface DoctorDiagnosticsBundle {
  checks: DoctorChecks;
  auth: DoctorAuthDiagnostics;
  config: DoctorConfigDiagnostics;
  resolution: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    modelSource: string;
    chosenByPrecedence: string;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
    warnings: string[];
  };
}

export interface DoctorGuidance {
  recommendations: string[];
  actions: DoctorAction[];
}

export const AUTH_ENV_EXAMPLES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ZAI_API_KEY"] as const;

export const AUTH_SETUP_GUIDE = "docs/tutorials/06-llm-config-auth-quickstart.md";

export const PROVIDER_MODEL_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_MODEL",
  cerebras: "CEREBRAS_MODEL",
  google: "GOOGLE_MODEL",
  groq: "GROQ_MODEL",
  huggingface: "HUGGINGFACE_MODEL",
  "github-copilot": "GITHUB_COPILOT_MODEL",
  "kimi-coding": "KIMI_CODING_MODEL",
  mistral: "MISTRAL_MODEL",
  minimax: "MINIMAX_MODEL",
  "minimax-cn": "MINIMAX_CN_MODEL",
  opencode: "OPENCODE_MODEL",
  openai: "OPENAI_MODEL",
  "openai-codex": "OPENAI_MODEL",
  openrouter: "OPENROUTER_MODEL",
  xai: "XAI_MODEL",
  zai: "ZAI_MODEL",
  "vercel-ai-gateway": "VERCEL_AI_GATEWAY_MODEL",
};

export const PROVIDER_AUTH_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  google: "GOOGLE_API_KEY",
  groq: "GROQ_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  "github-copilot": "GITHUB_COPILOT_API_KEY",
  "kimi-coding": "KIMI_CODING_API_KEY",
  mistral: "MISTRAL_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  opencode: "OPENCODE_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  zai: "ZAI_API_KEY",
  "vercel-ai-gateway": "VERCEL_AI_GATEWAY_API_KEY",
};

export const PROVIDER_DEFAULT_MODEL_MAP: Record<string, string> = {
  anthropic: "claude-opus-4-6",
  openai: "gpt-5.4",
  openrouter: "openai/gpt-5.4",
  zai: "glm-5",
};

export interface RecommendedModelInfo {
  model: string;
  reason: string;
}

export function buildGoogleModelRecommendationReason(model: string): string {
  const stable = !/preview|latest|live/i.test(model);
  const stability = stable ? "stable" : "preview";

  if (model.includes("flash-lite")) {
    return `pi-ai catalog latest ${stability} Gemini Flash Lite model for google`;
  }
  if (model.includes("flash")) {
    return `pi-ai catalog latest ${stability} Gemini Flash model for google`;
  }
  return `pi-ai catalog latest ${stability} Gemini Pro model for google`;
}

export function buildModelRecommendationReason(
  provider: string,
  source: "catalog" | "fallback"
): string {
  if (source === "catalog") {
    switch (provider) {
      case "openai":
        return "pi-ai catalog latest GPT base model for openai";
      case "anthropic":
        return "pi-ai catalog latest stable base Claude model for anthropic";
      case "zai":
        return "pi-ai catalog latest GLM base model for zai";
      case "openrouter":
        return "pi-ai catalog latest OpenAI base model routed via openrouter";
      default:
        return `pi-ai catalog latest base model for ${provider}`;
    }
  }

  return `static fallback default model for ${provider}`;
}

export function buildRecommendedModelInfo(provider: string): RecommendedModelInfo {
  const catalogModel = inferLatestCatalogModel(provider);
  if (catalogModel) {
    return {
      model: catalogModel,
      reason:
        provider === "google"
          ? buildGoogleModelRecommendationReason(catalogModel)
          : buildModelRecommendationReason(provider, "catalog"),
    };
  }

  const mappedDefault = PROVIDER_DEFAULT_MODEL_MAP[provider];
  if (mappedDefault) {
    return {
      model: mappedDefault,
      reason: buildModelRecommendationReason(provider, "fallback"),
    };
  }

  return {
    model: "your-model-name",
    reason: `no catalog-backed default available; choose a provider-specific model for ${provider}`,
  };
}

export function selectOpenAILatestModel(models: string[]): string | undefined {
  const scored = models
    .map((model) => {
      const match = /^gpt-(\d+)(?:\.(\d+))?$/.exec(model);
      if (!match) return null;
      return {
        model,
        major: Number(match[1] ?? 0),
        minor: Number(match[2] ?? 0),
      };
    })
    .filter((entry): entry is { model: string; major: number; minor: number } => entry !== null)
    .sort((left, right) => right.major - left.major || right.minor - left.minor);

  return scored[0]?.model;
}

export interface AnthropicModelScore {
  model: string;
  family: number;
  major: number;
  minor: number;
  stableAlias: boolean;
  snapshotDate: number;
}

export function parseAnthropicModel(
  model: string,
  familyPriority: Record<string, number>
): AnthropicModelScore | null {
  const modernMatch = /^claude-(opus|sonnet|haiku)-(\d+)-(\d+)(?:-(\d{8}))?$/.exec(model);
  if (modernMatch) {
    const major = Number(modernMatch[2] ?? 0);
    const thirdToken = modernMatch[3] ?? "0";
    const snapshotDate = modernMatch[4] ? Number(modernMatch[4]) : 0;

    if (!modernMatch[4] && thirdToken.length === 8) {
      return {
        model,
        family: familyPriority[modernMatch[1] ?? ""] ?? 0,
        major,
        minor: 0,
        stableAlias: false,
        snapshotDate: Number(thirdToken),
      };
    }

    return {
      model,
      family: familyPriority[modernMatch[1] ?? ""] ?? 0,
      major,
      minor: Number(thirdToken),
      stableAlias: !modernMatch[4],
      snapshotDate,
    };
  }

  const legacyMatch = /^claude-(\d+)-(\d+)-(opus|sonnet|haiku)(?:-(latest|\d{8}))?$/.exec(model);
  if (!legacyMatch) {
    return null;
  }

  return {
    model,
    family: familyPriority[legacyMatch[3] ?? ""] ?? 0,
    major: Number(legacyMatch[1] ?? 0),
    minor: Number(legacyMatch[2] ?? 0),
    stableAlias: !legacyMatch[4] || legacyMatch[4] === "latest",
    snapshotDate: legacyMatch[4] && legacyMatch[4] !== "latest" ? Number(legacyMatch[4]) : 0,
  };
}

export function selectAnthropicLatestModel(models: string[]): string | undefined {
  const familyPriority: Record<string, number> = {
    opus: 3,
    sonnet: 2,
    haiku: 1,
  };

  const scored = models
    .map((model) => parseAnthropicModel(model, familyPriority))
    .filter((entry): entry is AnthropicModelScore => entry !== null)
    .sort(
      (left, right) =>
        right.family - left.family ||
        right.major - left.major ||
        right.minor - left.minor ||
        Number(right.stableAlias) - Number(left.stableAlias) ||
        right.snapshotDate - left.snapshotDate
    );

  return scored[0]?.model;
}

export function selectZAILatestModel(models: string[]): string | undefined {
  const scored = models
    .map((model) => {
      const match = /^glm-(\d+)(?:\.(\d+))?$/.exec(model);
      if (!match) return null;
      return {
        model,
        major: Number(match[1] ?? 0),
        minor: Number(match[2] ?? 0),
      };
    })
    .filter((entry): entry is { model: string; major: number; minor: number } => entry !== null)
    .sort((left, right) => right.major - left.major || right.minor - left.minor);

  return scored[0]?.model;
}

export function selectGoogleLatestModel(models: string[]): string | undefined {
  const familyPriority: Record<string, number> = {
    pro: 3,
    flash: 2,
    "flash-lite": 1,
  };

  const scored = models
    .map((model) => {
      const match = /^gemini-(\d+)(?:\.(\d+))?-(pro|flash-lite|flash)(?:-.+)?$/.exec(model);
      if (!match) return null;
      return {
        model,
        major: Number(match[1] ?? 0),
        minor: Number(match[2] ?? 0),
        family: familyPriority[match[3] ?? ""] ?? 0,
        stableAlias: !/preview|latest|live/i.test(model),
      };
    })
    .filter(
      (
        entry
      ): entry is {
        model: string;
        major: number;
        minor: number;
        family: number;
        stableAlias: boolean;
      } => entry !== null
    )
    .sort(
      (left, right) =>
        Number(right.stableAlias) - Number(left.stableAlias) ||
        right.family - left.family ||
        right.major - left.major ||
        right.minor - left.minor
    );

  return scored[0]?.model;
}

export function selectOpenRouterLatestModel(models: string[]): string | undefined {
  const openaiModels = models.filter((model) => model.startsWith("openai/"));
  const selectedOpenAI = selectOpenAILatestModel(
    openaiModels.map((model) => model.replace(/^openai\//, ""))
  );
  return selectedOpenAI ? `openai/${selectedOpenAI}` : undefined;
}

export function inferLatestCatalogModel(provider: string): string | undefined {
  let models: string[];
  try {
    models = listPiAIModels(provider);
  } catch {
    return undefined;
  }

  if (models.length === 0) {
    return undefined;
  }

  switch (provider) {
    case "openai":
      return selectOpenAILatestModel(models);
    case "anthropic":
      return selectAnthropicLatestModel(models);
    case "zai":
      return selectZAILatestModel(models);
    case "openrouter":
      return selectOpenRouterLatestModel(models);
    case "google":
      return selectGoogleLatestModel(models);
    default:
      return undefined;
  }
}

export function inferAuthEnvKey(provider: string): string {
  return (
    PROVIDER_AUTH_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
  );
}

export function inferModelEnvKey(provider: string): string {
  return (
    PROVIDER_MODEL_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODEL`
  );
}

export function buildProviderSetupExamples(provider: string | null): ProviderSetupExamples {
  if (!provider) {
    return {
      authExportExample: null,
      modelEnvExample: null,
      modelConfigExample: null,
      modelRecommendationReason: null,
    };
  }

  const authEnvKey = inferAuthEnvKey(provider);
  const modelEnvKey = inferModelEnvKey(provider);
  const recommendedModel = buildRecommendedModelInfo(provider);

  return {
    authExportExample: `export ${authEnvKey}=***`,
    modelEnvExample: `export ${modelEnvKey}=${recommendedModel.model}`,
    modelConfigExample: `providers:
  ${provider}:
    defaultModel: ${recommendedModel.model}`,
    modelRecommendationReason: recommendedModel.reason,
  };
}

export function detectAuthProviders(
  env: Record<string, string | undefined> = process.env
): string[] {
  const detected: string[] = [];
  const seenEnvKeys = new Set<string>();

  for (const [provider, envKey] of Object.entries(PROVIDER_AUTH_ENV_KEY_MAP)) {
    if (!env[envKey] || seenEnvKeys.has(envKey)) {
      continue;
    }

    detected.push(provider);
    seenEnvKeys.add(envKey);
  }

  return detected.sort();
}

export function buildRecommendedProviderHint(
  summary: { authSource: string },
  loadedConfig?: OboraConfig
): DoctorProviderHint {
  const configuredProvider = loadedConfig?.defaults?.provider ?? null;

  if (summary.authSource !== "none" || !configuredProvider) {
    return {
      configuredProvider,
      recommendedProvider: null,
      recommendedAuthEnvKey: null,
    };
  }

  return {
    configuredProvider,
    recommendedProvider: configuredProvider,
    recommendedAuthEnvKey: inferAuthEnvKey(configuredProvider),
  };
}

export function buildConflictSummary(
  configuredProvider: string | null,
  detectedProviders: string[],
  resolvedProvider: string | null
): string | null {
  if (
    !configuredProvider ||
    detectedProviders.length === 0 ||
    detectedProviders.includes(configuredProvider)
  ) {
    return null;
  }

  return `config ${configuredProvider} · env ${detectedProviders.join(", ")} · resolved ${resolvedProvider ?? "none"}`;
}

export function buildAuthDiagnostics(
  providerHint: DoctorProviderHint,
  summary: { provider: string | null }
): DoctorAuthDiagnostics {
  const setupExamples = buildProviderSetupExamples(
    providerHint.recommendedProvider ?? providerHint.configuredProvider
  );
  const resolvedSetupExamples = buildProviderSetupExamples(summary.provider);
  const detectedProviders = detectAuthProviders();
  const providerMismatchWarning =
    providerHint.configuredProvider &&
    detectedProviders.length > 0 &&
    !detectedProviders.includes(providerHint.configuredProvider)
      ? `Configured provider '${providerHint.configuredProvider}' differs from detected env auth providers: ${detectedProviders.join(", ")}`
      : null;
  const conflictSummary = buildConflictSummary(
    providerHint.configuredProvider,
    detectedProviders,
    summary.provider
  );

  return {
    configuredProvider: providerHint.configuredProvider,
    recommendedProvider: providerHint.recommendedProvider,
    recommendedAuthEnvKey: providerHint.recommendedAuthEnvKey,
    resolvedProvider: summary.provider,
    resolvedAuthEnvKey: summary.provider ? inferAuthEnvKey(summary.provider) : null,
    resolvedModelEnvKey: summary.provider ? inferModelEnvKey(summary.provider) : null,
    resolvedAuthExportExample: resolvedSetupExamples.authExportExample,
    resolvedModelEnvExample: resolvedSetupExamples.modelEnvExample,
    resolvedModelConfigExample: resolvedSetupExamples.modelConfigExample,
    resolvedModelRecommendationReason: resolvedSetupExamples.modelRecommendationReason,
    detectedProviders,
    providerMismatchWarning,
    conflictSummary,
    setupGuide: AUTH_SETUP_GUIDE,
    ...setupExamples,
  };
}

export function buildConfigDiagnostics(
  checks: DoctorChecks,
  summary: { configSource: string; nextPlaceToEdit: string }
): DoctorConfigDiagnostics {
  const sourceChain =
    summary.configSource === "none"
      ? []
      : summary.configSource
          .split(" -> ")
          .map((part) => part.trim())
          .filter(Boolean);

  const globalConfigPath = sourceChain.find((path) => path === checks.globalConfigPath) ?? null;
  const activeConfigPath = sourceChain.at(-1) ?? null;
  const projectConfigPath =
    sourceChain.find((path) => path !== globalConfigPath && path.endsWith("/.obora/config.yaml")) ??
    (activeConfigPath !== globalConfigPath ? activeConfigPath : null);

  return {
    configSource: summary.configSource,
    sourceChain,
    globalConfigPath,
    projectConfigPath,
    activeConfigPath,
    nextPlaceToEdit: summary.nextPlaceToEdit,
  };
}

export function summarizeConfigChain(configDiagnostics: DoctorConfigDiagnostics): string | null {
  if (configDiagnostics.sourceChain.length <= 1) {
    return null;
  }

  const labels = configDiagnostics.sourceChain.map((path) => {
    if (path === configDiagnostics.globalConfigPath) {
      return "global";
    }
    if (path === configDiagnostics.projectConfigPath) {
      return "project";
    }
    return "config";
  });

  return labels.join(" -> ");
}

function extractExportValue(example: string | null): string | null {
  if (!example) {
    return null;
  }

  const match = /^export [A-Z0-9_]+=(.+)$/.exec(example.trim());
  return match?.[1] ?? null;
}

export function buildAuthExampleHint(summary: { authSource: string }): string | null {
  if (summary.authSource !== "none") {
    return null;
  }

  return `Examples: export ${AUTH_ENV_EXAMPLES[0]}=***  |  export ${AUTH_ENV_EXAMPLES[1]}=***  |  export ${AUTH_ENV_EXAMPLES[2]}=***`;
}

export function buildConfiguredProviderHints(providerHint: DoctorProviderHint): string[] {
  if (!providerHint.recommendedProvider || !providerHint.recommendedAuthEnvKey) {
    return [];
  }

  const setupExamples = buildProviderSetupExamples(providerHint.recommendedProvider);

  return [
    `Configured default provider: ${providerHint.recommendedProvider}`,
    `Recommended auth: export ${providerHint.recommendedAuthEnvKey}=***`,
    ...(setupExamples.modelRecommendationReason
      ? [`Model basis: ${setupExamples.modelRecommendationReason}`]
      : []),
  ];
}

export function buildDetectedProviderMismatchRecommendations(
  checks: DoctorChecks,
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics
): string[] {
  if (!authDiagnostics.providerMismatchWarning || !providerHint.recommendedAuthEnvKey) {
    return [];
  }

  const recommendations = [
    `Detected env auth does not match configured provider. Either export ${providerHint.recommendedAuthEnvKey}=*** or switch defaults.provider to one of: ${authDiagnostics.detectedProviders.join(", ")}`,
  ];

  const envKeysToUnset = authDiagnostics.detectedProviders.flatMap((provider) => {
    const keys = [inferAuthEnvKey(provider)];
    const modelEnvKey = PROVIDER_MODEL_ENV_KEY_MAP[provider];
    if (modelEnvKey) {
      keys.push(modelEnvKey);
    }
    return keys;
  });

  if (envKeysToUnset.length > 0) {
    recommendations.push(`Shell fix: unset ${Array.from(new Set(envKeysToUnset)).join(" ")}`);
  }

  if (authDiagnostics.detectedProviders.length === 1) {
    recommendations.push(
      `Config fix: edit ${checks.projectConfigPath} -> defaults.provider: ${authDiagnostics.detectedProviders[0]}`
    );
  }

  return recommendations;
}

export function isConfigFilePath(path: string): boolean {
  return /\.(ya?ml)$/i.test(path);
}

export function pushDoctorAction(actions: DoctorAction[], action: DoctorAction): void {
  const signature = JSON.stringify(action);
  if (actions.some((existing) => JSON.stringify(existing) === signature)) {
    return;
  }
  actions.push(action);
}

export function buildDetectedProviderMismatchActions(
  checks: DoctorChecks,
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics
): DoctorAction[] {
  if (!authDiagnostics.providerMismatchWarning || !providerHint.recommendedAuthEnvKey) {
    return [];
  }

  const actions: DoctorAction[] = [
    {
      kind: "env",
      envKey: providerHint.recommendedAuthEnvKey,
      shellCommand: `export ${providerHint.recommendedAuthEnvKey}=***`,
    },
  ];

  const envKeysToUnset = authDiagnostics.detectedProviders.flatMap((provider) => {
    const keys = [inferAuthEnvKey(provider)];
    const modelEnvKey = PROVIDER_MODEL_ENV_KEY_MAP[provider];
    if (modelEnvKey) {
      keys.push(modelEnvKey);
    }
    return keys;
  });

  if (envKeysToUnset.length > 0) {
    actions.push({
      kind: "shell",
      shellCommand: `unset ${Array.from(new Set(envKeysToUnset)).join(" ")}`,
      envKeys: Array.from(new Set(envKeysToUnset)),
    });
  }

  if (authDiagnostics.detectedProviders.length === 1) {
    actions.push({
      kind: "config",
      path: checks.projectConfigPath,
      key: "defaults.provider",
      value: authDiagnostics.detectedProviders[0],
    });
  }

  return actions;
}

export function buildResolvedProviderMismatchActions(
  summary: { provider: string | null; nextPlaceToEdit: string },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics
): DoctorAction[] {
  if (!summary.provider || !providerHint.configuredProvider) {
    return [];
  }

  if (summary.provider === providerHint.configuredProvider) {
    return [];
  }

  const actions: DoctorAction[] = [
    {
      kind: "env",
      envKey: inferAuthEnvKey(providerHint.configuredProvider),
      shellCommand: `export ${inferAuthEnvKey(providerHint.configuredProvider)}=***`,
    },
  ];

  const envKeysToUnset = [
    authDiagnostics.resolvedAuthEnvKey,
    authDiagnostics.resolvedModelEnvKey,
  ].filter((key): key is string => Boolean(key));
  if (envKeysToUnset.length > 0) {
    actions.push({
      kind: "shell",
      shellCommand: `unset ${Array.from(new Set(envKeysToUnset)).join(" ")}`,
      envKeys: Array.from(new Set(envKeysToUnset)),
    });
  }

  if (isConfigFilePath(summary.nextPlaceToEdit)) {
    actions.push({
      kind: "config",
      path: summary.nextPlaceToEdit,
      key: "defaults.provider",
      value: summary.provider,
    });
  }

  return actions;
}

export function buildResolvedProviderMismatchRecommendations(
  summary: { provider: string | null; nextPlaceToEdit: string },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics
): string[] {
  if (!summary.provider || !providerHint.configuredProvider) {
    return [];
  }

  if (summary.provider === providerHint.configuredProvider) {
    return [];
  }

  const recommendations = [
    `Resolved provider does not match configured provider. Either export ${inferAuthEnvKey(providerHint.configuredProvider)}=*** or switch defaults.provider to ${summary.provider}`,
  ];

  const envKeysToUnset = [
    authDiagnostics.resolvedAuthEnvKey,
    authDiagnostics.resolvedModelEnvKey,
  ].filter((key): key is string => Boolean(key));
  if (envKeysToUnset.length > 0) {
    recommendations.push(`Shell fix: unset ${Array.from(new Set(envKeysToUnset)).join(" ")}`);
  }

  if (isConfigFilePath(summary.nextPlaceToEdit)) {
    recommendations.push(
      `Config fix: edit ${summary.nextPlaceToEdit} -> defaults.provider: ${summary.provider}`
    );
  }

  return recommendations;
}

export function buildProviderSpecificGuidance(
  summary: { authSource: string; provider: string | null; model: string | null },
  authDiagnostics: DoctorAuthDiagnostics
): string[] {
  const guidance: string[] = [];

  if (summary.authSource === "none" && authDiagnostics.authExportExample) {
    guidance.push(`Provider auth example: ${authDiagnostics.authExportExample}`);
  }

  if (summary.provider && !summary.model) {
    const hasProviderMismatch =
      Boolean(authDiagnostics.configuredProvider) &&
      Boolean(authDiagnostics.resolvedProvider) &&
      authDiagnostics.configuredProvider !== authDiagnostics.resolvedProvider;

    if (!hasProviderMismatch) {
      const useResolvedExamples =
        authDiagnostics.resolvedProvider &&
        (!authDiagnostics.configuredProvider ||
          authDiagnostics.resolvedProvider !== authDiagnostics.configuredProvider);

      const modelConfigExample = useResolvedExamples
        ? authDiagnostics.resolvedModelConfigExample
        : authDiagnostics.modelConfigExample;
      const modelEnvExample = useResolvedExamples
        ? authDiagnostics.resolvedModelEnvExample
        : authDiagnostics.modelEnvExample;
      const modelRecommendationReason = useResolvedExamples
        ? authDiagnostics.resolvedModelRecommendationReason
        : authDiagnostics.modelRecommendationReason;
      const modelConfigPrefix = useResolvedExamples ? "Resolved model config" : "Model config";
      const modelEnvPrefix = useResolvedExamples ? "Resolved model env" : "Model env";
      const modelReasonPrefix = useResolvedExamples ? "Resolved model basis" : "Model basis";

      const hasConcreteRecommendedModel =
        extractExportValue(modelEnvExample) !== null &&
        extractExportValue(modelEnvExample) !== "your-model-name";

      if (modelConfigExample && hasConcreteRecommendedModel) {
        guidance.push(`${modelConfigPrefix}: ${modelConfigExample}`);
      }
      if (modelEnvExample && hasConcreteRecommendedModel) {
        guidance.push(`${modelEnvPrefix}: ${modelEnvExample}`);
      }
      if (modelRecommendationReason) {
        guidance.push(`${modelReasonPrefix}: ${modelRecommendationReason}`);
      }
    }
  }

  return guidance;
}

export function buildDoctorChecks(): DoctorChecks {
  const projectConfigPath = join(process.cwd(), ".obora", "config.yaml");
  const globalConfigPath = join(homedir(), ".obora", "config.yaml");

  return {
    node: true,
    projectConfigPath,
    projectConfig: existsSync(projectConfigPath),
    globalConfigPath,
    globalConfig: existsSync(globalConfigPath),
  };
}

export function buildDoctorStatus(
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    fallbackStub: boolean;
  },
  authDiagnostics?: { configuredProvider: string | null }
): { status: "ready" | "needs_config" | "stub_mode"; message: string } {
  if (
    authDiagnostics?.configuredProvider &&
    summary.provider &&
    authDiagnostics.configuredProvider !== summary.provider
  ) {
    return {
      status: "needs_config",
      message: `Needs provider alignment: configured ${authDiagnostics.configuredProvider} but resolved ${summary.provider}`,
    };
  }

  if (!summary.fallbackStub && summary.provider && summary.model) {
    return {
      status: "ready",
      message: `Ready: ${summary.provider}/${summary.model}`,
    };
  }

  if (summary.authSource === "none") {
    return {
      status: "needs_config",
      message: "Needs auth: no provider credential detected",
    };
  }

  if (summary.provider && !summary.model) {
    return {
      status: "needs_config",
      message: "Needs model: provider auth detected but no model is resolved",
    };
  }

  return {
    status: "stub_mode",
    message: "Stub mode: provider/model is not fully resolved yet",
  };
}

function hasProjectJudgeWorkflow(checks: DoctorChecks): boolean {
  return checks.projectConfig && existsSync(join(process.cwd(), "judge.yaml"));
}

function getConfiguredAgentNames(loadedConfig?: OboraConfig): string[] {
  return Object.keys(loadedConfig?.agents ?? {}).sort();
}

function buildAgentInspectionRecommendations(loadedConfig?: OboraConfig): string[] {
  const agentNames = getConfiguredAgentNames(loadedConfig);
  if (agentNames.length === 0) {
    return [];
  }

  const recommendations = ["Inspect agent overrides: obora agents list"];
  const firstAgent = agentNames[0];
  if (firstAgent) {
    recommendations.push(`Inspect configured agent: obora agents show ${firstAgent}`);
  }

  return recommendations;
}

function buildAgentInspectionActions(loadedConfig?: OboraConfig): DoctorAction[] {
  const agentNames = getConfiguredAgentNames(loadedConfig);
  if (agentNames.length === 0) {
    return [];
  }

  const actions: DoctorAction[] = [{ kind: "run", command: "obora agents list" }];
  const firstAgent = agentNames[0];
  if (firstAgent) {
    actions.push({ kind: "run", command: `obora agents show ${firstAgent}` });
  }

  return actions;
}

function getDoctorWorkflowCommands(checks: DoctorChecks): {
  validateCommand: string | null;
  previewCommand: string;
  runCommand: string;
} {
  if (hasProjectJudgeWorkflow(checks)) {
    return {
      validateCommand: "obora validate judge.yaml",
      previewCommand: "obora judge --dry-run",
      runCommand: "obora judge",
    };
  }

  return {
    validateCommand: null,
    previewCommand: "obora run <workflow.yaml> --dry-run",
    runCommand: "obora run <workflow.yaml>",
  };
}

export function buildDoctorRecommendations(
  checks: DoctorChecks,
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
    warnings: string[];
  },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics,
  loadedConfig?: OboraConfig
): string[] {
  const recommendations: string[] = [];
  const workflowCommands = getDoctorWorkflowCommands(checks);

  if (!checks.projectConfig) {
    recommendations.push(`Run: obora init --quickstart  # creates ${checks.projectConfigPath}`);
  }

  if (summary.authSource === "none") {
    recommendations.push("Set one provider API key, then rerun: obora doctor");
    recommendations.push(`Setup guide: ${authDiagnostics.setupGuide}`);
    recommendations.push(...buildConfiguredProviderHints(providerHint));
    const authExampleHint = buildAuthExampleHint(summary);
    if (authExampleHint) {
      recommendations.push(authExampleHint);
    }
    recommendations.push(
      ...buildDetectedProviderMismatchRecommendations(checks, providerHint, authDiagnostics)
    );
  }

  recommendations.push(
    ...buildResolvedProviderMismatchRecommendations(summary, providerHint, authDiagnostics)
  );

  recommendations.push(...buildProviderSpecificGuidance(summary, authDiagnostics));

  if (summary.provider && !summary.model) {
    const recommendedModelValue =
      extractExportValue(authDiagnostics.resolvedModelEnvExample) ??
      extractExportValue(authDiagnostics.modelEnvExample);
    const hasConcreteRecommendedModel =
      Boolean(recommendedModelValue) && recommendedModelValue !== "your-model-name";
    const hasProviderMismatch =
      Boolean(summary.provider) &&
      Boolean(providerHint.configuredProvider) &&
      summary.provider !== providerHint.configuredProvider;

    if (!hasProviderMismatch) {
      if (hasConcreteRecommendedModel) {
        if (isConfigFilePath(summary.nextPlaceToEdit)) {
          recommendations.push(
            `Config fix: edit ${summary.nextPlaceToEdit} -> providers.${summary.provider}.defaultModel: ${recommendedModelValue}`
          );
        }
        recommendations.push(
          `Shell fix: export ${inferModelEnvKey(summary.provider)}=${recommendedModelValue}`
        );
      } else {
        recommendations.push(
          `Set a default model in .obora/config.yaml or export ${inferModelEnvKey(summary.provider)}=***`
        );
      }
    }
  }

  if (summary.configSource === "none") {
    recommendations.push("Add provider/model defaults in .obora/config.yaml");
  }

  if (summary.fallbackStub) {
    if (workflowCommands.validateCommand) {
      recommendations.push(`Validate workflow shape: ${workflowCommands.validateCommand}`);
    }
    recommendations.push(`Preview before execution: ${workflowCommands.previewCommand}`);
  }

  if (recommendations.length === 0 && summary.warnings.length === 0) {
    recommendations.push(`Run your workflow: ${workflowCommands.runCommand}`);
  }

  recommendations.push(...buildAgentInspectionRecommendations(loadedConfig));

  return recommendations;
}

export function buildDoctorActions(
  checks: DoctorChecks,
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
    warnings: string[];
  },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics,
  loadedConfig?: OboraConfig
): DoctorAction[] {
  const actions: DoctorAction[] = [];
  const workflowCommands = getDoctorWorkflowCommands(checks);

  if (!checks.projectConfig) {
    pushDoctorAction(actions, { kind: "run", command: "obora init --quickstart" });
  }

  if (summary.authSource === "none") {
    pushDoctorAction(actions, { kind: "run", command: "obora doctor" });
    pushDoctorAction(actions, { kind: "doc", path: authDiagnostics.setupGuide });
    if (providerHint.recommendedAuthEnvKey) {
      pushDoctorAction(actions, {
        kind: "env",
        envKey: providerHint.recommendedAuthEnvKey,
        shellCommand: `export ${providerHint.recommendedAuthEnvKey}=***`,
      });
    }
  }

  for (const action of buildDetectedProviderMismatchActions(
    checks,
    providerHint,
    authDiagnostics
  )) {
    pushDoctorAction(actions, action);
  }

  for (const action of buildResolvedProviderMismatchActions(
    summary,
    providerHint,
    authDiagnostics
  )) {
    pushDoctorAction(actions, action);
  }

  if (summary.provider && !summary.model) {
    const recommendedModelValue =
      extractExportValue(authDiagnostics.resolvedModelEnvExample) ??
      extractExportValue(authDiagnostics.modelEnvExample);
    const hasConcreteRecommendedModel =
      Boolean(recommendedModelValue) && recommendedModelValue !== "your-model-name";
    const hasProviderMismatch =
      Boolean(summary.provider) &&
      Boolean(providerHint.configuredProvider) &&
      summary.provider !== providerHint.configuredProvider;

    if (!hasProviderMismatch) {
      if (hasConcreteRecommendedModel) {
        if (isConfigFilePath(summary.nextPlaceToEdit) && recommendedModelValue) {
          pushDoctorAction(actions, {
            kind: "config",
            path: summary.nextPlaceToEdit,
            key: `providers.${summary.provider}.defaultModel`,
            value: recommendedModelValue,
          });
        }

        pushDoctorAction(actions, {
          kind: "env",
          envKey: inferModelEnvKey(summary.provider),
          shellCommand: `export ${inferModelEnvKey(summary.provider)}=${recommendedModelValue}`,
        });
      } else {
        pushDoctorAction(actions, {
          kind: "env",
          envKey: inferModelEnvKey(summary.provider),
          shellCommand: `export ${inferModelEnvKey(summary.provider)}=***`,
        });
      }
    }
  }

  if (summary.fallbackStub) {
    if (workflowCommands.validateCommand) {
      pushDoctorAction(actions, { kind: "run", command: workflowCommands.validateCommand });
    }
    pushDoctorAction(actions, { kind: "run", command: workflowCommands.previewCommand });
  }

  if (actions.length === 0 && summary.warnings.length === 0) {
    pushDoctorAction(actions, { kind: "run", command: workflowCommands.runCommand });
  }

  for (const action of buildAgentInspectionActions(loadedConfig)) {
    pushDoctorAction(actions, action);
  }

  return actions;
}

export function buildDoctorOutputSections(
  checks: DoctorChecks,
  status: { status: "ready" | "needs_config" | "stub_mode"; message: string },
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    modelSource: string;
    chosenByPrecedence: string;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
    warnings: string[];
  },
  loadedConfig: OboraConfig | undefined,
  configDiagnostics: DoctorConfigDiagnostics,
  authDiagnostics: DoctorAuthDiagnostics,
  recommendations: string[]
): DoctorOutputSections {
  const mergedSources = summarizeConfigChain(configDiagnostics);
  const warnings = [...summary.warnings];
  if (authDiagnostics.providerMismatchWarning) {
    warnings.push(authDiagnostics.providerMismatchWarning);
  }
  if (authDiagnostics.conflictSummary) {
    warnings.push(`Conflict: ${authDiagnostics.conflictSummary}`);
  }

  return {
    status: {
      heading: "Status",
      status: status.status,
      message: status.message,
    },
    configuration: {
      heading: "Configuration",
      node: checks.node,
      projectConfig: checks.projectConfig,
      projectConfigPath: checks.projectConfigPath,
      globalConfig: checks.globalConfig,
      globalConfigPath: checks.globalConfigPath,
      configuredProvider: authDiagnostics.configuredProvider,
      configuredModel: loadedConfig?.defaults?.model ?? null,
      authSource: summary.authSource,
      configSource: summary.configSource,
      mergedSources,
      activeConfigPath: configDiagnostics.activeConfigPath,
    },
    resolution: {
      heading: "Resolution",
      resolvedProvider: summary.provider,
      provider: summary.provider,
      resolvedModel: summary.model,
      model: summary.model,
      modelSource: summary.modelSource,
      chosenByPrecedence: summary.chosenByPrecedence,
      fallbackStub: summary.fallbackStub,
      nextPlaceToEdit: summary.nextPlaceToEdit,
    },
    warnings: {
      heading: "Warnings",
      items: warnings,
    },
    recommendedNextActions: {
      heading: "Recommended next actions",
      items: recommendations,
    },
  };
}

export function buildDoctorOverview(
  status: { status: "ready" | "needs_config" | "stub_mode"; message: string },
  loadedConfig: OboraConfig | undefined,
  summary: {
    provider: string | null;
    model: string | null;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
  },
  authDiagnostics: DoctorAuthDiagnostics
): DoctorOverview {
  return {
    status: status.status,
    message: status.message,
    configuredProvider: authDiagnostics.configuredProvider,
    configuredModel: loadedConfig?.defaults?.model ?? null,
    resolvedProvider: summary.provider,
    resolvedModel: summary.model,
    fallbackStub: summary.fallbackStub,
    conflictSummary: authDiagnostics.conflictSummary,
    nextPlaceToEdit: summary.nextPlaceToEdit,
  };
}

export function buildDoctorDiagnosticsBundle(
  checks: DoctorChecks,
  authDiagnostics: DoctorAuthDiagnostics,
  configDiagnostics: DoctorConfigDiagnostics,
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    modelSource: string;
    chosenByPrecedence: string;
    nextPlaceToEdit: string;
    fallbackStub: boolean;
    warnings: string[];
  }
): DoctorDiagnosticsBundle {
  return {
    checks,
    auth: authDiagnostics,
    config: configDiagnostics,
    resolution: summary,
  };
}

export function buildDoctorGuidance(
  recommendations: string[],
  actions: DoctorAction[]
): DoctorGuidance {
  return {
    recommendations,
    actions,
  };
}

export function printResolutionSection(summary: {
  provider: string | null;
  model: string | null;
  authSource: string;
  configSource: string;
  modelSource: string;
  chosenByPrecedence: string;
  nextPlaceToEdit: string;
  fallbackStub: boolean;
}): void {
  formatter.info("Resolution");
  formatter.step(`Resolved provider: ${summary.provider ?? "none"}`);
  formatter.step(`Resolved model: ${summary.model ?? "none"}`);
  formatter.step(`Model source: ${summary.modelSource}`);
  formatter.step(`Chosen by precedence: ${summary.chosenByPrecedence}`);
  formatter.step(`Fallback/stub: ${summary.fallbackStub ? "enabled" : "disabled"}`);
  formatter.step(`Next place to edit: ${summary.nextPlaceToEdit}`);
}

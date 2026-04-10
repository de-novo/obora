import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { listPiAIModels } from "@obora/adapters";
import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  loadConfig,
  resolveLLMConfig,
  type OboraConfig,
} from "@obora/sdk";
import { Command } from "commander";

import { handleCommandAction } from "../utils/error-handler.js";
import { formatter } from "../utils/formatter.js";
import { getGlobalOpts } from "../utils/global-opts.js";

interface DoctorOptions {
  json?: boolean;
  quiet?: boolean;
  verbose?: boolean;
}

interface DoctorChecks {
  node: boolean;
  projectConfigPath: string;
  projectConfig: boolean;
  globalConfigPath: string;
  globalConfig: boolean;
}

interface DoctorProviderHint {
  configuredProvider: string | null;
  recommendedProvider: string | null;
  recommendedAuthEnvKey: string | null;
}

interface ProviderSetupExamples {
  authExportExample: string | null;
  modelEnvExample: string | null;
  modelConfigExample: string | null;
  modelRecommendationReason: string | null;
}

interface DoctorAuthDiagnostics extends ProviderSetupExamples {
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
  setupGuide: string;
}

interface DoctorConfigDiagnostics {
  configSource: string;
  sourceChain: string[];
  globalConfigPath: string | null;
  projectConfigPath: string | null;
  activeConfigPath: string | null;
  nextPlaceToEdit: string;
}

interface DoctorOutputSections {
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

const AUTH_ENV_EXAMPLES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "ZAI_API_KEY"] as const;

const AUTH_SETUP_GUIDE = "docs/tutorials/06-llm-config-auth-quickstart.md";

const PROVIDER_MODEL_ENV_KEY_MAP: Record<string, string> = {
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

const PROVIDER_AUTH_ENV_KEY_MAP: Record<string, string> = {
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

const PROVIDER_DEFAULT_MODEL_MAP: Record<string, string> = {
  anthropic: "claude-opus-4-6",
  openai: "gpt-5.4",
  openrouter: "openai/gpt-5.4",
  zai: "glm-5",
};

interface RecommendedModelInfo {
  model: string;
  reason: string;
}

function buildGoogleModelRecommendationReason(model: string): string {
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

function buildModelRecommendationReason(provider: string, source: "catalog" | "fallback"): string {
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

function buildRecommendedModelInfo(provider: string): RecommendedModelInfo {
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

function selectOpenAILatestModel(models: string[]): string | undefined {
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

interface AnthropicModelScore {
  model: string;
  family: number;
  major: number;
  minor: number;
  stableAlias: boolean;
  snapshotDate: number;
}

function parseAnthropicModel(
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

function selectAnthropicLatestModel(models: string[]): string | undefined {
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

function selectZAILatestModel(models: string[]): string | undefined {
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

function selectGoogleLatestModel(models: string[]): string | undefined {
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

function selectOpenRouterLatestModel(models: string[]): string | undefined {
  const openaiModels = models.filter((model) => model.startsWith("openai/"));
  const selectedOpenAI = selectOpenAILatestModel(
    openaiModels.map((model) => model.replace(/^openai\//, ""))
  );
  return selectedOpenAI ? `openai/${selectedOpenAI}` : undefined;
}

function inferLatestCatalogModel(provider: string): string | undefined {
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

function inferAuthEnvKey(provider: string): string {
  return (
    PROVIDER_AUTH_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`
  );
}

function inferModelEnvKey(provider: string): string {
  return (
    PROVIDER_MODEL_ENV_KEY_MAP[provider] ??
    `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODEL`
  );
}

function buildProviderSetupExamples(provider: string | null): ProviderSetupExamples {
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

function detectAuthProviders(env: Record<string, string | undefined> = process.env): string[] {
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

function buildRecommendedProviderHint(
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

function buildAuthDiagnostics(
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
    modelRecommendationReason: setupExamples.modelRecommendationReason,
    resolvedModelRecommendationReason: resolvedSetupExamples.modelRecommendationReason,
    detectedProviders,
    providerMismatchWarning,
    setupGuide: AUTH_SETUP_GUIDE,
    ...setupExamples,
  };
}

function buildConfigDiagnostics(
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

function summarizeConfigChain(configDiagnostics: DoctorConfigDiagnostics): string | null {
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

function buildAuthExampleHint(summary: { authSource: string }): string | null {
  if (summary.authSource !== "none") {
    return null;
  }

  return `Examples: export ${AUTH_ENV_EXAMPLES[0]}=***  |  export ${AUTH_ENV_EXAMPLES[1]}=***  |  export ${AUTH_ENV_EXAMPLES[2]}=***`;
}

function buildConfiguredProviderHints(providerHint: DoctorProviderHint): string[] {
  if (!providerHint.recommendedProvider || !providerHint.recommendedAuthEnvKey) {
    return [];
  }

  const setupExamples = buildProviderSetupExamples(providerHint.recommendedProvider);

  return [
    `Configured default provider: ${providerHint.recommendedProvider}`,
    `Recommended auth: export ${providerHint.recommendedAuthEnvKey}=***`,
    ...(setupExamples.modelRecommendationReason
      ? [`Provider model recommendation basis: ${setupExamples.modelRecommendationReason}`]
      : []),
  ];
}

function buildResolvedProviderMismatchRecommendation(
  summary: { provider: string | null },
  providerHint: DoctorProviderHint
): string | null {
  if (!summary.provider || !providerHint.configuredProvider) {
    return null;
  }

  if (summary.provider === providerHint.configuredProvider) {
    return null;
  }

  return `Resolved provider does not match configured provider. Either export ${inferAuthEnvKey(providerHint.configuredProvider)}=*** or switch defaults.provider to ${summary.provider}`;
}

function buildProviderSpecificGuidance(
  summary: { authSource: string; provider: string | null; model: string | null },
  authDiagnostics: DoctorAuthDiagnostics
): string[] {
  const guidance: string[] = [];

  if (summary.authSource === "none" && authDiagnostics.authExportExample) {
    guidance.push(`Provider auth example: ${authDiagnostics.authExportExample}`);
  }

  if (summary.provider && !summary.model) {
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
    const modelConfigPrefix = useResolvedExamples
      ? "Resolved provider model config example"
      : "Provider model config example";
    const modelEnvPrefix = useResolvedExamples
      ? "Resolved provider model env example"
      : "Provider model env example";
    const modelReasonPrefix = useResolvedExamples
      ? "Resolved provider model recommendation basis"
      : "Provider model recommendation basis";

    if (modelConfigExample) {
      guidance.push(`${modelConfigPrefix}: ${modelConfigExample}`);
    }
    if (modelEnvExample) {
      guidance.push(`${modelEnvPrefix}: ${modelEnvExample}`);
    }
    if (modelRecommendationReason) {
      guidance.push(`${modelReasonPrefix}: ${modelRecommendationReason}`);
    }
  }

  return guidance;
}

function buildDoctorChecks(): DoctorChecks {
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

function buildDoctorStatus(summary: {
  provider: string | null;
  model: string | null;
  authSource: string;
  fallbackStub: boolean;
}): { status: "ready" | "needs_config" | "stub_mode"; message: string } {
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

function buildDoctorRecommendations(
  checks: DoctorChecks,
  summary: {
    provider: string | null;
    model: string | null;
    authSource: string;
    configSource: string;
    fallbackStub: boolean;
    warnings: string[];
  },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics
): string[] {
  const recommendations: string[] = [];

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
    if (authDiagnostics.providerMismatchWarning && providerHint.recommendedAuthEnvKey) {
      recommendations.push(
        `Detected env auth does not match configured provider. Either export ${providerHint.recommendedAuthEnvKey}=*** or switch defaults.provider to one of: ${authDiagnostics.detectedProviders.join(", ")}`
      );
    }
  }

  const resolvedProviderMismatchRecommendation = buildResolvedProviderMismatchRecommendation(
    summary,
    providerHint,
    authDiagnostics
  );
  if (resolvedProviderMismatchRecommendation) {
    recommendations.push(resolvedProviderMismatchRecommendation);
  }

  recommendations.push(...buildProviderSpecificGuidance(summary, authDiagnostics));

  if (summary.provider && !summary.model) {
    recommendations.push(
      `Set a default model in .obora/config.yaml or export ${inferModelEnvKey(summary.provider)}=***`
    );
  }

  if (summary.configSource === "none") {
    recommendations.push("Add provider/model defaults in .obora/config.yaml");
  }

  if (summary.fallbackStub) {
    recommendations.push("Preview before execution: obora run judge.yaml --dry-run");
  }

  if (recommendations.length === 0 && summary.warnings.length === 0) {
    recommendations.push("Run your workflow: obora run judge.yaml");
  }

  return recommendations;
}

function buildDoctorOutputSections(
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

function printResolutionSection(summary: {
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

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks = buildDoctorChecks();
  const loadedConfig = await loadConfig();
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);
  const summary = buildResolutionSummary({}, resolvedLLM, loadedConfig);
  const status = buildDoctorStatus(summary);
  const providerHint = buildRecommendedProviderHint(summary, loadedConfig);
  const authDiagnostics = buildAuthDiagnostics(providerHint, summary);
  const configDiagnostics = buildConfigDiagnostics(checks, summary);
  const recommendations = buildDoctorRecommendations(
    checks,
    summary,
    providerHint,
    authDiagnostics
  );
  const sections = buildDoctorOutputSections(
    checks,
    status,
    summary,
    loadedConfig,
    configDiagnostics,
    authDiagnostics,
    recommendations
  );

  if (options.json) {
    formatter.json({
      checks: {
        node: checks.node,
        projectConfig: checks.projectConfig,
        projectConfigPath: checks.projectConfigPath,
        globalConfig: checks.globalConfig,
        globalConfigPath: checks.globalConfigPath,
      },
      status,
      recommendations,
      resolution: summary,
      auth: authDiagnostics,
      config: configDiagnostics,
      sections,
      recommendedProvider: providerHint.recommendedProvider,
      recommendedAuthEnvKey: providerHint.recommendedAuthEnvKey,
    });
    return;
  }

  if (options.quiet) {
    return;
  }

  formatter.info("Obora doctor");

  formatter.info(sections.status.heading);
  formatter.step(sections.status.message);

  formatter.info(sections.configuration.heading);
  formatter.step(`Node.js: ${sections.configuration.node ? "available" : "missing"}`);
  formatter.step(
    `Project config (.obora/config.yaml): ${sections.configuration.projectConfig ? "found" : "missing"}`
  );
  formatter.step(
    `Global config (~/.obora/config.yaml): ${sections.configuration.globalConfig ? "found" : "missing"}`
  );
  if (sections.configuration.configuredProvider) {
    formatter.step(`Configured provider: ${sections.configuration.configuredProvider}`);
  }
  if (sections.configuration.configuredModel) {
    formatter.step(`Configured model: ${sections.configuration.configuredModel}`);
  }
  formatter.step(`Auth source: ${sections.configuration.authSource}`);
  formatter.step(`Config source: ${sections.configuration.configSource}`);
  if (sections.configuration.mergedSources) {
    formatter.step(`Merged sources: ${sections.configuration.mergedSources}`);
  }
  if (sections.configuration.activeConfigPath) {
    formatter.step(`Active config: ${sections.configuration.activeConfigPath}`);
  }

  printResolutionSection(summary);

  if (sections.warnings.items.length > 0) {
    formatter.info(sections.warnings.heading);
  }
  for (const warning of sections.warnings.items) {
    formatter.warn(warning);
  }

  formatter.info(sections.recommendedNextActions.heading);
  for (const recommendation of sections.recommendedNextActions.items) {
    formatter.step(recommendation);
  }

  formatter.info(`Next step: ${summary.nextPlaceToEdit}`);
}

export function createDoctorCommand(): Command {
  return new Command("doctor")
    .description("Diagnose local Obora setup and onboarding readiness")
    .action(async function (this: Command) {
      const globalOpts = getGlobalOpts(this);
      await handleCommandAction(
        async () => {
          await runDoctor(globalOpts);
        },
        { verbose: Boolean(globalOpts.verbose) }
      );
    });
}

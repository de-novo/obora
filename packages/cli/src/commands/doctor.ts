import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  buildResolutionSummary,
  detectLLMConfigFromEnv,
  formatResolutionSummary,
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
}

interface DoctorAuthDiagnostics extends ProviderSetupExamples {
  configuredProvider: string | null;
  recommendedProvider: string | null;
  recommendedAuthEnvKey: string | null;
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

const AUTH_ENV_EXAMPLES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ZAI_API_KEY",
] as const;

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
  anthropic: "claude-3-7-sonnet-latest",
  openai: "gpt-4o-mini",
  openrouter: "openai/gpt-4o-mini",
  zai: "glm-4.7",
};

function inferAuthEnvKey(provider: string): string {
  return PROVIDER_AUTH_ENV_KEY_MAP[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function inferModelEnvKey(provider: string): string {
  return PROVIDER_MODEL_ENV_KEY_MAP[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODEL`;
}

function inferDefaultModel(provider: string): string {
  return PROVIDER_DEFAULT_MODEL_MAP[provider] ?? "your-model-name";
}

function buildProviderSetupExamples(provider: string | null): ProviderSetupExamples {
  if (!provider) {
    return {
      authExportExample: null,
      modelEnvExample: null,
      modelConfigExample: null,
    };
  }

  const authEnvKey = inferAuthEnvKey(provider);
  const modelEnvKey = inferModelEnvKey(provider);
  const defaultModel = inferDefaultModel(provider);

  return {
    authExportExample: `export ${authEnvKey}=***`,
    modelEnvExample: `export ${modelEnvKey}=${defaultModel}`,
    modelConfigExample: `providers:
  ${provider}:
    defaultModel: ${defaultModel}`,
  };
}

function detectAuthProviders(env: NodeJS.ProcessEnv = process.env): string[] {
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
  loadedConfig?: OboraConfig,
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

function buildAuthDiagnostics(providerHint: DoctorProviderHint): DoctorAuthDiagnostics {
  const setupExamples = buildProviderSetupExamples(
    providerHint.recommendedProvider ?? providerHint.configuredProvider,
  );
  const detectedProviders = detectAuthProviders();
  const providerMismatchWarning =
    providerHint.configuredProvider &&
    detectedProviders.length > 0 &&
    !detectedProviders.includes(providerHint.configuredProvider)
      ? `Configured provider '${providerHint.configuredProvider}' differs from detected env auth providers: ${detectedProviders.join(', ')}`
      : null;

  return {
    configuredProvider: providerHint.configuredProvider,
    recommendedProvider: providerHint.recommendedProvider,
    recommendedAuthEnvKey: providerHint.recommendedAuthEnvKey,
    detectedProviders,
    providerMismatchWarning,
    setupGuide: AUTH_SETUP_GUIDE,
    ...setupExamples,
  };
}

function buildConfigDiagnostics(
  checks: DoctorChecks,
  summary: { configSource: string; nextPlaceToEdit: string },
): DoctorConfigDiagnostics {
  const sourceChain = summary.configSource === "none"
    ? []
    : summary.configSource.split(" -> ").map((part) => part.trim()).filter(Boolean);

  const globalConfigPath = sourceChain.find((path) => path === checks.globalConfigPath) ?? null;
  const activeConfigPath = sourceChain.at(-1) ?? null;
  const projectConfigPath =
    sourceChain.find((path) => path !== globalConfigPath && path.endsWith('/.obora/config.yaml'))
    ?? (activeConfigPath !== globalConfigPath ? activeConfigPath : null);

  return {
    configSource: summary.configSource,
    sourceChain,
    globalConfigPath,
    projectConfigPath,
    activeConfigPath,
    nextPlaceToEdit: summary.nextPlaceToEdit,
  };
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

  return [
    `Configured default provider: ${providerHint.recommendedProvider}`,
    `Recommended auth: export ${providerHint.recommendedAuthEnvKey}=***`,
  ];
}

function buildResolvedProviderMismatchRecommendation(
  summary: { provider: string | null },
  providerHint: DoctorProviderHint,
  authDiagnostics: DoctorAuthDiagnostics,
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
  authDiagnostics: DoctorAuthDiagnostics,
): string[] {
  const guidance: string[] = [];

  if (summary.authSource === "none" && authDiagnostics.authExportExample) {
    guidance.push(`Provider auth example: ${authDiagnostics.authExportExample}`);
  }

  if (summary.provider && !summary.model) {
    if (authDiagnostics.modelConfigExample) {
      guidance.push(`Provider model config example: ${authDiagnostics.modelConfigExample}`);
    }
    if (authDiagnostics.modelEnvExample) {
      guidance.push(`Provider model env example: ${authDiagnostics.modelEnvExample}`);
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
  authDiagnostics: DoctorAuthDiagnostics,
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
        `Detected env auth does not match configured provider. Either export ${providerHint.recommendedAuthEnvKey}=*** or switch defaults.provider to one of: ${authDiagnostics.detectedProviders.join(', ')}`,
      );
    }
  }

  const resolvedProviderMismatchRecommendation = buildResolvedProviderMismatchRecommendation(
    summary,
    providerHint,
    authDiagnostics,
  );
  if (resolvedProviderMismatchRecommendation) {
    recommendations.push(resolvedProviderMismatchRecommendation);
  }

  recommendations.push(...buildProviderSpecificGuidance(summary, authDiagnostics));

  if (summary.provider && !summary.model) {
    recommendations.push(
      `Set a default model in .obora/config.yaml or export ${inferModelEnvKey(summary.provider)}=***`,
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

export async function runDoctor(options: DoctorOptions): Promise<void> {
  const checks = buildDoctorChecks();
  const loadedConfig = await loadConfig();
  const envLLM = detectLLMConfigFromEnv();
  const resolvedLLM = resolveLLMConfig(envLLM, loadedConfig);
  const summary = buildResolutionSummary({}, resolvedLLM, loadedConfig);
  const status = buildDoctorStatus(summary);
  const providerHint = buildRecommendedProviderHint(summary, loadedConfig);
  const authDiagnostics = buildAuthDiagnostics(providerHint);
  const configDiagnostics = buildConfigDiagnostics(checks, summary);
  const recommendations = buildDoctorRecommendations(checks, summary, providerHint, authDiagnostics);

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
      recommendedProvider: providerHint.recommendedProvider,
      recommendedAuthEnvKey: providerHint.recommendedAuthEnvKey,
    });
    return;
  }

  if (options.quiet) {
    return;
  }

  formatter.info("Obora doctor");
  formatter.step(`Status: ${status.message}`);
  formatter.step(`Node.js: ${checks.node ? "available" : "missing"}`);
  formatter.step(`Project config (.obora/config.yaml): ${checks.projectConfig ? "found" : "missing"}`);
  formatter.step(`Global config (~/.obora/config.yaml): ${checks.globalConfig ? "found" : "missing"}`);
  formatter.step(`Auth source: ${summary.authSource}`);
  formatter.step(`Config source: ${summary.configSource}`);
  formatter.step(`Fallback/stub: ${summary.fallbackStub ? "enabled" : "disabled"}`);

  formatter.info(formatResolutionSummary(summary));

  for (const warning of summary.warnings) {
    formatter.warn(warning);
  }
  if (authDiagnostics.providerMismatchWarning) {
    formatter.warn(authDiagnostics.providerMismatchWarning);
  }

  formatter.info("Recommended next actions:");
  for (const recommendation of recommendations) {
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
        { verbose: Boolean(globalOpts.verbose) },
      );
    });
}

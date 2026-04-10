import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { OboraConfig } from "./config-loader.js";
import { resolveProviderConfig } from "./config-loader.js";
import { detectLLMConfigFromEnv, type LLMConfig } from "./llm-config.js";
import type { OboraRuntimeConfig } from "./runtime-types.js";

const CONFIG_META_KEY = Symbol.for("obora.config.meta");

const PROVIDER_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  "openai-codex": "OPENAI_API_KEY",
  zai: "ZAI_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  minimax: "MINIMAX_API_KEY",
  "minimax-cn": "MINIMAX_CN_API_KEY",
  mistral: "MISTRAL_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  opencode: "OPENCODE_API_KEY",
  "kimi-coding": "KIMI_CODING_API_KEY",
  "github-copilot": "GITHUB_COPILOT_API_KEY",
  "vercel-ai-gateway": "VERCEL_AI_GATEWAY_API_KEY",
};

type ConfigWithMeta = OboraConfig & {
  [CONFIG_META_KEY]?: { sources?: string[] };
};

const PROVIDER_MODEL_ENV_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
  "openai-codex": "OPENAI_MODEL",
  zai: "ZAI_MODEL",
  google: "GOOGLE_MODEL",
  xai: "XAI_MODEL",
  groq: "GROQ_MODEL",
  cerebras: "CEREBRAS_MODEL",
  openrouter: "OPENROUTER_MODEL",
  minimax: "MINIMAX_MODEL",
  "minimax-cn": "MINIMAX_CN_MODEL",
  mistral: "MISTRAL_MODEL",
  huggingface: "HUGGINGFACE_MODEL",
  opencode: "OPENCODE_MODEL",
  "kimi-coding": "KIMI_CODING_MODEL",
  "github-copilot": "GITHUB_COPILOT_MODEL",
  "vercel-ai-gateway": "VERCEL_AI_GATEWAY_MODEL",
};

export interface BindingPreviewEntry {
  stepName: string;
  bindingName: string;
  path: string;
  kind: string;
  resolved: boolean;
  required: boolean;
}

export interface OutputPreviewEntry {
  stepName: string;
  path?: string;
  schema?: string;
  pathResolved?: boolean;
  schemaResolved?: boolean;
}

export interface ResolutionSummary {
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

function getAuthEnvKey(provider: string): string {
  if (process.env.OBORA_LLM_PROVIDER === provider) {
    return "OBORA_LLM_API_KEY";
  }
  return PROVIDER_ENV_KEY_MAP[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

function getModelEnvKey(provider: string): string {
  if (process.env.OBORA_LLM_PROVIDER === provider) {
    return "OBORA_LLM_MODEL";
  }
  return PROVIDER_MODEL_ENV_KEY_MAP[provider] ?? `${provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_MODEL`;
}

function isSameLLMConfig(left: LLMConfig | undefined, right: LLMConfig | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.provider === right.provider
    && left.apiKey === right.apiKey
    && left.model === right.model
    && left.baseUrl === right.baseUrl
  );
}

function inferResolvedSource(
  runtimeConfig: OboraRuntimeConfig,
  config: OboraConfig | undefined,
  llmConfig: LLMConfig | undefined,
): "none" | "runtime" | "env" | "config" | "unknown" {
  if (!llmConfig) return "none";
  if (isSameLLMConfig(runtimeConfig.llm, llmConfig)) return "runtime";
  if (isSameLLMConfig(detectLLMConfigFromEnv(), llmConfig)) return "env";
  if (config && isSameLLMConfig(resolveProviderConfig(config, llmConfig.provider), llmConfig)) return "config";
  return "unknown";
}

function inferConfigSource(config?: OboraConfig): string {
  const sources = (config as ConfigWithMeta | undefined)?.[CONFIG_META_KEY]?.sources ?? [];
  if (sources.length === 0) return "none";
  return sources.join(" -> ");
}

function inferAuthSource(runtimeConfig: OboraRuntimeConfig, llmConfig: LLMConfig | undefined, config?: OboraConfig): string {
  if (!llmConfig) return "none";
  const resolvedSource = inferResolvedSource(runtimeConfig, config, llmConfig);
  if (resolvedSource === "runtime") return "runtime.llm";
  if (resolvedSource === "env") return `env(${getAuthEnvKey(llmConfig.provider)})`;
  const providerConfig = config?.providers?.[llmConfig.provider];
  if (providerConfig?.authRef) return `authRef(${providerConfig.authRef})`;
  const envKey = getAuthEnvKey(llmConfig.provider);
  if (process.env[envKey]) return `env(${envKey})`;
  return "direct/unknown";
}


function inferChosenByPrecedence(
  runtimeConfig: OboraRuntimeConfig,
  config?: OboraConfig,
  llmConfig?: LLMConfig
): string {
  if (!llmConfig) return "none";
  const authSource = inferAuthSource(runtimeConfig, llmConfig, config);
  const modelSource = inferModelSource(runtimeConfig, config, llmConfig);
  const resolvedSource = inferResolvedSource(runtimeConfig, config, llmConfig);

  if (authSource === "runtime.llm" && modelSource.startsWith("config")) {
    return "runtime.llm(auth) + config(model)";
  }
  if (authSource.startsWith("env(") && modelSource.startsWith("config")) {
    return "env(auth) + config(model)";
  }
  if (resolvedSource === "runtime") return "runtime.llm > config > env";
  if (resolvedSource === "env") return "env > config";
  if (resolvedSource === "config") return "config > env";
  if (config) return "config > env";
  return "env fallback";
}

function inferNextPlaceToEdit(runtimeConfig: OboraRuntimeConfig, config?: OboraConfig): string {
  if (runtimeConfig.llm) return "runtime llm config";
  const sources = (config as ConfigWithMeta | undefined)?.[CONFIG_META_KEY]?.sources ?? [];
  if (sources.length > 0) return sources[sources.length - 1] ?? ".obora/config.yaml";
  return ".obora/config.yaml (or set env key for first-time setup)";
}

function inferModelSource(runtimeConfig: OboraRuntimeConfig, config?: OboraConfig, llmConfig?: LLMConfig): string {
  if (!llmConfig?.model) return "none";
  const resolvedSource = inferResolvedSource(runtimeConfig, config, llmConfig);
  if (resolvedSource === "runtime" && runtimeConfig.llm?.model === llmConfig.model) return "runtime.llm";
  if (resolvedSource === "env" && process.env[getModelEnvKey(llmConfig.provider)] === llmConfig.model) {
    return `env(${getModelEnvKey(llmConfig.provider)})`;
  }
  const providerConfig = config?.providers?.[llmConfig.provider];
  if (providerConfig?.defaultModel === llmConfig.model) return `provider(${llmConfig.provider}).defaultModel`;
  if (config?.defaults?.model === llmConfig.model) return "config.defaults.model";
  const envKey = getModelEnvKey(llmConfig.provider);
  if (process.env[envKey] === llmConfig.model) return `env(${envKey})`;
  return "resolved/unknown";
}

export function buildResolutionSummary(runtimeConfig: OboraRuntimeConfig, llmConfig: LLMConfig | undefined, loadedConfig?: OboraConfig): ResolutionSummary {
  const warnings: string[] = [];
  const fallbackStub = !llmConfig;
  if (fallbackStub) warnings.push("No LLM resolved; execution will run in stub mode");

  return {
    provider: llmConfig?.provider ?? null,
    model: llmConfig?.model ?? null,
    authSource: inferAuthSource(runtimeConfig, llmConfig, loadedConfig),
    configSource: inferConfigSource(loadedConfig),
    modelSource: inferModelSource(runtimeConfig, loadedConfig, llmConfig),
    chosenByPrecedence: inferChosenByPrecedence(runtimeConfig, loadedConfig, llmConfig),
    nextPlaceToEdit: inferNextPlaceToEdit(runtimeConfig, loadedConfig),
    fallbackStub,
    warnings,
  };
}

export function formatResolutionSummary(summary: ResolutionSummary): string {
  const lines = [
    "Execution Resolution",
    `- provider: ${summary.provider ?? "none"}`,
    `- model: ${summary.model ?? "none"}`,
    `- auth source: ${summary.authSource}`,
    `- config source: ${summary.configSource}`,
    `- model source: ${summary.modelSource}`,
    `- chosen by precedence: ${summary.chosenByPrecedence}`,
    `- next place to edit: ${summary.nextPlaceToEdit}`,
    `- fallback/stub: ${summary.fallbackStub ? "enabled" : "disabled"}`,
  ];
  if (summary.warnings.length === 0) {
    lines.push("- warnings: none");
  } else {
    lines.push(`- warnings: ${summary.warnings.join("; ")}`);
  }
  return lines.join("\n");
}

type PreviewStep = {
  name: string;
  input?: Record<string, unknown>;
  output?: { path?: string; schema?: string };
  config?: Record<string, unknown>;
};

function getJudgePreviewConfig(step: PreviewStep): Record<string, unknown> | undefined {
  const config = step.config;
  if (!config || typeof config !== "object") return undefined;
  const judge = (config as Record<string, unknown>).judge;
  return judge && typeof judge === "object" ? (judge as Record<string, unknown>) : undefined;
}

function isResolvedPath(rootDir: string, path: string): boolean {
  return existsSync(resolve(rootDir, path));
}

export function buildBindingPreview(workflow?: { steps?: PreviewStep[] }, rootDir = process.cwd()): BindingPreviewEntry[] {
  const entries: BindingPreviewEntry[] = [];
  for (const step of workflow?.steps ?? []) {
    const input = step.input;
    const bindings = input && typeof input === "object" ? (input as Record<string, unknown>).bindings : undefined;
    if (bindings && typeof bindings === "object") {
      for (const [bindingName, rawBinding] of Object.entries(bindings as Record<string, unknown>)) {
        if (!rawBinding || typeof rawBinding !== "object") continue;
        const binding = rawBinding as Record<string, unknown>;
        const path = typeof binding.path === "string" ? binding.path : undefined;
        if (!path) continue;
        const kind = typeof binding.kind === "string" ? binding.kind : "text";
        const required = binding.required !== false;
        entries.push({
          stepName: step.name,
          bindingName,
          path,
          kind,
          required,
          resolved: isResolvedPath(rootDir, path),
        });
      }
    }

    const judgeConfig = getJudgePreviewConfig(step);
    const inputJson = typeof judgeConfig?.input_json === "string" ? judgeConfig.input_json : undefined;
    if (inputJson) {
      entries.push({
        stepName: step.name,
        bindingName: "input",
        path: inputJson,
        kind: "json",
        required: true,
        resolved: isResolvedPath(rootDir, inputJson),
      });
    }
    const inputSchema = typeof judgeConfig?.input_schema === "string" ? judgeConfig.input_schema : undefined;
    if (inputSchema) {
      entries.push({
        stepName: step.name,
        bindingName: "schema",
        path: inputSchema,
        kind: "schema",
        required: true,
        resolved: isResolvedPath(rootDir, inputSchema),
      });
    }
  }
  return entries;
}

export function formatBindingPreview(entries: BindingPreviewEntry[]): string {
  if (entries.length === 0) return "";
  const lines = ["Binding Preview"];
  for (const entry of entries) {
    lines.push(
      `- ${entry.stepName}.${entry.bindingName}: ${entry.kind} <- ${entry.path} [${entry.resolved ? "resolved" : entry.required ? "missing" : "optional-missing"}]`
    );
  }
  return lines.join("\n");
}

export function buildOutputPreview(workflow?: { steps?: PreviewStep[] }, rootDir = process.cwd()): OutputPreviewEntry[] {
  const entries: OutputPreviewEntry[] = [];
  for (const step of workflow?.steps ?? []) {
    const output = step.output;
    const judgeConfig = getJudgePreviewConfig(step);
    const path = typeof output?.path === "string"
      ? output.path
      : typeof judgeConfig?.output_path === "string"
        ? judgeConfig.output_path
        : undefined;
    const schema = typeof output?.schema === "string"
      ? output.schema
      : typeof judgeConfig?.output_schema === "string"
        ? judgeConfig.output_schema
        : undefined;
    if (!path && !schema) continue;
    entries.push({
      stepName: step.name,
      path,
      schema,
      pathResolved: path ? isResolvedPath(rootDir, path) : undefined,
      schemaResolved: schema ? isResolvedPath(rootDir, schema) : undefined,
    });
  }
  return entries;
}

export function formatOutputPreview(entries: OutputPreviewEntry[]): string {
  if (entries.length === 0) return "";
  const lines = ["Output Preview"];
  for (const entry of entries) {
    const details: string[] = [];
    if (entry.path) {
      details.push(`path <- ${entry.path} [${entry.pathResolved ? "resolved" : "pending"}]`);
    }
    if (entry.schema) {
      details.push(`schema <- ${entry.schema} [${entry.schemaResolved ? "resolved" : "missing"}]`);
    }
    lines.push(`- ${entry.stepName}: ${details.join('; ')}`);
  }
  return lines.join("\n");
}

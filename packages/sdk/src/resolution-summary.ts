import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { OboraConfig } from "./config-loader.js";
import type { LLMConfig } from "./llm-config.js";
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

function inferConfigSource(config?: OboraConfig): string {
  const sources = (config as ConfigWithMeta | undefined)?.[CONFIG_META_KEY]?.sources ?? [];
  if (sources.length === 0) return "none";
  return sources.join(" -> ");
}

function inferAuthSource(llmConfig: LLMConfig | undefined, config?: OboraConfig): string {
  if (!llmConfig) return "none";
  const providerConfig = config?.providers?.[llmConfig.provider];
  if (providerConfig?.authRef) return `authRef(${providerConfig.authRef})`;
  const envKey = PROVIDER_ENV_KEY_MAP[llmConfig.provider] ?? `${llmConfig.provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
  if (process.env[envKey]) return `env(${envKey})`;
  return "direct/unknown";
}


function inferChosenByPrecedence(runtimeConfig: OboraRuntimeConfig, config?: OboraConfig, llmConfig?: LLMConfig): string {
  if (!llmConfig) return "none";
  if (runtimeConfig.llm) return "runtime.llm > config > env";
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
  if (runtimeConfig.llm?.model) return "runtime.llm";
  const providerConfig = config?.providers?.[llmConfig.provider];
  if (providerConfig?.defaultModel === llmConfig.model) return `provider(${llmConfig.provider}).defaultModel`;
  if (config?.defaults?.model === llmConfig.model) return "config.defaults.model";
  const envKey = "OBORA_LLM_MODEL";
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
    authSource: inferAuthSource(llmConfig, loadedConfig),
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

export function buildBindingPreview(workflow?: { steps?: Array<{ name: string; input?: Record<string, unknown> }> }, rootDir = process.cwd()): BindingPreviewEntry[] {
  const entries: BindingPreviewEntry[] = [];
  for (const step of workflow?.steps ?? []) {
    const input = step.input;
    const bindings = input && typeof input === "object" ? (input as Record<string, unknown>).bindings : undefined;
    if (!bindings || typeof bindings !== "object") continue;
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
        resolved: existsSync(resolve(rootDir, path)),
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

export function buildOutputPreview(workflow?: { steps?: Array<{ name: string; output?: { path?: string; schema?: string } }> }, rootDir = process.cwd()): OutputPreviewEntry[] {
  const entries: OutputPreviewEntry[] = [];
  for (const step of workflow?.steps ?? []) {
    const output = step.output;
    if (!output || typeof output !== "object") continue;
    const path = typeof output.path === "string" ? output.path : undefined;
    const schema = typeof output.schema === "string" ? output.schema : undefined;
    if (!path && !schema) continue;
    entries.push({
      stepName: step.name,
      path,
      schema,
      pathResolved: path ? existsSync(resolve(rootDir, path)) : undefined,
      schemaResolved: schema ? existsSync(resolve(rootDir, schema)) : undefined,
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

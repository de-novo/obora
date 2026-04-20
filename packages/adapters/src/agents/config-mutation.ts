import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

import YAML from "yaml";

import { getGlobalConfigPath, getProjectConfigPath, validateConfig } from "../config/loader";
import type {
  AgentConfig,
  AgentConfigFile,
  AgentMutationAction,
  AgentMutationScope,
  AgentOverridePreview,
} from "../config/types";
import { isSupportedProvider } from "../llm/factory";
import { listPiAIModels } from "../llm/pi-ai-adapter";

export interface PreviewAgentOverrideInput {
  action: AgentMutationAction;
  scope?: string;
  cwd?: string;
  agentName: string;
  provider?: string;
  model?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeScope(scope?: string): AgentMutationScope {
  if (!scope || scope === "project") {
    return "project";
  }

  if (scope === "global") {
    return "global";
  }

  throw new Error(`Invalid agents scope: ${scope}. Supported scopes: project, global`);
}

async function readConfigDocument(targetPath: string): Promise<Record<string, unknown>> {
  if (!existsSync(targetPath)) {
    return {};
  }

  const rawText = await readFile(targetPath, "utf-8");
  if (!rawText.trim()) {
    return {};
  }

  const parsed = YAML.parse(rawText) as unknown;
  if (parsed === null || parsed === undefined) {
    return {};
  }

  if (!isObject(parsed)) {
    throw new Error(`Invalid config at ${targetPath}: root must be an object`);
  }

  return parsed;
}

function getCurrentAgentConfig(
  validatedConfig: AgentConfigFile,
  agentName: string
): Partial<AgentConfig> | null {
  return validatedConfig.agents?.[agentName] ?? null;
}

function validateSetTarget(provider: string | undefined, model: string | undefined): void {
  if (!provider || !model) {
    throw new Error("Agent override preview requires both provider and model");
  }

  if (!isSupportedProvider(provider)) {
    throw new Error(`Unsupported agent provider override: ${provider}`);
  }

  let availableModels: string[] = [];
  try {
    availableModels = listPiAIModels(provider);
  } catch {
    availableModels = [];
  }

  if (!availableModels.includes(model)) {
    throw new Error(`Unsupported agent model override for provider ${provider}: ${model}`);
  }
}

function buildNextConfigDocument(input: {
  document: Record<string, unknown>;
  action: AgentMutationAction;
  agentName: string;
  provider?: string;
  model?: string;
}): Record<string, unknown> {
  const nextDocument = { ...input.document };
  const agents = isObject(input.document.agents)
    ? { ...(input.document.agents as Record<string, unknown>) }
    : {};

  if (input.action === "set") {
    const existingAgent = isObject(agents[input.agentName])
      ? { ...(agents[input.agentName] as Record<string, unknown>) }
      : {};

    agents[input.agentName] = {
      ...existingAgent,
      provider: input.provider,
      model: input.model,
    };
    nextDocument.agents = agents;
    return nextDocument;
  }

  delete agents[input.agentName];

  if (Object.keys(agents).length === 0) {
    delete nextDocument.agents;
    return nextDocument;
  }

  nextDocument.agents = agents;
  return nextDocument;
}

export async function previewAgentOverride(
  input: PreviewAgentOverrideInput
): Promise<AgentOverridePreview> {
  const scope = normalizeScope(input.scope);
  const cwd = input.cwd ?? process.cwd();
  const targetPath = scope === "global" ? getGlobalConfigPath() : getProjectConfigPath(cwd);
  const document = await readConfigDocument(targetPath);
  const validatedConfig = validateConfig(targetPath, document);

  if (input.action === "set") {
    validateSetTarget(input.provider, input.model);
  }

  const nextConfigDocument = buildNextConfigDocument({
    document,
    action: input.action,
    agentName: input.agentName,
    provider: input.provider,
    model: input.model,
  });
  const nextValidatedConfig = validateConfig(targetPath, nextConfigDocument);

  return {
    action: input.action,
    scope,
    agentName: input.agentName,
    targetPath,
    before: getCurrentAgentConfig(validatedConfig, input.agentName),
    after:
      input.action === "reset" ? null : getCurrentAgentConfig(nextValidatedConfig, input.agentName),
    warnings: [],
    nextConfigDocument,
    nextYaml: YAML.stringify(nextConfigDocument),
  };
}

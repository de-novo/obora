import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

interface AgentOverrideWriteDeps {
  mkdir: (path: string, options: { recursive: true }) => Promise<unknown>;
  writeFile: (path: string, data: string, encoding: "utf-8") => Promise<unknown>;
  rename: (oldPath: string, newPath: string) => Promise<void>;
  rm: (path: string, options?: { force?: boolean }) => Promise<void>;
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

function resolveSetTarget(
  currentAgentConfig: Partial<AgentConfig> | null,
  provider: string | undefined,
  model: string | undefined
): { provider: string; model: string } {
  if (!provider && !model) {
    throw new Error("Agent override preview requires at least one of provider or model");
  }

  const resolvedProvider = provider ?? currentAgentConfig?.provider;
  if (!resolvedProvider) {
    throw new Error(
      "Model-only override requires an existing provider in target config; pass --provider explicitly"
    );
  }

  const resolvedModel = model ?? currentAgentConfig?.model;
  if (!resolvedModel) {
    throw new Error(
      "Provider-only override requires an existing model in target config; pass --model explicitly"
    );
  }

  if (!isSupportedProvider(resolvedProvider)) {
    throw new Error(`Unsupported agent provider override: ${resolvedProvider}`);
  }

  let availableModels: string[] = [];
  try {
    availableModels = listPiAIModels(resolvedProvider);
  } catch {
    availableModels = [];
  }

  if (!availableModels.includes(resolvedModel)) {
    throw new Error(
      `Unsupported agent model override for provider ${resolvedProvider}: ${resolvedModel}`
    );
  }

  return {
    provider: resolvedProvider,
    model: resolvedModel,
  };
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
  const currentAgentConfig = getCurrentAgentConfig(validatedConfig, input.agentName);
  const resolvedSetTarget =
    input.action === "set"
      ? resolveSetTarget(currentAgentConfig, input.provider, input.model)
      : undefined;

  const nextConfigDocument = buildNextConfigDocument({
    document,
    action: input.action,
    agentName: input.agentName,
    provider: resolvedSetTarget?.provider,
    model: resolvedSetTarget?.model,
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

export async function applyAgentOverride(
  input: PreviewAgentOverrideInput,
  deps: Partial<AgentOverrideWriteDeps> = {}
): Promise<AgentOverridePreview> {
  const preview = await previewAgentOverride(input);
  const writeDeps: AgentOverrideWriteDeps = {
    mkdir: deps.mkdir ?? mkdir,
    writeFile: deps.writeFile ?? writeFile,
    rename:
      deps.rename ??
      (async (oldPath: string, newPath: string) => {
        const module = (await import("node:fs/promises")) as {
          rename?: (oldPath: string, newPath: string) => Promise<void>;
        };
        if (typeof module.rename !== "function") {
          throw new Error("rename is not available");
        }
        await module.rename(oldPath, newPath);
      }),
    rm:
      deps.rm ??
      (async (path: string, options?: { force?: boolean }) => {
        const module = (await import("node:fs/promises")) as {
          rm?: (path: string, options?: { force?: boolean }) => Promise<void>;
        };
        if (typeof module.rm !== "function") {
          return;
        }
        await module.rm(path, options);
      }),
  };
  const tempPath = `${preview.targetPath}.tmp`;

  try {
    await writeDeps.mkdir(dirname(preview.targetPath), { recursive: true });
    await writeDeps.writeFile(tempPath, preview.nextYaml, "utf-8");
    await writeDeps.rename(tempPath, preview.targetPath);
    return preview;
  } catch (error) {
    await writeDeps.rm(tempPath, { force: true }).catch(() => undefined);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write agent override: ${message}`);
  }
}

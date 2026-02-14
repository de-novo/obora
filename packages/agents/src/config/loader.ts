import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import YAML from "yaml";

import type { AgentConfig, AgentConfigFile, AgentModelConfig, ProviderConfig } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(value: unknown, field: string, filePath: string): void {
  if (value !== undefined && typeof value !== "string") {
    throw new Error(`Invalid config at ${filePath}: ${field} must be a string`);
  }
}

function assertNumber(value: unknown, field: string, filePath: string): void {
  if (value !== undefined && typeof value !== "number") {
    throw new Error(`Invalid config at ${filePath}: ${field} must be a number`);
  }
}

function compactObject<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as T;
}

function validateProvider(provider: unknown, fieldPrefix: string, filePath: string): ProviderConfig {
  if (!isObject(provider)) {
    throw new Error(`Invalid config at ${filePath}: ${fieldPrefix} must be an object`);
  }

  assertString(provider.baseUrl, `${fieldPrefix}.baseUrl`, filePath);
  assertString(provider.defaultModel, `${fieldPrefix}.defaultModel`, filePath);
  assertNumber(provider.timeout, `${fieldPrefix}.timeout`, filePath);
  assertNumber(provider.maxTokens, `${fieldPrefix}.maxTokens`, filePath);

  return compactObject({
    baseUrl: provider.baseUrl as string | undefined,
    defaultModel: provider.defaultModel as string | undefined,
    timeout: provider.timeout as number | undefined,
    maxTokens: provider.maxTokens as number | undefined,
  }) as ProviderConfig;
}

function validateReviewModels(
  value: unknown,
  fieldPrefix: string,
  filePath: string
): AgentModelConfig[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`Invalid config at ${filePath}: ${fieldPrefix} must be an array`);
  }

  return value.map((item, index) => {
    const itemField = `${fieldPrefix}[${index}]`;
    if (!isObject(item)) {
      throw new Error(`Invalid config at ${filePath}: ${itemField} must be an object`);
    }

    assertString(item.name, `${itemField}.name`, filePath);
    assertString(item.provider, `${itemField}.provider`, filePath);
    assertString(item.model, `${itemField}.model`, filePath);

    if (!item.provider || !item.model) {
      throw new Error(`Invalid config at ${filePath}: ${itemField}.provider and ${itemField}.model are required`);
    }

    return compactObject({
      name: item.name as string | undefined,
      provider: item.provider as string,
      model: item.model as string,
    }) as AgentModelConfig;
  });
}

function validateAgent(agent: unknown, fieldPrefix: string, filePath: string): Partial<AgentConfig> {
  if (!isObject(agent)) {
    throw new Error(`Invalid config at ${filePath}: ${fieldPrefix} must be an object`);
  }

  assertString(agent.provider, `${fieldPrefix}.provider`, filePath);
  assertString(agent.model, `${fieldPrefix}.model`, filePath);
  assertString(agent.systemPrompt, `${fieldPrefix}.systemPrompt`, filePath);
  assertString(agent.baseUrl, `${fieldPrefix}.baseUrl`, filePath);
  assertNumber(agent.temperature, `${fieldPrefix}.temperature`, filePath);
  assertNumber(agent.maxTokens, `${fieldPrefix}.maxTokens`, filePath);
  assertNumber(agent.timeout, `${fieldPrefix}.timeout`, filePath);
  const reviewModels = validateReviewModels(agent.reviewModels, `${fieldPrefix}.reviewModels`, filePath);

  return compactObject({
    provider: agent.provider as string | undefined,
    model: agent.model as string | undefined,
    temperature: agent.temperature as number | undefined,
    maxTokens: agent.maxTokens as number | undefined,
    timeout: agent.timeout as number | undefined,
    systemPrompt: agent.systemPrompt as string | undefined,
    baseUrl: agent.baseUrl as string | undefined,
    reviewModels,
  }) as Partial<AgentConfig>;
}

export function validateConfig(filePath: string, raw: unknown): AgentConfigFile {
  if (!isObject(raw)) {
    throw new Error(`Invalid config at ${filePath}: root must be an object`);
  }

  const defaults = raw.defaults ? validateAgent(raw.defaults, "defaults", filePath) : undefined;

  const providers = raw.providers
    ? Object.fromEntries(
        Object.entries(raw.providers as Record<string, unknown>).map(([name, provider]) => [
          name,
          validateProvider(provider, `providers.${name}`, filePath),
        ])
      )
    : undefined;

  const agents = raw.agents
    ? Object.fromEntries(
        Object.entries(raw.agents as Record<string, unknown>).map(([name, agent]) => [
          name,
          validateAgent(agent, `agents.${name}`, filePath),
        ])
      )
    : undefined;

  return { defaults, providers, agents };
}

export function getGlobalConfigPath(): string {
  const homeDir = process.env.HOME ?? os.homedir();
  return path.join(homeDir, ".obora", "config.yaml");
}

export function getProjectConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".obora", "config.yaml");
}

export async function loadConfigFile(filePath: string): Promise<AgentConfigFile> {
  if (!existsSync(filePath)) {
    return {};
  }

  const rawText = await readFile(filePath, "utf-8");
  if (!rawText.trim()) {
    return {};
  }

  const parsed = YAML.parse(rawText) as unknown;
  if (parsed === null || parsed === undefined) {
    return {};
  }

  return validateConfig(filePath, parsed);
}

import { join } from "node:path";
import { mkdir, readdir } from "node:fs/promises";
import type { OboraConfig } from "../runtime-types.js";
import { fileExists, readYamlFile, writeYamlFile } from "./yaml-utils.js";

export interface AgentDefinition {
  name: string;
  role?: string;
  description?: string;
  provider?: string;
  model?: string;
  temperature?: number;
  prompt?: string;
}

export interface AgentsFile {
  agents?: Record<string, Partial<AgentDefinition>>;
}

const AGENTS_DIR_NAME = "agents";
const AGENTS_FILE_NAME = "agents.yaml";

export async function findAgentsFile(projectDir: string): Promise<string | undefined> {
  const candidates = [
    join(projectDir, AGENTS_FILE_NAME),
    join(projectDir, ".obora", AGENTS_FILE_NAME),
  ];

  const found = await Promise.all(
    candidates.map(async (candidate) => ({
      candidate,
      exists: await fileExists(candidate),
    }))
  );

  return found.find((r) => r.exists)?.candidate;
}

export async function findAgentFile(projectDir: string, name: string): Promise<string | undefined> {
  const agentsDir = join(projectDir, AGENTS_DIR_NAME);
  if (await fileExists(agentsDir)) {
    const filePath = join(agentsDir, `${name}.yaml`);
    if (await fileExists(filePath)) {
      return filePath;
    }
  }
  return undefined;
}

export async function readAgents(projectDir: string): Promise<AgentDefinition[]> {
  const agents: AgentDefinition[] = [];

  // Read from agents.yaml (legacy format)
  const agentsFile = await findAgentsFile(projectDir);
  if (agentsFile) {
    const data = await readYamlFile<AgentsFile>(agentsFile);
    if (data?.agents) {
      agents.push(
        ...Object.entries(data.agents).map(([name, def]) => ({
          name,
          ...def,
        }))
      );
    }
  }

  // Read from agents/ directory (new per-file format)
  const agentsDir = join(projectDir, AGENTS_DIR_NAME);
  if (await fileExists(agentsDir)) {
    const entries = await readdir(agentsDir, { withFileTypes: true });
    const dirAgents = (
      await Promise.all(
        entries
          .filter((entry) => entry.isFile() && entry.name.endsWith(".yaml"))
          .map(async (entry) => {
            const name = entry.name.replace(/\.yaml$/, "");
            // Skip if already loaded from agents.yaml
            if (agents.some((a) => a.name === name)) return undefined;

            const filePath = join(agentsDir, entry.name);
            const def = await readYamlFile<Partial<AgentDefinition>>(filePath);
            return def ? { name, ...def } : undefined;
          })
      )
    ).filter((a): a is AgentDefinition => a !== undefined);
    agents.push(...dirAgents);
  }

  return agents;
}

export async function createAgent(
  projectDir: string,
  agent: AgentDefinition,
  options?: { perFile?: boolean }
): Promise<void> {
  const usePerFile = options?.perFile ?? false;

  if (usePerFile) {
    // Create as individual file: agents/{name}.yaml
    const agentsDir = join(projectDir, AGENTS_DIR_NAME);
    await mkdir(agentsDir, { recursive: true });

    const filePath = join(agentsDir, `${agent.name}.yaml`);
    if (await fileExists(filePath)) {
      throw new Error(`Agent already exists: ${agent.name}`);
    }

    const { name, ...rest } = agent;
    await writeYamlFile(filePath, rest);
  } else {
    // Create in agents.yaml
    const agentsFile = (await findAgentsFile(projectDir)) ?? join(projectDir, AGENTS_FILE_NAME);
    const data = (await readYamlFile<AgentsFile>(agentsFile)) ?? { agents: {} };

    if (!data.agents) {
      data.agents = {};
    }

    if (data.agents[agent.name]) {
      throw new Error(`Agent already exists: ${agent.name}`);
    }

    const { name, ...rest } = agent;
    data.agents[name] = rest;

    await writeYamlFile(agentsFile, data);
  }
}

export async function updateAgent(
  projectDir: string,
  name: string,
  updates: Partial<Omit<AgentDefinition, "name">>
): Promise<void> {
  // Try per-file first
  const perFilePath = await findAgentFile(projectDir, name);
  if (perFilePath) {
    const data = await readYamlFile<Partial<AgentDefinition>>(perFilePath);
    if (!data) {
      throw new Error(`Agent file corrupted: ${perFilePath}`);
    }

    await writeYamlFile(perFilePath, { ...data, ...updates });
    return;
  }

  // Fall back to agents.yaml
  const agentsFile = await findAgentsFile(projectDir);
  if (!agentsFile) {
    throw new Error("No agents.yaml found");
  }

  const data = await readYamlFile<AgentsFile>(agentsFile);
  if (!data?.agents?.[name]) {
    throw new Error(`Agent not found: ${name}`);
  }

  data.agents[name] = {
    ...data.agents[name],
    ...updates,
  };

  await writeYamlFile(agentsFile, data);
}

export async function removeAgent(projectDir: string, name: string): Promise<void> {
  // Try per-file first
  const perFilePath = await findAgentFile(projectDir, name);
  if (perFilePath) {
    const { unlink } = await import("node:fs/promises");
    await unlink(perFilePath);
    return;
  }

  // Fall back to agents.yaml
  const agentsFile = await findAgentsFile(projectDir);
  if (!agentsFile) {
    throw new Error("No agents.yaml found");
  }

  const data = await readYamlFile<AgentsFile>(agentsFile);
  if (!data?.agents?.[name]) {
    throw new Error(`Agent not found: ${name}`);
  }

  delete data.agents[name];

  await writeYamlFile(agentsFile, data);
}

export async function getAgent(projectDir: string, name: string): Promise<AgentDefinition | undefined> {
  const agents = await readAgents(projectDir);
  return agents.find((a) => a.name === name);
}

import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type { AgentFactory } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";

export async function loadAgentsFromYamlFile(path?: string): Promise<Map<string, AgentFactory>> {
  if (!path) {
    return new Map();
  }

  const content = await readFile(path, "utf-8");
  const parsed = parseYaml(content) as {
    agents?: Record<
      string,
      {
        role?: string;
        description?: string;
        provider?: string;
        model?: string;
        temperature?: number;
      }
    >;
  };

  const map = new Map<string, AgentFactory>();

  for (const [name, info] of Object.entries(parsed.agents ?? {})) {
    map.set(name, () => ({
      role: info.role,
      description: info.description,
      provider: info.provider,
      model: info.model,
      temperature: info.temperature,
    }));
  }

  return map;
}

export function loadWorkflowAgents(workflow?: WorkflowDef): Map<string, AgentFactory> {
  const workflowAgents = new Map<string, AgentFactory>();

  if (!workflow?.agents || typeof workflow.agents !== "object") {
    return workflowAgents;
  }

  for (const [name, info] of Object.entries(workflow.agents as Record<string, unknown>)) {
    if (!info || typeof info !== "object") {
      continue;
    }

    const agentInfo = info as {
      role?: string;
      description?: string;
      provider?: string;
      model?: string;
      temperature?: number;
      api_key?: string;
    };

    workflowAgents.set(name, () => ({
      role: agentInfo.role,
      description: agentInfo.description,
      provider: agentInfo.provider,
      model: agentInfo.model,
      temperature: agentInfo.temperature,
      api_key: agentInfo.api_key,
    }));
  }

  return workflowAgents;
}

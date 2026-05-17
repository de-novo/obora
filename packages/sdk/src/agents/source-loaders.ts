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
        prompt?: string;
      }
    >;
  };

  return Object.entries(parsed.agents ?? {}).reduce<Map<string, AgentFactory>>((map, [name, info]) => {
    map.set(name, () => ({
      role: info.role,
      description: info.description,
      provider: info.provider,
      model: info.model,
      temperature: info.temperature,
      prompt: info.prompt,
    }));
    return map;
  }, new Map());
}

export function loadWorkflowAgents(workflow?: WorkflowDef): Map<string, AgentFactory> {
  const workflowAgents = new Map<string, AgentFactory>();

  if (!workflow?.agents || typeof workflow.agents !== "object") {
    return workflowAgents;
  }

  return Object.entries(workflow.agents as Record<string, unknown>).reduce<Map<string, AgentFactory>>((map, [name, info]) => {
    if (!info || typeof info !== "object") {
      return map;
    }

    const agentInfo = info as {
      role?: string;
      description?: string;
      provider?: string;
      model?: string;
      temperature?: number;
      api_key?: string;
      prompt?: string;
    };

    map.set(name, () => ({
      role: agentInfo.role,
      description: agentInfo.description,
      provider: agentInfo.provider,
      model: agentInfo.model,
      temperature: agentInfo.temperature,
      api_key: agentInfo.api_key,
      prompt: agentInfo.prompt,
    }));
    return map;
  }, workflowAgents);
}

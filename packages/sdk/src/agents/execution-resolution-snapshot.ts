import { AgentConfigResolver, type AgentResolutionSnapshot } from "@obora/adapters";

import { loadAgentsFromYamlFile, loadWorkflowAgents } from "./source-loaders.js";
import type { AgentFactory } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";

export type ExecutionAgentSourceKind = "agents-path" | "workflow-agents" | "runtime-registration";

export interface ExecutionAgentSource {
  kind: ExecutionAgentSourceKind;
  label: string;
  agentNames: string[];
  notes?: string[];
}

export interface ExecutionAgentSnapshot {
  base: AgentResolutionSnapshot;
  executionSources: ExecutionAgentSource[];
  effectiveExecutionView: {
    agentName: string;
    hasAgentsPathEntry: boolean;
    hasWorkflowAgentEntry: boolean;
    hasRuntimeRegistration: boolean;
  };
}

export interface ExecutionAgentInventoryEntry {
  name: string;
  sources: {
    config: boolean;
    agentsPath: boolean;
    workflow: boolean;
    runtime: boolean;
  };
}

export interface BuildExecutionAgentInventoryInput {
  cwd: string;
  agentsPath?: string;
  workflow?: WorkflowDef;
  runtimeAgents: Map<string, AgentFactory>;
}

export interface BuildExecutionAgentSnapshotInput extends BuildExecutionAgentInventoryInput {
  agentName: string;
}

function toSource(
  kind: ExecutionAgentSourceKind,
  label: string,
  agents: Map<string, AgentFactory>
): ExecutionAgentSource | undefined {
  if (agents.size === 0) {
    return undefined;
  }

  return {
    kind,
    label,
    agentNames: [...agents.keys()],
  };
}

export async function buildExecutionAgentInventory({
  cwd,
  agentsPath,
  workflow,
  runtimeAgents,
}: BuildExecutionAgentInventoryInput): Promise<ExecutionAgentInventoryEntry[]> {
  const resolver = await AgentConfigResolver.create(cwd);
  const configInventory = resolver.listAgentInventory();
  const configNames = new Set(configInventory.map((entry) => entry.name));
  const yamlAgents = await loadAgentsFromYamlFile(agentsPath);
  const workflowAgents = loadWorkflowAgents(workflow);
  const names = new Set<string>([
    ...configNames,
    ...yamlAgents.keys(),
    ...workflowAgents.keys(),
    ...runtimeAgents.keys(),
  ]);

  return [...names].sort().map((name) => ({
    name,
    sources: {
      config: configNames.has(name),
      agentsPath: yamlAgents.has(name),
      workflow: workflowAgents.has(name),
      runtime: runtimeAgents.has(name),
    },
  }));
}

export async function buildExecutionAgentSnapshot({
  cwd,
  agentName,
  agentsPath,
  workflow,
  runtimeAgents,
}: BuildExecutionAgentSnapshotInput): Promise<ExecutionAgentSnapshot> {
  const resolver = await AgentConfigResolver.create(cwd);
  const base = resolver.snapshot(agentName);
  const yamlAgents = await loadAgentsFromYamlFile(agentsPath);
  const workflowAgents = loadWorkflowAgents(workflow);

  const executionSources = [
    toSource("agents-path", "Agents loaded from agentsPath", yamlAgents),
    toSource("workflow-agents", "Workflow-local agents", workflowAgents),
    toSource("runtime-registration", "Runtime-registered agents", runtimeAgents),
  ].filter((source): source is ExecutionAgentSource => Boolean(source));

  return {
    base,
    executionSources,
    effectiveExecutionView: {
      agentName,
      hasAgentsPathEntry: yamlAgents.has(agentName),
      hasWorkflowAgentEntry: workflowAgents.has(agentName),
      hasRuntimeRegistration: runtimeAgents.has(agentName),
    },
  };
}

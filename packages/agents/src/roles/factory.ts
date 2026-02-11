import { BaseAgent } from "./base-agent";
import { AnalystAgent, createAnalystAgent } from "./analyst-agent";
import { ExecutorAgent, createExecutorAgent } from "./executor-agent";
import { VerifierAgent, createVerifierAgent } from "./verifier-agent";
import { DirectorAgent, createDirectorAgent } from "./director-agent";
import type { LLMAdapter } from "../llm/adapter";
import type { ToolRegistry } from "../tools";

/**
 * 에이전트 생성 설정
 */
export interface CreateAgentConfig {
  id: string;
  role: "analyst" | "executor" | "verifier" | "director";
  llm: LLMAdapter;
  toolRegistry?: ToolRegistry;
}

/**
 * 에이전트 생성
 */
export function createAgent(config: CreateAgentConfig): BaseAgent {
  switch (config.role) {
    case "analyst":
      return createAnalystAgent(config.id, config.llm);

    case "executor":
      return createExecutorAgent(config.id, config.llm, config.toolRegistry);

    case "verifier":
      return createVerifierAgent(config.id, config.llm);

    case "director":
      return createDirectorAgent(config.id, config.llm);

    default:
      throw new Error(`Unknown agent role: ${config.role}`);
  }
}

/**
 * 에이전트 팀 생성
 */
export function createAgentTeam(
  config: Omit<CreateAgentConfig, "id" | "role"> & {
    analysts?: number;
    executors?: number;
    verifiers?: number;
    directors?: number;
  }
): BaseAgent[] {
  const agents: BaseAgent[] = [];
  const baseConfig = {
    llm: config.llm,
    toolRegistry: config.toolRegistry,
  };

  const hasAnyRoleSpecified =
    config.analysts !== undefined ||
    config.executors !== undefined ||
    config.verifiers !== undefined ||
    config.directors !== undefined;

  const defaultCount = hasAnyRoleSpecified ? 0 : 1;

  const count = config.analysts ?? defaultCount;
  for (let i = 0; i < count; i++) {
    agents.push(
      createAgent({
        id: `analyst-${i + 1}`,
        role: "analyst",
        ...baseConfig,
      })
    );
  }

  const executorCount = config.executors ?? defaultCount;
  for (let i = 0; i < executorCount; i++) {
    agents.push(
      createAgent({
        id: `executor-${i + 1}`,
        role: "executor",
        ...baseConfig,
      })
    );
  }

  const verifierCount = config.verifiers ?? defaultCount;
  for (let i = 0; i < verifierCount; i++) {
    agents.push(
      createAgent({
        id: `verifier-${i + 1}`,
        role: "verifier",
        ...baseConfig,
      })
    );
  }

  const directorCount = config.directors ?? defaultCount;
  for (let i = 0; i < directorCount; i++) {
    agents.push(
      createAgent({
        id: `director-${i + 1}`,
        role: "director",
        ...baseConfig,
      })
    );
  }

  return agents;
}

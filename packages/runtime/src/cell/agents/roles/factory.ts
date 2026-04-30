import { createAgentId } from "../../../blackboard/types/base.js";
import { BaseAgent } from "./base-agent";
import { AnalystAgent } from "./analyst-agent";
import { ExecutorAgent } from "./executor-agent";
import { VerifierAgent } from "./verifier-agent";
import { DirectorAgent } from "./director-agent";
import type { LLMAdapter, ToolRegistry } from "@obora/adapters";

/**
 * 에이전트 생성 설정
 */
export interface CreateAgentConfig {
  id: string;
  role: "analyst" | "executor" | "verifier" | "director";
  llm: LLMAdapter;
  toolRegistry?: ToolRegistry;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  sessionId?: string;
  enablePiRuntime?: boolean;
}

/**
 * 에이전트 생성
 */
export function createAgent(config: CreateAgentConfig): BaseAgent {
  switch (config.role) {
    case "analyst":
      return new AnalystAgent({
        id: createAgentId(config.id),
        llm: config.llm,
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.sessionId ? { sessionId: config.sessionId } : {}),
        ...(config.enablePiRuntime !== undefined ? { enablePiRuntime: config.enablePiRuntime } : {}),
      });

    case "executor":
      return new ExecutorAgent({
        id: createAgentId(config.id),
        llm: config.llm,
        toolRegistry: config.toolRegistry,
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.sessionId ? { sessionId: config.sessionId } : {}),
        ...(config.enablePiRuntime !== undefined ? { enablePiRuntime: config.enablePiRuntime } : {}),
      });

    case "verifier":
      return new VerifierAgent({
        id: createAgentId(config.id),
        llm: config.llm,
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.sessionId ? { sessionId: config.sessionId } : {}),
        ...(config.enablePiRuntime !== undefined ? { enablePiRuntime: config.enablePiRuntime } : {}),
      });

    case "director":
      return new DirectorAgent({
        id: createAgentId(config.id),
        llm: config.llm,
        ...(config.systemPrompt ? { systemPrompt: config.systemPrompt } : {}),
        ...(config.provider ? { provider: config.provider } : {}),
        ...(config.model ? { model: config.model } : {}),
        ...(config.sessionId ? { sessionId: config.sessionId } : {}),
        ...(config.enablePiRuntime !== undefined ? { enablePiRuntime: config.enablePiRuntime } : {}),
      });

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

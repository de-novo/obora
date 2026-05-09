import { createAgentId } from "../../../blackboard/types/base.js";
import { BaseAgent } from "./base-agent";
import { AnalystAgent } from "./analyst-agent";
import { ExecutorAgent, type ToolRegistryLike } from "./executor-agent";
import { VerifierAgent } from "./verifier-agent";
import { DirectorAgent } from "./director-agent";
import type { LLMAdapter } from "@obora/adapters";

/**
 * 에이전트 생성 설정
 */
export interface CreateAgentConfig {
  id: string;
  role: "analyst" | "executor" | "verifier" | "director";
  llm: LLMAdapter;
  toolRegistry?: ToolRegistryLike;
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

  const createRoleAgents = (
    role: CreateAgentConfig["role"],
    count: number
  ): BaseAgent[] =>
    Array.from({ length: count }, (_, index) =>
      createAgent({
        id: `${role}-${index + 1}`,
        role,
        ...baseConfig,
      })
    );

  return [
    ...createRoleAgents("analyst", config.analysts ?? defaultCount),
    ...createRoleAgents("executor", config.executors ?? defaultCount),
    ...createRoleAgents("verifier", config.verifiers ?? defaultCount),
    ...createRoleAgents("director", config.directors ?? defaultCount),
  ];
}

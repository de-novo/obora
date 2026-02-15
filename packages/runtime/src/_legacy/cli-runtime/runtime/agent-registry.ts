/**
 * AgentRegistry — resolves step.agent strings to BaseAgent instances.
 *
 * Registry responsibility is intentionally narrow:
 * - lookup role for agent name
 * - create/reuse provider adapter
 * - create BaseAgent from fully-resolved config
 */

import { OboraError } from "@obora/core";
import {
  type AgentConfig,
  type BaseAgent,
  AgentRole,
  createAdapter,
  createAgent,
  type LLMAdapter,
  type LLMProvider,
  type ToolRegistry,
} from "@obora-kit/agents";

import type { AgentResolver } from "./step-executor.js";

const DEFAULT_AGENT_NAME_TO_ROLE: Record<string, AgentRole> = {
  analyst: AgentRole.ANALYST,
  executor: AgentRole.EXECUTOR,
  verifier: AgentRole.VERIFIER,
  director: AgentRole.DIRECTOR,

  // TASK-053/054 documented names (aliases)
  architect: AgentRole.ANALYST,
  developer: AgentRole.EXECUTOR,
  reviewer: AgentRole.VERIFIER,
  planner: AgentRole.DIRECTOR,
};

export interface AgentRegistryConfig {
  llm?: LLMAdapter;
  toolRegistry?: ToolRegistry;
  roleMap?: Record<string, AgentRole>;
}

export class AgentRegistry implements AgentResolver {
  private readonly fallbackLlm?: LLMAdapter;
  private readonly toolRegistry?: ToolRegistry;
  private readonly roleMap: Record<string, AgentRole>;
  private readonly adapterByConfig = new Map<string, Promise<LLMAdapter>>();

  constructor(config: AgentRegistryConfig) {
    this.fallbackLlm = config.llm;
    this.toolRegistry = config.toolRegistry;
    this.roleMap = {
      ...DEFAULT_AGENT_NAME_TO_ROLE,
      ...(config.roleMap ?? {}),
    };
  }

  resolve(agentName: string): Promise<BaseAgent>;
  resolve(query: { agent?: string; type?: string; config?: AgentConfig }): Promise<BaseAgent>;
  async resolve(queryOrName: string | { agent?: string; type?: string; config?: AgentConfig }): Promise<BaseAgent> {
    const normalized =
      typeof queryOrName === "string"
        ? queryOrName
        : queryOrName.agent ?? queryOrName.type;

    if (!normalized) {
      throw new OboraError("E4003", "Agent resolution failed: missing agent/type query");
    }

    const role = this.mapToRole(normalized);
    const resolvedConfig = typeof queryOrName === "string" ? undefined : queryOrName.config;
    const llm = resolvedConfig
      ? await this.getAdapterForProvider(resolvedConfig.provider, resolvedConfig)
      : this.fallbackLlm;

    if (!llm) {
      throw new OboraError("E4007", "LLM adapter is not initialized for agent registry");
    }

    return createAgent({
      id: `${role}-${Date.now()}`,
      role,
      llm,
      toolRegistry: this.toolRegistry,
      ...(resolvedConfig?.systemPrompt ? { systemPrompt: resolvedConfig.systemPrompt } : {}),
      ...(resolvedConfig?.provider ? { provider: resolvedConfig.provider } : {}),
      ...(resolvedConfig?.model ? { model: resolvedConfig.model } : {}),
      enablePiRuntime: Boolean(resolvedConfig?.provider && resolvedConfig?.model && llm.id !== "mock-llm"),
    });
  }

  async getAdapterForProvider(provider: string, config: AgentConfig): Promise<LLMAdapter> {
    const cacheKey = `${provider}:${config.model ?? ""}:${config.baseUrl ?? ""}`;
    const existing = this.adapterByConfig.get(cacheKey);
    if (existing) {
      return existing;
    }

    const created = createAdapter(provider as LLMProvider, {
      model: config.model,
      baseUrl: config.baseUrl,
    });

    this.adapterByConfig.set(cacheKey, created);
    return created;
  }

  has(agentName: string): boolean {
    return agentName.toLowerCase() in this.roleMap;
  }

  listAvailable(): string[] {
    return Object.keys(this.roleMap);
  }

  private mapToRole(name: string): AgentRole {
    const role = this.roleMap[name.toLowerCase()];
    if (!role) {
      const available = this.listAvailable().join(", ");
      throw new OboraError("E4003", `Unknown agent: "${name}". Available agents: ${available}`);
    }
    return role;
  }
}

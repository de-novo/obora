/**
 * AgentRegistry — resolves step.agent strings to BaseAgent instances.
 *
 * Maps workflow YAML agent names (e.g. "analyst") to AgentRole enum values,
 * then delegates to createAgent() from @obora-kit/agents.
 *
 * Unknown agent names throw OboraError E4003 with actionable diagnosis.
 *
 * @module @obora/cli/runtime/agent-registry
 */

import { OboraError } from "@obora/core";
import {
  type BaseAgent,
  AgentRole,
  createAgent,
  type LLMAdapter,
  type ToolRegistry,
} from "@obora-kit/agents";

import type { AgentResolver } from "./step-executor.js";

// ---------------------------------------------------------------------------
// Role mapping table
// ---------------------------------------------------------------------------

const AGENT_NAME_TO_ROLE: Record<string, AgentRole> = {
  analyst: AgentRole.ANALYST,
  executor: AgentRole.EXECUTOR,
  verifier: AgentRole.VERIFIER,
  director: AgentRole.DIRECTOR,
};

// ---------------------------------------------------------------------------
// AgentRegistry
// ---------------------------------------------------------------------------

export interface AgentRegistryConfig {
  llm: LLMAdapter;
  toolRegistry?: ToolRegistry;
}

export class AgentRegistry implements AgentResolver {
  private readonly llm: LLMAdapter;
  private readonly toolRegistry?: ToolRegistry;

  constructor(config: AgentRegistryConfig) {
    this.llm = config.llm;
    this.toolRegistry = config.toolRegistry;
  }

  /**
   * Resolve an agent name/query to a BaseAgent instance.
   * @throws OboraError E4003 if the name/type is not in the mapping table.
   */
  resolve(agentName: string): BaseAgent;
  resolve(query: { agent?: string; type?: string }): BaseAgent;
  resolve(queryOrName: string | { agent?: string; type?: string }): BaseAgent {
    const normalized =
      typeof queryOrName === "string"
        ? queryOrName
        : queryOrName.agent ?? queryOrName.type;

    if (!normalized) {
      throw new OboraError("E4003", "Agent resolution failed: missing agent/type query");
    }

    const role = this.mapToRole(normalized);
    return createAgent({
      id: `${role}-${Date.now()}`,
      role,
      llm: this.llm,
      toolRegistry: this.toolRegistry,
    });
  }

  /**
   * Check whether an agent name is supported.
   */
  has(agentName: string): boolean {
    return agentName.toLowerCase() in AGENT_NAME_TO_ROLE;
  }

  /**
   * List all supported agent names.
   */
  listAvailable(): string[] {
    return Object.keys(AGENT_NAME_TO_ROLE);
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private mapToRole(name: string): AgentRole {
    const role = AGENT_NAME_TO_ROLE[name.toLowerCase()];
    if (!role) {
      const available = this.listAvailable().join(", ");
      throw new OboraError(
        "E4003",
        `Unknown agent: "${name}". Available agents: ${available}`,
      );
    }
    return role;
  }
}

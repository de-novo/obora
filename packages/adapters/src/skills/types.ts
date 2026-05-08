import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { ToolDefinition } from "../llm/adapter";

export interface SkillContext {
  cwd: string;
  agentId?: string;
  stepName?: string;
  metadata?: Record<string, unknown>;
}

export interface OboraSkill {
  name: string;
  description: string;
  version: string;
  tools: AgentTool[];
  systemPrompt?: string;
  dependencies?: string[];
  setup?(context: SkillContext): Promise<void>;
  teardown?(): Promise<void>;
}

export interface LoadedSkill {
  skill: OboraSkill;
  source: "builtin" | "local" | "global" | "npm";
  path?: string;
}

/**
 * @deprecated Use OboraSkill.tools (AgentTool[]) directly.
 */
export interface LegacyToolBackedSkill extends Omit<OboraSkill, "tools"> {
  tools: ToolDefinition[];
}

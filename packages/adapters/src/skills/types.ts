import type { AgentTool } from "@earendil-works/pi-agent-core";

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

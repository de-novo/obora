import type { AuditEvent, AuditFilter } from "../audit/types.js";
import type { PatternRuntimeContext, PatternRuntimeResult } from "../patterns/types.js";

export type PluginType =
  | "agent"
  | "tool"
  | "pattern"
  | "policy-rule"
  | "recovery-strategy"
  | "consensus-rule"
  | "audit-store"
  | "state-transform";

export interface OboraPlugin {
  name: string;
  version: string;
  type: PluginType;
  onLoad?(): Promise<void>;
  onUnload?(): Promise<void>;
}

export interface AgentPlugin extends OboraPlugin {
  type: "agent";
  createAgent(config: unknown): unknown;
}

export interface ToolPlugin extends OboraPlugin {
  type: "tool";
  schema: Record<string, unknown>;
  execute(params: unknown, context: unknown): Promise<unknown>;
}

export interface PatternPlugin extends OboraPlugin {
  type: "pattern";
  execute(context: PatternRuntimeContext): Promise<PatternRuntimeResult>;
}

export interface PolicyRulePlugin extends OboraPlugin {
  type: "policy-rule";
  evaluate(action: unknown, context: unknown): unknown;
}

export interface RecoveryStrategyPlugin extends OboraPlugin {
  type: "recovery-strategy";
  handle(failure: unknown): Promise<unknown>;
}

export interface ConsensusRulePlugin extends OboraPlugin {
  type: "consensus-rule";
  evaluate(votes: unknown[]): unknown;
}

export interface AuditStorePlugin extends OboraPlugin {
  type: "audit-store";
  record(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
}

export interface StateTransformPlugin extends OboraPlugin {
  type: "state-transform";
  transform(value: unknown): unknown;
}

export type AnyPlugin =
  | AgentPlugin
  | ToolPlugin
  | PatternPlugin
  | PolicyRulePlugin
  | RecoveryStrategyPlugin
  | ConsensusRulePlugin
  | AuditStorePlugin
  | StateTransformPlugin;

export interface PluginValidationResult {
  valid: boolean;
  errors: string[];
}

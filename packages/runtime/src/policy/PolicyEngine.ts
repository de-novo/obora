import type { PolicyDecision, PolicySet } from "./types.js";

export interface PolicyEngine {
  load(path: string): Promise<void>;
  loadInline(policies: PolicySet): void;
  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision;
  reload(): Promise<void>;
  version(): string;
}

export interface PolicyAction {
  type: "tool_call" | "file_access" | "step_start" | "resource_use";
  name: string;
  params?: unknown;
}

export interface PolicyContext {
  cellId?: string;
  stepName?: string;
  currentTokens?: number;
  currentCost?: number;
  currentToolCalls?: number;
}

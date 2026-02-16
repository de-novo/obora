export type PolicyDecision =
  | { type: "allow" }
  | { type: "deny"; reason: string; rule: string }
  | { type: "gate"; gateType: string; config: unknown }
  | { type: "transform"; original: unknown; transformed: unknown; rule: string; transformFn?: string };

export interface PolicyRulePlugin {
  name: string;
  version: string;
  type: "policy-rule";
  evaluate(action: PolicyAction, context: PolicyContext, policies: PolicySet): PolicyDecision | null;
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
  currentDurationMs?: number;
}

export interface PolicySet {
  version?: string;
  tools?: ToolPolicy[];
  sandbox?: SandboxPolicy;
  resources?: ResourcePolicy;
  gates?: GatePolicy[];
}

export interface ToolPolicy {
  name: string;
  effect: "allow" | "deny" | "transform" | "gate";
  when?: { matches?: string[]; not_matches?: string[] };
  transform?: { fn: string };
  gate?: {
    type: "human-approval" | "consensus" | "external";
    timeout?: string;
  };
}

export interface SandboxPolicy {
  root: string;
  denyOutsideRoot: boolean;
  denyPatterns?: string[];
  maxFileSize?: string;
}

export interface ResourcePolicy {
  timeoutMs?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  maxToolCalls?: number;
  maxOutputSize?: string;
}

export interface GatePolicy {
  step: string;
  type: "human-approval" | "consensus" | "external";
  required: boolean;
  timeout?: string;
  fallback?: "fail" | "escalate";
}

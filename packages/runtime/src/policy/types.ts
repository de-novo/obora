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
  executionId?: string;
  currentTokens?: number;
  currentCost?: number;
  currentToolCalls?: number;
  currentDurationMs?: number;
  dynamicVars?: DynamicPolicyVars;
}

export interface PolicySet {
  version?: string;
  tools?: ToolPolicy[];
  dynamicToolRules?: DynamicToolRule[];
  sandbox?: SandboxPolicy;
  resources?: ResourcePolicy;
  gates?: GatePolicy[];
}

export interface PolicyVersion {
  version: string;
  loadedAt: Date;
  source: string;
  hash: string;
}

export interface PolicySnapshot {
  readonly version: PolicyVersion;
  enforce(action: PolicyAction, context: PolicyContext): PolicyDecision;
}

export interface ToolPolicy {
  name: string;
  effect: "allow" | "deny" | "transform" | "gate";
  when?: { matches?: string[]; not_matches?: string[]; condition?: string };
  transform?: { fn: string };
  gate?: {
    type: "human-approval" | "consensus" | "external";
    timeout?: string;
  };
}

export interface DynamicToolRule {
  name: string;
  condition: string;
  effect: "allow" | "deny" | "transform" | "gate";
  priority?: number;
}

export interface SandboxPolicy {
  root: string;
  denyOutsideRoot: boolean;
  denyPatterns?: string[];
  maxFileSize?: string;
}

export interface DynamicResourceLimit {
  field: "tokens" | "cost" | "tool_calls" | "duration_ms";
  condition: string;
  limit: number;
  action: "deny" | "warn" | "gate";
}

export interface DynamicQuotaConfig {
  limits: DynamicResourceLimit[];
}

export interface ResourcePolicy {
  timeoutMs?: number;
  maxTokens?: number;
  maxCostUsd?: number;
  maxToolCalls?: number;
  maxOutputSize?: string;
  dynamicQuota?: DynamicQuotaConfig;
}

export interface DynamicPolicyVars {
  execution: {
    id: string;
    workflowName: string;
    startedAt: Date;
    elapsedMs: number;
    totalTokens: number;
    totalCost: number;
    totalToolCalls: number;
    completedSteps: string[];
  };
  step: {
    name: string;
    agent: string;
    index: number;
    config?: Record<string, unknown>;
  };
  actor: {
    id: string;
    role?: string;
  };
  state: Record<string, unknown>;
  metrics: {
    errorCount: number;
    retryCount: number;
    avgStepDurationMs: number;
    maxStepDurationMs: number;
  };
  previousResults: Record<string, { success: boolean; output?: unknown }>;
}

export interface GatePolicy {
  step: string;
  type: "human-approval" | "consensus" | "external";
  required: boolean;
  timeout?: string;
  fallback?: "fail" | "escalate" | "auto-approve";
}

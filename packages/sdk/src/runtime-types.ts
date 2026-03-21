/**
 * Shared type definitions for OboraRuntime and its sub-modules.
 * Extracted to break circular import chains.
 */

// ── Audit Event Types ──────────────────────────────────────────────────────

export type AuditEventType =
  | "execution_start"
  | "execution_end"
  | "step_start"
  | "step_end"
  | "cell_start"
  | "cell_end"
  | "tool_call"
  | "tool_result"
  | "llm_request"
  | "llm_response"
  | "policy_check"
  | "policy_deny"
  | "state_change"
  | "consensus_vote"
  | "consensus_result"
  | "gate_wait"
  | "gate_resolve"
  | "gate_assignment_created"
  | "gate_assignment_reassigned"
  | "gate_assignment_expired"
  | "gate_approval_decision"
  | "gate_sla_warning"
  | "gate_sla_expired"
  | "recovery_start"
  | "recovery_end"
  | "snapshot_create"
  | "snapshot_restore"
  | "plugin_load"
  | "plugin_unload"
  | "reexecution_start"
  | "reexecution_step_start"
  | "reexecution_step_end"
  | "reexecution_end"
  | "workflow.back_edge_triggered"
  | "workflow.back_edge_exhausted"
  | "workflow.back_edge_cost_exceeded"
  | "workflow.validation_failed"
  | "workflow.validation_passed"
  | "workflow.repair_started"
  | "workflow.repair_completed"
  | "workflow.repair_no_progress"
  | "workflow.step_starvation_warning"
  | "parallel_layer_start"
  | "parallel_layer_end"
  | "peer_review_vote"
  | "peer_review_result"
  | "warning"
  | "error"
  | "knowledge_context_attached";

export interface AuditEvent<T extends AuditEventType = AuditEventType> {
  id: string;
  executionId: string;
  cellId?: string;
  timestamp: Date;
  type: T;
  data: unknown;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
    costUsd?: number;
  };
}

// ── Error Codes ────────────────────────────────────────────────────────────

export const OboraErrorCode = {
  CELL_TIMEOUT: "CELL_1001",
  CELL_TOOL_DENIED: "CELL_1002",
  CELL_LLM_ERROR: "CELL_1003",
  CELL_ABORTED: "CELL_1004",
  POLICY_DENY: "POLICY_2001",
  POLICY_GATE_REQUIRED: "POLICY_2002",
  POLICY_GATE_TIMEOUT: "POLICY_2003",
  POLICY_GATE_REJECTED: "POLICY_2004",
  POLICY_SANDBOX_VIOLATION: "POLICY_2005",
  POLICY_RESOURCE_EXCEEDED: "POLICY_2006",
  POLICY_LOAD_FAILED: "POLICY_2007",
  CONSENSUS_FAIL: "CONSENSUS_3001",
  CONSENSUS_TIMEOUT: "CONSENSUS_3002",
  CONSENSUS_QUORUM_NOT_MET: "CONSENSUS_3003",
  RECOVERY_RETRY_EXHAUSTED: "RECOVERY_4001",
  RECOVERY_ROLLBACK_FAILED: "RECOVERY_4002",
  RECOVERY_ESCALATION_TIMEOUT: "RECOVERY_4003",
  ORCH_WORKFLOW_NOT_FOUND: "ORCH_5001",
  ORCH_STEP_NOT_FOUND: "ORCH_5002",
  ORCH_DEPENDENCY_FAILED: "ORCH_5003",
  ORCH_EXECUTION_TIMEOUT: "ORCH_5004",
  AUDIT_STORE_ERROR: "AUDIT_6001",
  AUDIT_REPLAY_NOT_FOUND: "AUDIT_6002",
  ADAPTER_LLM_UNAVAILABLE: "ADAPTER_7001",
  ADAPTER_AUTH_FAILED: "ADAPTER_7002",
  ADAPTER_TOOL_NOT_FOUND: "ADAPTER_7003",
  SDK_WORKFLOW_NOT_FOUND: "SDK_8001",
  SDK_EXECUTION_CANCELLED: "SDK_8002",
  SDK_NOT_IMPLEMENTED: "SDK_8003",
  SDK_INVALID_POLICY: "SDK_8004",
  SDK_INVALID_WORKFLOW: "SDK_8005",
  SDK_UNKNOWN_ERROR: "SDK_8006",
  SDK_EXECUTION_NOT_FOUND: "SDK_8007",
  SDK_INVALID_CONFIG: "SDK_8008",
  SDK_CONFIG_ERROR: "SDK_8009",
  SDK_INVALID_PLUGIN: "SDK_9001",
  SDK_PLUGIN_LOAD_FAILED: "SDK_9002",
  SDK_PLUGIN_CONFLICT: "SDK_9003",
  SDK_FIXTURE_INVALID: "SDK_9004",
} as const;

export class OboraError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly executionId?: string,
    public readonly stepName?: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "OboraError";
  }
}

// ── Runtime Data Structures ────────────────────────────────────────────────

export interface RuntimeExecution {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "waiting" | "suspended" | "aborted";
  input: unknown;
  startedAt: Date;
  endedAt?: Date;
  error?: string;
  stepOrder: string[];
  completedSteps: string[];
  stepRecords: Record<string, unknown>;
  outputs: Record<string, unknown>;
}

export type RunStatus = "queued" | "running" | "waiting" | "suspended" | "completed" | "failed" | "aborted";

export interface RunHandle {
  executionId: string;
  readonly status: RunStatus;
  wait(): Promise<RuntimeExecution>;
  cancel(reason?: string): Promise<void>;
}

export interface RunOptions {
  input?: unknown;
  variables?: Record<string, unknown>;
  signal?: AbortSignal;
  knowledgeContext?: {
    enabled?: boolean;
    tags?: string[];
    textQuery?: string;
    minConfidence?: number;
    limit?: number;
    projectId?: string;
    maxTokens?: number;
  };
}

// ── Event Handler Types ────────────────────────────────────────────────────

export type EventHandler<T extends AuditEventType = AuditEventType> = (
  event: AuditEvent & { type: T }
) => void | Promise<void>;

export type Unsubscribe = () => void;

// ── Registration Types ─────────────────────────────────────────────────────

export type AgentFactory = (...args: unknown[]) => unknown;
export type ToolHandler = (params: unknown, context?: unknown) => unknown | Promise<unknown>;

export interface PatternPlugin {
  name: string;
}

export interface CustomPatternDefinition {
  name: string;
  execute?: (...args: unknown[]) => unknown;
}

export type PatternRegistration = PatternPlugin | CustomPatternDefinition;

export interface OboraPlugin {
  name: string;
  version: string;
  type: string;
}

// ── Config Types ───────────────────────────────────────────────────────────

export interface OboraAuditConfig {
  enabled?: boolean;
  sink?: (event: AuditEvent) => void | Promise<void>;
}

export interface PersistenceConfig {
  enabled: boolean;
  adapter: "sqlite" | "custom";
  sqlite?: { path: string };
  custom?: { instance: import("@obora/runtime").StorageAdapter };
}

export interface ArtifactsConfig {
  enabled?: boolean;
  store?: "local" | "custom";
  local?: { basePath?: string };
  custom?: { instance: import("@obora/runtime").ArtifactStore };
}

export interface SharedMemoryConfig {
  enabled?: boolean;
  adapter?: "file" | "custom";
  file?: {
    basePath?: string;
    projectKey?: string;
    scopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
  };
  custom?: {
    instance: import("./shared-memory/store.js").SharedMemoryStore;
  };
}

export interface OboraRuntimeConfig {
  policyPath?: string;
  audit?: OboraAuditConfig;
  llm?: import("./llm-config.js").LLMConfig;
  config?: import("./config-loader.js").OboraConfig;
  configPath?: string;
  agentsPath?: string;
  verbose?: boolean;
  stepTools?: import("./step-executor.js").ToolHandler[];
  persistence?: PersistenceConfig;
  artifacts?: ArtifactsConfig;
  sharedMemory?: SharedMemoryConfig;
}

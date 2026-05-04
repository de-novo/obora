/**
 * Shared type definitions for OboraRuntime and its sub-modules.
 * Extracted to break circular import chains.
 */

import type { StorageAdapter, ArtifactStore } from "@obora/runtime";
import type { ToolDefinition } from "@obora/adapters";
export interface ModelPricing {
  model: string;
  promptPer1kTokens: number;
  completionPer1kTokens: number;
}

export interface LLMConfig {
  provider: string;
  apiKey: string;
  model?: string;
  baseUrl?: string;
  temperature?: number;
  timeout?: number;
  maxTokens?: number;
}

export interface OboraConfig {
  defaults?: {
    provider?: string;
    model?: string;
    temperature?: number;
    timeout?: number;
    maxTokens?: number;
  };
  providers?: Record<
    string,
    {
      authMode?: string;
      authRef?: string;
      defaultModel?: string;
      timeout?: number;
      maxTokens?: number;
      baseUrl?: string;
    }
  >;
  agents?: Record<
    string,
    {
      provider?: string;
      model?: string;
      temperature?: number;
    }
  >;
  persistence?: {
    enabled?: boolean;
    adapter?: "sqlite" | "custom";
    sqlite?: { path?: string };
    custom?: unknown;
  };
  artifacts?: {
    enabled?: boolean;
    store?: "local" | "custom";
    local?: { basePath?: string };
    custom?: { instance?: ArtifactStore };
  };
  dlq?: {
    enabled?: boolean;
    filePath?: string;
  };
  sharedMemory?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: {
      basePath?: string;
      projectKey?: string;
      scopes?: MemoryScopeLevel[];
    };
    custom?: { instance?: SharedMemoryStore };
  };
  tkgProjection?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: {
      basePath?: string;
      projectKey?: string;
      scopes?: MemoryScopeLevel[];
    };
    custom?: { instance?: StagingTKGStore };
    promotion?: {
      enabled?: boolean;
      minConfidence?: number;
      confidenceSpreadThreshold?: number;
      confidenceConflictMode?: TKGConfidenceConflictMode;
      allowedEventTypes?: ProjectableTKGEventType[];
      applyScopes?: MemoryScopeLevel[];
      triggers?: TKGPromotionTrigger[];
      evaluationMode?: TKGPromotionEvaluationMode;
    };
    rollback?: {
      enabled?: boolean;
      adapter?: "file" | "custom";
      file?: { basePath?: string };
      custom?: { instance?: TKGRollbackStore };
    };
    reviewQueue?: {
      enabled?: boolean;
      adapter?: "file" | "custom";
      file?: { basePath?: string };
      custom?: { instance?: TKGReviewQueueStore };
    };
  };
  resources?: {
    maxCostPerRun?: number;
    maxTokensPerStep?: number;
    maxCostPerStep?: number;
    onBudgetExceed?: "block" | "warn";
    pricing?:
      | ModelPricing[]
      | {
          models: ModelPricing[];
          unknownModel?: "warn" | "block" | "estimate";
          fallbackPer1kTokens?: { prompt: number; completion: number };
        };
    unknownModel?: "warn" | "block" | "estimate";
    fallbackPer1kTokens?: { prompt: number; completion: number };
  };
}
import type { MemoryScopeLevel, SharedMemoryStore } from "./shared-memory/store.js";
import type { ProjectableTKGEventType, StagingTKGStore } from "./tkg/store.js";
import type { TKGRollbackStore } from "./tkg/rollback.js";
import type { TKGReviewQueueStore } from "./tkg/review-queue.js";

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
  | "tkg.checkpoint"
  | "tkg.apply"
  | "tkg.review_queue"
  | "tkg.rollback"
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

// ── Error Codes & Error Class (re-exported from runtime-errors.ts) ─────────

export { OboraError, OboraErrorCode } from "./runtime-errors.js";

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
export type PluginToolHandler = (params: unknown, context?: unknown) => unknown | Promise<unknown>;

export interface ToolHandler {
  definition: ToolDefinition;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

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
  custom?: { instance: StorageAdapter };
}

export interface ArtifactsConfig {
  enabled?: boolean;
  store?: "local" | "custom";
  local?: { basePath?: string };
  custom?: { instance: ArtifactStore };
}

export interface SharedMemoryConfig {
  enabled?: boolean;
  adapter?: "file" | "custom";
  file?: {
    basePath?: string;
    projectKey?: string;
    scopes?: MemoryScopeLevel[];
  };
  custom?: {
    instance: SharedMemoryStore;
  };
}

export type TKGPromotionTrigger =
  | ProjectableTKGEventType
  | "execution_end";

export type TKGPromotionEvaluationMode =
  | "full_history"
  | "current_execution"
  | "latest_effective";

export type TKGConfidenceConflictMode =
  | "signal_only"
  | "review"
  | "blocking";

export interface TKGProjectionConfig {
  enabled?: boolean;
  adapter?: "file" | "custom";
  file?: {
    basePath?: string;
    projectKey?: string;
    scopes?: MemoryScopeLevel[];
  };
  custom?: {
    instance: StagingTKGStore;
  };
  promotion?: {
    enabled?: boolean;
    minConfidence?: number;
    confidenceSpreadThreshold?: number;
    confidenceConflictMode?: TKGConfidenceConflictMode;
    allowedEventTypes?: ProjectableTKGEventType[];
    applyScopes?: MemoryScopeLevel[];
    triggers?: TKGPromotionTrigger[];
    evaluationMode?: TKGPromotionEvaluationMode;
  };
  rollback?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: { basePath?: string };
    custom?: { instance: TKGRollbackStore };
  };
  reviewQueue?: {
    enabled?: boolean;
    adapter?: "file" | "custom";
    file?: { basePath?: string };
    custom?: { instance: TKGReviewQueueStore };
  };
}

export interface OboraRuntimeConfig {
  policyPath?: string;
  audit?: OboraAuditConfig;
  llm?: LLMConfig;
  config?: OboraConfig;
  configPath?: string;
  agentsPath?: string;
  verbose?: boolean;
  logger?: {
    info?: (...args: unknown[]) => void;
    warn?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
    debug?: (...args: unknown[]) => void;
  };
  stepTools?: ToolHandler[];
  persistence?: PersistenceConfig;
  artifacts?: ArtifactsConfig;
  sharedMemory?: SharedMemoryConfig;
  tkgProjection?: TKGProjectionConfig;
  /** Dead Letter Queue configuration for unrecoverable failures */
  dlq?: {
    enabled?: boolean;
    filePath?: string;
  };
  /** Execution lock configuration to prevent concurrent runs */
  executionLock?: {
    enabled?: boolean;
    basePath?: string;
    staleLockThresholdMs?: number;
  };
  /** Auto-recovery: automatically resume from checkpoint on failure */
  autoRecovery?: {
    enabled?: boolean;
    maxRetries?: number;
    delayMs?: number;
    driftPolicy?: "reject" | "warn" | "ignore";
  };
}

export interface PersistedValidationFailureDetail {
  stepName?: string;
  summary?: string;
  errorCode?: string;
  logPath?: string;
  failedChecks: Array<{
    name?: string;
    message?: string;
    severity?: string;
    file?: string;
  }>;
}

export interface PersistedRepairLoopSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  lastStopCategory?: "no_progress" | "repeated_critical_issue" | "exhausted";
  recentValidationFailures: PersistedValidationFailureDetail[];
}

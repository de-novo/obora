export type RecoveryStrategyType = "retry" | "rollback" | "escalate" | "alternative";

export interface CellFailure {
  executionId: string;
  cellId: string;
  stepName?: string;
  attempt: number;
  error: Error;
  metadata?: Record<string, unknown>;
}

export interface BaseRecoveryStrategy {
  type: RecoveryStrategyType;
}

export interface RetryRecoveryStrategy extends BaseRecoveryStrategy {
  type: "retry";
  mode: "linear" | "exponential";
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  multiplier?: number;
}

export interface RollbackRecoveryStrategy extends BaseRecoveryStrategy {
  type: "rollback";
  snapshotId: string;
}

export interface EscalateRecoveryStrategy extends BaseRecoveryStrategy {
  type: "escalate";
  severity: "low" | "medium" | "high" | "critical";
  channel: string;
  summary?: string;
}

export interface AlternativeRecoveryStrategy extends BaseRecoveryStrategy {
  type: "alternative";
  stepName: string;
  payload?: unknown;
}

export type RecoveryStrategy =
  | RetryRecoveryStrategy
  | RollbackRecoveryStrategy
  | EscalateRecoveryStrategy
  | AlternativeRecoveryStrategy;

export interface RetryExecutor {
  executeRetry(failure: CellFailure): Promise<unknown>;
}

export interface SnapshotStore {
  restore(snapshotId: string): Promise<void>;
}

export interface EscalationNotifier {
  notify(input: {
    failure: CellFailure;
    severity: EscalateRecoveryStrategy["severity"];
    channel: string;
    summary?: string;
  }): Promise<void>;
}

export interface AlternativeStepExecutor {
  executeAlternative(input: {
    failure: CellFailure;
    stepName: string;
    payload?: unknown;
  }): Promise<unknown>;
}

export interface RecoveryContext {
  retryExecutor?: RetryExecutor;
  snapshotStore?: SnapshotStore;
  escalationNotifier?: EscalationNotifier;
  alternativeExecutor?: AlternativeStepExecutor;
  wait?: (ms: number) => Promise<void>;
}

export type RecoveryResultStatus = "recovered" | "failed" | "escalated";

export interface RecoveryResult {
  status: RecoveryResultStatus;
  strategy: RecoveryStrategyType;
  attempts?: number;
  details?: Record<string, unknown>;
  error?: Error;
}

export interface RecoveryStrategyPlugin {
  readonly type: RecoveryStrategyType;
  execute(
    failure: CellFailure,
    strategy: RecoveryStrategy,
    context: Required<RecoveryContext>
  ): Promise<RecoveryResult>;
}

export interface RecoveryEngine {
  handle(failure: CellFailure, strategy: RecoveryStrategy): Promise<RecoveryResult>;
}

// Legacy export for compatibility during M1 migration.
export * from "../_legacy/actor/supervision/types.js";

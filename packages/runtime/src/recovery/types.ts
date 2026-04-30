export type RecoveryStrategyType = "retry" | "rollback" | "escalate" | "alternative" | "custom";

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

export interface CustomRecoveryStrategy extends BaseRecoveryStrategy {
  type: "custom";
  handlerPath: string;
}

export type RecoveryStrategy =
  | RetryRecoveryStrategy
  | RollbackRecoveryStrategy
  | EscalateRecoveryStrategy
  | AlternativeRecoveryStrategy
  | CustomRecoveryStrategy;

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

export interface RecoveryConsensusGate {
  evaluate(sessionId: string): { status: "pass" | "fail" | "pending" | "timeout" };
}

export interface RecoveryContext {
  retryExecutor?: RetryExecutor;
  snapshotStore?: SnapshotStore;
  escalationNotifier?: EscalationNotifier;
  alternativeExecutor?: AlternativeStepExecutor;
  consensusGate?: RecoveryConsensusGate;
  auditTrail?: {
    record(event: {
      id: string;
      executionId: string;
      cellId?: string;
      timestamp: Date;
      type: "recovery_start" | "recovery_end";
      data: unknown;
    }): Promise<void>;
  };
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

export type RecoveryExecutionContext = RecoveryContext & {
  wait: NonNullable<RecoveryContext["wait"]>;
};

export interface RecoveryStrategyPlugin {
  readonly type: RecoveryStrategyType;
  execute(
    failure: CellFailure,
    strategy: RecoveryStrategy,
    context: RecoveryExecutionContext
  ): Promise<RecoveryResult>;
}

export interface RecoveryHandleOptions {
  consensusSessionId?: string;
}

export interface RecoveryEngine {
  handle(
    failure: CellFailure,
    strategy: RecoveryStrategy,
    options?: RecoveryHandleOptions
  ): Promise<RecoveryResult>;
}

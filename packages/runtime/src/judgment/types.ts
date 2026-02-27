/**
 * Judgment Engine types — TASK-M1-25
 */

export type RunState =
  | 'queued'
  | 'running'
  | 'retried'
  | 'timeout'
  | 'failed'
  | 'skipped'
  | 'needs-human-review'
  | 'done';

export type ErrorCode =
  | 'TIMEOUT'
  | 'GOTO_TARGET_NOT_FOUND'
  | 'ESCALATION_FAILED';

export interface OnFailPolicy {
  goto?: string;
  escalateAfterConsecutiveFails?: number;
}

export interface EngineOptions {
  timeoutMs: number;
  batchDeadlineMs: number;
  maxRetries: number;
  backoffMs: number;
  onFail?: OnFailPolicy;
}

export interface EngineResult {
  runId: string;
  runState: RunState;
  retryCount: number;
  nextStep?: string;
  errorCode?: ErrorCode;
  decisionTrace: string[];
}

export type JudgmentStatus = 'pass' | 'fail';

export interface StepInput {
  stepId: string;
  /** Available goto targets */
  validTargets?: string[];
  /** If true, skip this step */
  skipCondition?: boolean;
}

export interface HumanResolution {
  action: 'approve' | 'reject';
}

export interface TransitionLog {
  runId: string;
  from: RunState;
  to: RunState;
  reason: string;
  timestamp: number;
}

import type { AuditEvent } from '@obora-kit/runtime';

export type RuntimeAuditEvent = AuditEvent;

export type KnownExecutionEventType =
  | 'execution_start'
  | 'execution_end'
  | 'step_start'
  | 'step_end'
  | 'policy_check'
  | 'policy_deny'
  | 'gate_wait'
  | 'gate_resolve'
  | 'recovery_start'
  | 'recovery_end'
  | 'error';

export type ExecutionEventSeverity = 'info' | 'warning' | 'critical';

export interface ExecutionEvent {
  id: string;
  executionId: string;
  timestamp: string;
  type: string;
  knownType?: KnownExecutionEventType;
  stepName?: string;
  status?: 'running' | 'completed' | 'failed' | 'waiting' | 'skipped';
  severity?: ExecutionEventSeverity;
  payload?: Record<string, unknown>;
}

export interface AuditQueryParams {
  fromTime?: string;
  toTime?: string;
  eventType?: string | string[];
  stepName?: string;
  executionId?: string;
  limit?: number;
  offset?: number;
}

export interface AuditQueryResult {
  events: AuditEvent[];
  total: number;
  hasMore: boolean;
}

export interface PolicyDocument {
  id: string;
  name: string;
  content: string;
  revision: string;
  createdAt: string;
  updatedAt: string;
}

export interface PolicyValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApiErrorPayload {
  code: string;
  message: string;
}

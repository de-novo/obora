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
  | "recovery_start"
  | "recovery_end"
  | "snapshot_create"
  | "snapshot_restore"
  | "plugin_load"
  | "plugin_unload"
  | "error";

export interface AuditEvent {
  id: string;
  executionId: string;
  cellId?: string;
  timestamp: Date;
  type: AuditEventType;
  data: unknown;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
    costUsd?: number;
  };
}

export interface AuditFilter {
  executionId?: string;
  cellId?: string;
  type?: AuditEventType | AuditEventType[];
  from?: Date;
  to?: Date;
  limit?: number;
}

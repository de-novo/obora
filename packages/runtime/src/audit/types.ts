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
  | "workflow.step_starvation_warning"
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

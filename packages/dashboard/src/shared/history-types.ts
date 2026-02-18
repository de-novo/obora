export interface RunRecord {
  id: string;
  workflowName: string;
  status: 'running' | 'completed' | 'failed' | 'suspended';
  input: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface StepRecord {
  id: string;
  runId: string;
  stepName: string;
  status: 'running' | 'completed' | 'failed' | 'skipped';
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStep: Array<{ stepName: string; tokens: number; costUsd: number }>;
  byModel: Array<{ model: string; tokens: number; costUsd: number }>;
}

export interface StructuredAuditEvent {
  id: string;
  runId: string;
  stepName: string;
  timestamp: string;
  category: 'consensus' | 'policy' | 'execution' | 'recovery';
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  vote?: {
    decision: 'approve' | 'reject' | 'abstain';
    confidence?: number;
    reasoning?: string;
  };
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  stepName: string;
  stateSnapshot: unknown;
  completedSteps: string[];
  policyHash: string;
  createdAt: string;
}

export interface HistoryRunSummaryItem {
  run: RunRecord;
  stepCount: number;
  costSummary: CostSummary;
}

export interface HistoryRunsResponse {
  items: HistoryRunSummaryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface RunDetailResponse {
  run: RunRecord;
  steps: StepRecord[];
  costSummary: CostSummary;
  auditTimeline: StructuredAuditEvent[];
  checkpoints: CheckpointRecord[];
  pagination?: {
    auditTotal: number;
    auditLimit: number;
    auditOffset: number;
  };
}

export interface HistoryRunsQuery {
  status?: string;
  workflowName?: string;
  from?: string;
  to?: string;
  costMin?: number;
  costMax?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'startedAt' | 'completedAt' | 'totalCostUsd';
  sortOrder?: 'asc' | 'desc';
}

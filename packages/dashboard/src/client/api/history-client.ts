import type {
  CheckpointRecord,
  CostSummary,
  HistoryRunSummaryItem,
  HistoryRunsQuery,
  HistoryRunsResponse,
  RunDetailResponse,
  RunRecord,
  StepRecord,
  StructuredAuditEvent,
} from '../../shared/history-types.js';

export type {
  CheckpointRecord,
  CostSummary,
  HistoryRunSummaryItem,
  HistoryRunsQuery,
  HistoryRunsResponse,
  RunDetailResponse,
  RunRecord,
  StepRecord,
  StructuredAuditEvent,
};

const withQuery = (path: string, query: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const queryString = params.toString();
  return queryString.length > 0 ? `${path}?${queryString}` : path;
};

export const fetchHistoryRuns = async (query: HistoryRunsQuery = {}): Promise<HistoryRunsResponse> => {
  const response = await fetch(
    withQuery('/api/history/runs', {
      status: query.status,
      workflowName: query.workflowName,
      repairLoop: query.repairLoop,
      from: query.from,
      to: query.to,
      costMin: query.costMin,
      costMax: query.costMax,
      limit: query.limit,
      offset: query.offset,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder,
    }),
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch history runs (${response.status})`);
  }

  return (await response.json()) as HistoryRunsResponse;
};

export const fetchHistoryRunDetail = async (
  runId: string,
  options: { auditLimit?: number; auditOffset?: number } = {},
): Promise<RunDetailResponse> => {
  const response = await fetch(
    withQuery(`/api/history/runs/${encodeURIComponent(runId)}`, {
      auditLimit: options.auditLimit,
      auditOffset: options.auditOffset,
    }),
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch run detail (${response.status})`);
  }

  return (await response.json()) as RunDetailResponse;
};

export const resumeHistoryRun = async (runId: string): Promise<void> => {
  const response = await fetch(`/api/history/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Failed to resume run (${response.status})`);
  }
};

export { withQuery };

import type {
  ArtifactPreviewResponse,
  ArtifactRecord,
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
  ArtifactPreviewResponse,
  ArtifactRecord,
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

const HISTORY_API_BASE = '/api/history';

const buildQuery = (query: Record<string, string | number | undefined>): string => {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === '') return;
    params.set(key, String(value));
  });
  const encoded = params.toString();
  return encoded ? `?${encoded}` : '';
};

async function parseJsonOrThrow<T>(response: Response): Promise<T> {
  if (response.ok) return (await response.json()) as T;
  const payload = (await response.json().catch(() => null)) as { message?: string } | null;
  throw new Error(payload?.message ?? `Request failed with ${response.status}`);
}

export async function fetchHistoryRuns(query: HistoryRunsQuery): Promise<HistoryRunsResponse> {
  const queryString = buildQuery({
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
  });
  const response = await fetch(`${HISTORY_API_BASE}/runs${queryString}`);
  return parseJsonOrThrow<HistoryRunsResponse>(response);
}

export async function fetchHistoryRunDetail(
  runId: string,
  options?: { auditLimit?: number; auditOffset?: number },
): Promise<RunDetailResponse> {
  const queryString = buildQuery({
    auditLimit: options?.auditLimit,
    auditOffset: options?.auditOffset,
  });
  const response = await fetch(`${HISTORY_API_BASE}/runs/${encodeURIComponent(runId)}${queryString}`);
  return parseJsonOrThrow<RunDetailResponse>(response);
}

export async function fetchHistoryArtifactPreview(
  runId: string,
  artifactId: string,
): Promise<ArtifactPreviewResponse> {
  const response = await fetch(
    `${HISTORY_API_BASE}/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/preview`,
  );
  return parseJsonOrThrow<ArtifactPreviewResponse>(response);
}

export function getHistoryArtifactRawUrl(
  runId: string,
  artifactId: string,
  options?: { download?: boolean },
): string {
  const query = options?.download ? '?download=1' : '';
  return `${HISTORY_API_BASE}/runs/${encodeURIComponent(runId)}/artifacts/${encodeURIComponent(artifactId)}/raw${query}`;
}

export async function resumeHistoryRun(runId: string): Promise<{ ok: true }> {
  const response = await fetch(`${HISTORY_API_BASE}/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
  });
  return parseJsonOrThrow<{ ok: true }>(response);
}

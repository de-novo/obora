import { readFile } from 'node:fs/promises';

import type {
  ArtifactPreviewResponse,
  ArtifactRecord,
  CheckpointRecord,
  CostSummary,
  HistoryRunsQuery,
  HistoryRunsResponse,
  RunDetailResponse,
  RunRecord,
  StepRecord,
  StructuredAuditEvent,
} from '../../shared/history-types.js';

export type { ArtifactPreviewResponse, ArtifactRecord, HistoryRunsQuery, RunDetailResponse, RunRecord, StepRecord, CostSummary, StructuredAuditEvent, CheckpointRecord };
export type ListRunsResult = HistoryRunsResponse;

export interface HistoryStore {
  listRuns(query: HistoryRunsQuery): Promise<ListRunsResult>;
  getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null>;
  getArtifact(runId: string, artifactId: string): Promise<ArtifactRecord | null>;
  getArtifactPreview(runId: string, artifactId: string): Promise<ArtifactPreviewResponse | null>;
  resumeRun(runId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}

const toIsoBoundary = (value: string, boundary: 'start' | 'end'): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`;
  }
  return value;
};

type RepairLoopLike = import('../../shared/history-types.js').PersistedRepairLoopSummary;

const getRepairLoopSummary = (run: RunRecord): RepairLoopLike | undefined => {
  const metadata = run.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const repairLoop = (metadata as Record<string, unknown>).repairLoop;
  if (!repairLoop || typeof repairLoop !== 'object' || Array.isArray(repairLoop)) return undefined;
  return repairLoop as RepairLoopLike;
};

const matchesRepairLoopFilter = (run: RunRecord, filter: HistoryRunsQuery['repairLoop']): boolean => {
  if (!filter) return true;
  const summary = getRepairLoopSummary(run);
  switch (filter) {
    case 'with':
      return Boolean(summary);
    case 'without':
      return !summary;
    case 'stalled':
      return (summary?.repairNoProgress ?? 0) > 0;
    case 'exhausted':
      return (summary?.backEdgeExhausted ?? 0) > 0;
    default:
      return true;
  }
};

const getValidationFailedCount = (run: RunRecord): number => getRepairLoopSummary(run)?.validationFailed ?? 0;

const isPreviewableArtifact = (artifact: ArtifactRecord): boolean =>
  artifact.mimeType.startsWith('text/') ||
  artifact.mimeType === 'application/json' ||
  /\.(log|md|txt|json|yaml|yml)$/i.test(artifact.name);

const buildUnsupportedPreview = (artifact: ArtifactRecord, reason: string): ArtifactPreviewResponse => ({
  artifact,
  supported: false,
  reason,
});

const buildRepairLoopCounts = (rows: Array<{ run: RunRecord }>): NonNullable<HistoryRunsResponse['repairLoopCounts']> => ({
  all: rows.length,
  with: rows.filter((row) => matchesRepairLoopFilter(row.run, 'with')).length,
  without: rows.filter((row) => matchesRepairLoopFilter(row.run, 'without')).length,
  stalled: rows.filter((row) => matchesRepairLoopFilter(row.run, 'stalled')).length,
  exhausted: rows.filter((row) => matchesRepairLoopFilter(row.run, 'exhausted')).length,
});

export class AdapterHistoryStore implements HistoryStore {
  constructor(
    private readonly adapter: {
      listRuns: (query: Record<string, unknown>) => Promise<RunRecord[]>;
      getRun: (runId: string) => Promise<RunRecord | null>;
      getSteps: (runId: string) => Promise<StepRecord[]>;
      getArtifacts: (runId: string) => Promise<ArtifactRecord[]>;
      getRunCostSummary: (runId: string) => Promise<CostSummary>;
      getAuditTimeline: (runId: string) => Promise<StructuredAuditEvent[]>;
      getLatestCheckpoint: (runId: string) => Promise<CheckpointRecord | null>;
      saveRun: (run: RunRecord) => Promise<void>;
    },
    private readonly resumeExecutor?: (runId: string) => Promise<{ ok: true } | { ok: false; reason: string }>,
  ) {}

  async listRuns(query: HistoryRunsQuery): Promise<ListRunsResult> {
    const pageSize = 200;
    const maxTotalRuns = 10_000;
    const fetchRuns = async (fetchOffset: number, rawRuns: RunRecord[]): Promise<RunRecord[]> => {
      if (rawRuns.length >= maxTotalRuns) {
        return rawRuns;
      }

      const page = await this.adapter.listRuns({
        status: query.status,
        workflowName: query.workflowName,
        from: query.from ? toIsoBoundary(query.from, 'start') : undefined,
        to: query.to ? toIsoBoundary(query.to, 'end') : undefined,
        limit: pageSize,
        offset: fetchOffset,
      });
      const nextRuns = [...rawRuns, ...page];
      return page.length < pageSize ? nextRuns : fetchRuns(fetchOffset + pageSize, nextRuns);
    };
    const rawRuns = await fetchRuns(0, []);

    const rows = await Promise.all(
      rawRuns.map(async (run) => {
        const [steps, costSummary] = await Promise.all([
          this.adapter.getSteps(run.id),
          this.adapter.getRunCostSummary(run.id),
        ]);
        return { run, stepCount: steps.length, costSummary };
      }),
    );

    const baseFiltered = rows
      .filter((row) => (query.costMin === undefined ? true : row.costSummary.totalCostUsd >= query.costMin))
      .filter((row) => (query.costMax === undefined ? true : row.costSummary.totalCostUsd <= query.costMax));

    const repairLoopCounts = buildRepairLoopCounts(baseFiltered);

    const filtered = baseFiltered.filter((row) => matchesRepairLoopFilter(row.run, query.repairLoop));

    const sortBy = query.sortBy ?? 'startedAt';
    const sign = query.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'totalCostUsd') return (a.costSummary.totalCostUsd - b.costSummary.totalCostUsd) * sign;
      if (sortBy === 'validationFailed') return (getValidationFailedCount(a.run) - getValidationFailedCount(b.run)) * sign;
      const aValue = (sortBy === 'completedAt' ? a.run.completedAt : a.run.startedAt) ?? '';
      const bValue = (sortBy === 'completedAt' ? b.run.completedAt : b.run.startedAt) ?? '';
      return aValue.localeCompare(bValue) * sign;
    });

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    return {
      items: filtered.slice(offset, offset + limit).map((item) => ({
        ...item,
        repairLoop: getRepairLoopSummary(item.run),
      })),
      total: filtered.length,
      limit,
      offset,
      repairLoopCounts,
    };
  }

  async getArtifact(runId: string, artifactId: string): Promise<ArtifactRecord | null> {
    const artifacts = await this.adapter.getArtifacts(runId);
    return artifacts.find((item) => item.id === artifactId) ?? null;
  }

  async getArtifactPreview(runId: string, artifactId: string): Promise<ArtifactPreviewResponse | null> {
    const artifact = await this.getArtifact(runId, artifactId);
    if (!artifact) return null;
    if (!isPreviewableArtifact(artifact)) {
      return buildUnsupportedPreview(artifact, 'Preview is only supported for text-like artifacts');
    }

    try {
      const data = await readFile(artifact.storageRef, 'utf8');
      const maxChars = 20000;
      return {
        artifact,
        supported: true,
        contentType: artifact.mimeType,
        text: data.length > maxChars ? `${data.slice(0, maxChars)}\n...[truncated]` : data,
        truncated: data.length > maxChars,
      };
    } catch (error) {
      return buildUnsupportedPreview(
        artifact,
        error instanceof Error ? `Artifact read failed: ${error.message}` : 'Artifact read failed',
      );
    }
  }

  async getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null> {
    const run = await this.adapter.getRun(runId);
    if (!run) return null;

    const [steps, artifacts, costSummary, audits, checkpoint] = await Promise.all([
      this.adapter.getSteps(runId),
      this.adapter.getArtifacts(runId),
      this.adapter.getRunCostSummary(runId),
      this.adapter.getAuditTimeline(runId),
      this.adapter.getLatestCheckpoint(runId),
    ]);

    const auditLimit = options?.auditLimit ?? 100;
    const auditOffset = options?.auditOffset ?? 0;

    const sortedAudits = [...audits].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      run,
      steps,
      artifacts,
      costSummary,
      auditTimeline: sortedAudits.slice(auditOffset, auditOffset + auditLimit),
      checkpoints: checkpoint ? [checkpoint] : [],
      pagination: { auditTotal: sortedAudits.length, auditLimit, auditOffset },
    };
  }

  async resumeRun(runId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const run = await this.adapter.getRun(runId);
    if (!run) return { ok: false, reason: 'Run not found' };
    if (run.status !== 'suspended') return { ok: false, reason: 'Run is not suspended' };

    if (this.resumeExecutor) {
      const resumed = await this.resumeExecutor(runId);
      if (!resumed.ok) return resumed;
      return { ok: true };
    }

    await this.adapter.saveRun({ ...run, status: 'running', completedAt: undefined });
    return { ok: true };
  }
}

export class InMemoryHistoryStore implements HistoryStore {
  private readonly runs = new Map<string, RunRecord>();
  private readonly steps = new Map<string, StepRecord[]>();
  private readonly artifacts = new Map<string, import('../../shared/history-types.js').ArtifactRecord[]>();
  private readonly costs = new Map<string, CostSummary>();
  private readonly audits = new Map<string, StructuredAuditEvent[]>();
  private readonly checkpoints = new Map<string, CheckpointRecord[]>();

  seed(params: {
    runs?: RunRecord[];
    steps?: StepRecord[];
    artifacts?: import('../../shared/history-types.js').ArtifactRecord[];
    costs?: Array<{ runId: string; summary: CostSummary }>;
    audits?: StructuredAuditEvent[];
    checkpoints?: CheckpointRecord[];
  }): void {
    params.runs?.forEach((run) => this.runs.set(run.id, structuredClone(run)));
    params.steps?.forEach((step) => {
      const list = this.steps.get(step.runId) ?? [];
      list.push(structuredClone(step));
      this.steps.set(step.runId, list);
    });
    params.artifacts?.forEach((artifact) => {
      const list = this.artifacts.get(artifact.runId) ?? [];
      list.push(structuredClone(artifact));
      this.artifacts.set(artifact.runId, list);
    });
    params.costs?.forEach((cost) => this.costs.set(cost.runId, structuredClone(cost.summary)));
    params.audits?.forEach((event) => {
      const list = this.audits.get(event.runId) ?? [];
      list.push(structuredClone(event));
      this.audits.set(event.runId, list);
    });
    params.checkpoints?.forEach((cp) => {
      const list = this.checkpoints.get(cp.runId) ?? [];
      list.push(structuredClone(cp));
      this.checkpoints.set(cp.runId, list);
    });
  }

  async listRuns(query: HistoryRunsQuery): Promise<ListRunsResult> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const rows = Array.from(this.runs.values())
      .map((run) => ({
        run,
        stepCount: this.steps.get(run.id)?.length ?? 0,
        costSummary: this.costs.get(run.id) ?? { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] },
      }))
      .filter((row) => !query.status || row.run.status === query.status)
      .filter((row) => !query.workflowName || row.run.workflowName === query.workflowName)
      .filter((row) => !query.from || row.run.startedAt >= toIsoBoundary(query.from, 'start'))
      .filter((row) => !query.to || row.run.startedAt <= toIsoBoundary(query.to, 'end'))
      .filter((row) => query.costMin === undefined || row.costSummary.totalCostUsd >= query.costMin)
      .filter((row) => query.costMax === undefined || row.costSummary.totalCostUsd <= query.costMax);

    const repairLoopCounts = buildRepairLoopCounts(rows);
    const filteredRows = query.repairLoop
      ? rows.filter((row) => matchesRepairLoopFilter(row.run, query.repairLoop))
      : rows;

    const sortBy = query.sortBy ?? 'startedAt';
    const sign = query.sortOrder === 'asc' ? 1 : -1;
    const sortedRows = [...filteredRows].sort((a, b) => {
      if (sortBy === 'totalCostUsd') {
        return (a.costSummary.totalCostUsd - b.costSummary.totalCostUsd) * sign;
      }
      if (sortBy === 'validationFailed') {
        return (getValidationFailedCount(a.run) - getValidationFailedCount(b.run)) * sign;
      }
      const aValue = (sortBy === 'completedAt' ? a.run.completedAt : a.run.startedAt) ?? '';
      const bValue = (sortBy === 'completedAt' ? b.run.completedAt : b.run.startedAt) ?? '';
      return aValue.localeCompare(bValue) * sign;
    });

    return {
      items: sortedRows.slice(offset, offset + limit).map((row) => ({
        ...structuredClone(row),
        repairLoop: getRepairLoopSummary(row.run),
      })),
      total: sortedRows.length,
      limit,
      offset,
      repairLoopCounts,
    };
  }

  async getArtifact(runId: string, artifactId: string): Promise<ArtifactRecord | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    return structuredClone((this.artifacts.get(runId) ?? []).find((item) => item.id === artifactId) ?? null);
  }

  async getArtifactPreview(runId: string, artifactId: string): Promise<ArtifactPreviewResponse | null> {
    const artifact = await this.getArtifact(runId, artifactId);
    if (!artifact) return null;
    if (!isPreviewableArtifact(artifact)) {
      return buildUnsupportedPreview(structuredClone(artifact), 'Preview is only supported for text-like artifacts');
    }

    try {
      const data = await readFile(artifact.storageRef, 'utf8');
      const maxChars = 20000;
      return {
        artifact: structuredClone(artifact),
        supported: true,
        contentType: artifact.mimeType,
        text: data.length > maxChars ? `${data.slice(0, maxChars)}\n...[truncated]` : data,
        truncated: data.length > maxChars,
      };
    } catch (error) {
      return buildUnsupportedPreview(
        structuredClone(artifact),
        error instanceof Error ? `Artifact read failed: ${error.message}` : 'Artifact read failed',
      );
    }
  }

  async getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null> {
    const run = this.runs.get(runId);
    if (!run) return null;

    const auditLimit = options?.auditLimit ?? 100;
    const auditOffset = options?.auditOffset ?? 0;
    const allAudit = [...(this.audits.get(runId) ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      run: structuredClone(run),
      repairLoop: getRepairLoopSummary(run),
      steps: [...(this.steps.get(runId) ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((s) => structuredClone(s)),
      artifacts: [...(this.artifacts.get(runId) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((artifact) => structuredClone(artifact)),
      costSummary: structuredClone(this.costs.get(runId) ?? { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] }),
      auditTimeline: allAudit.slice(auditOffset, auditOffset + auditLimit).map((e) => structuredClone(e)),
      checkpoints: [...(this.checkpoints.get(runId) ?? [])]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((cp) => structuredClone(cp)),
      pagination: {
        auditTotal: allAudit.length,
        auditLimit,
        auditOffset,
      },
    };
  }

  async resumeRun(runId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const run = this.runs.get(runId);
    if (!run) return { ok: false, reason: 'Run not found' };
    if (run.status !== 'suspended') return { ok: false, reason: 'Run is not suspended' };

    this.runs.set(runId, { ...run, status: 'running', completedAt: undefined });
    return { ok: true };
  }
}

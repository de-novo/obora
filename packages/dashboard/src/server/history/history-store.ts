import type {
  CheckpointRecord,
  CostSummary,
  HistoryRunsQuery,
  HistoryRunsResponse,
  RunDetailResponse,
  RunRecord,
  StepRecord,
  StructuredAuditEvent,
} from '../../shared/history-types.js';

export type { HistoryRunsQuery, RunDetailResponse, RunRecord, StepRecord, CostSummary, StructuredAuditEvent, CheckpointRecord };
export type ListRunsResult = HistoryRunsResponse;

export interface HistoryStore {
  listRuns(query: HistoryRunsQuery): Promise<ListRunsResult>;
  getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null>;
  resumeRun(runId: string): Promise<{ ok: true } | { ok: false; reason: string }>;
}

const toIsoBoundary = (value: string, boundary: 'start' | 'end'): string => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T${boundary === 'start' ? '00:00:00.000' : '23:59:59.999'}Z`;
  }
  return value;
};

export class AdapterHistoryStore implements HistoryStore {
  constructor(
    private readonly adapter: {
      listRuns: (query: Record<string, unknown>) => Promise<RunRecord[]>;
      getRun: (runId: string) => Promise<RunRecord | null>;
      getSteps: (runId: string) => Promise<StepRecord[]>;
      getRunCostSummary: (runId: string) => Promise<CostSummary>;
      getAuditTimeline: (runId: string) => Promise<StructuredAuditEvent[]>;
      getLatestCheckpoint: (runId: string) => Promise<CheckpointRecord | null>;
      saveRun: (run: RunRecord) => Promise<void>;
    },
    private readonly resumeExecutor?: (runId: string) => Promise<{ ok: true } | { ok: false; reason: string }>,
  ) {}

  async listRuns(query: HistoryRunsQuery): Promise<ListRunsResult> {
    const pageSize = 200;
    const rawRuns: RunRecord[] = [];
    let fetchOffset = 0;

    while (true) {
      const page = await this.adapter.listRuns({
        status: query.status,
        workflowName: query.workflowName,
        from: query.from ? toIsoBoundary(query.from, 'start') : undefined,
        to: query.to ? toIsoBoundary(query.to, 'end') : undefined,
        limit: pageSize,
        offset: fetchOffset,
      });
      rawRuns.push(...page);
      if (page.length < pageSize) break;
      fetchOffset += pageSize;
    }

    const rows = await Promise.all(
      rawRuns.map(async (run) => {
        const [steps, costSummary] = await Promise.all([
          this.adapter.getSteps(run.id),
          this.adapter.getRunCostSummary(run.id),
        ]);
        return { run, stepCount: steps.length, costSummary };
      }),
    );

    const filtered = rows
      .filter((row) => (query.costMin === undefined ? true : row.costSummary.totalCostUsd >= query.costMin))
      .filter((row) => (query.costMax === undefined ? true : row.costSummary.totalCostUsd <= query.costMax));

    const sortBy = query.sortBy ?? 'startedAt';
    const sign = query.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      if (sortBy === 'totalCostUsd') return (a.costSummary.totalCostUsd - b.costSummary.totalCostUsd) * sign;
      const aValue = (sortBy === 'completedAt' ? a.run.completedAt : a.run.startedAt) ?? '';
      const bValue = (sortBy === 'completedAt' ? b.run.completedAt : b.run.startedAt) ?? '';
      return aValue.localeCompare(bValue) * sign;
    });

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    return { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset };
  }

  async getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null> {
    const run = await this.adapter.getRun(runId);
    if (!run) return null;

    const [steps, costSummary, audits, checkpoint] = await Promise.all([
      this.adapter.getSteps(runId),
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
  private readonly costs = new Map<string, CostSummary>();
  private readonly audits = new Map<string, StructuredAuditEvent[]>();
  private readonly checkpoints = new Map<string, CheckpointRecord[]>();

  seed(params: {
    runs?: RunRecord[];
    steps?: StepRecord[];
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

    let rows = Array.from(this.runs.values()).map((run) => ({
      run,
      stepCount: this.steps.get(run.id)?.length ?? 0,
      costSummary: this.costs.get(run.id) ?? { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] },
    }));

    if (query.status) rows = rows.filter((row) => row.run.status === query.status);
    if (query.workflowName) rows = rows.filter((row) => row.run.workflowName === query.workflowName);
    if (query.from) rows = rows.filter((row) => row.run.startedAt >= toIsoBoundary(query.from!, 'start'));
    if (query.to) rows = rows.filter((row) => row.run.startedAt <= toIsoBoundary(query.to!, 'end'));
    if (query.costMin !== undefined) rows = rows.filter((row) => row.costSummary.totalCostUsd >= query.costMin!);
    if (query.costMax !== undefined) rows = rows.filter((row) => row.costSummary.totalCostUsd <= query.costMax!);

    const sortBy = query.sortBy ?? 'startedAt';
    const sign = query.sortOrder === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      if (sortBy === 'totalCostUsd') {
        return (a.costSummary.totalCostUsd - b.costSummary.totalCostUsd) * sign;
      }
      const aValue = (sortBy === 'completedAt' ? a.run.completedAt : a.run.startedAt) ?? '';
      const bValue = (sortBy === 'completedAt' ? b.run.completedAt : b.run.startedAt) ?? '';
      return aValue.localeCompare(bValue) * sign;
    });

    return {
      items: rows.slice(offset, offset + limit).map((row) => structuredClone(row)),
      total: rows.length,
      limit,
      offset,
    };
  }

  async getRunDetail(runId: string, options?: { auditLimit?: number; auditOffset?: number }): Promise<RunDetailResponse | null> {
    const run = this.runs.get(runId);
    if (!run) return null;

    const auditLimit = options?.auditLimit ?? 100;
    const auditOffset = options?.auditOffset ?? 0;
    const allAudit = [...(this.audits.get(runId) ?? [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    return {
      run: structuredClone(run),
      steps: [...(this.steps.get(runId) ?? [])].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((s) => structuredClone(s)),
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

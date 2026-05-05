import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AdapterHistoryStore,
  InMemoryHistoryStore,
  type ArtifactRecord,
  type CheckpointRecord,
  type CostSummary,
  type RunRecord,
  type StepRecord,
  type StructuredAuditEvent,
} from '../history/history-store.js';
import type { PersistedRepairLoopSummary } from '../../shared/history-types.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

const cost = (totalCostUsd: number, totalTokens = 0): CostSummary => ({
  totalTokens,
  totalCostUsd,
  byStep: [],
  byModel: [],
});

const repairLoop = (overrides: Partial<PersistedRepairLoopSummary> = {}): PersistedRepairLoopSummary => ({
  validationFailed: 0,
  validationPassed: 0,
  repairStarted: 0,
  repairCompleted: 0,
  repairNoProgress: 0,
  backEdgeTriggered: 0,
  backEdgeExhausted: 0,
  recentValidationFailures: [],
  ...overrides,
});

const run = (id: string, startedAt: string, overrides: Partial<RunRecord> = {}): RunRecord => ({
  id,
  workflowName: 'wf',
  status: 'completed',
  input: {},
  startedAt,
  ...overrides,
});

const step = (id: string, runId: string, stepName = id): StepRecord => ({
  id,
  runId,
  stepName,
  status: 'completed',
  startedAt: '2026-02-18T00:00:00.000Z',
});

const artifact = (
  id: string,
  storageRef: string,
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord => ({
  id,
  runId: 'run-1',
  stepName: 'draft',
  name: `${id}.txt`,
  mimeType: 'text/plain',
  sizeBytes: 10,
  storageRef,
  createdAt: '2026-02-18T00:00:00.000Z',
  ...overrides,
});

const audit = (id: string, timestamp: string): StructuredAuditEvent => ({
  id,
  runId: 'run-1',
  stepName: 'draft',
  timestamp,
  category: 'execution',
  action: 'step',
  actor: 'system',
  detail: {},
});

describe('history store', () => {
  it('applies in-memory date boundaries, cost filters, repair-loop counts, and validation sorting', async () => {
    const store = new InMemoryHistoryStore();
    store.seed({
      runs: [
        run('start', '2026-02-18T00:00:00.000Z'),
        run('middle', '2026-02-18T12:00:00.000Z', {
          metadata: { repairLoop: repairLoop({ validationFailed: 2, repairStarted: 1, repairNoProgress: 1 }) },
        }),
        run('end', '2026-02-18T23:59:59.999Z', {
          metadata: { repairLoop: repairLoop({ validationFailed: 5, backEdgeExhausted: 1 }) },
        }),
        run('outside', '2026-02-19T00:00:00.000Z'),
      ],
      steps: [step('s1', 'start'), step('s2', 'middle'), step('s3', 'end')],
      costs: [
        { runId: 'start', summary: cost(1) },
        { runId: 'middle', summary: cost(5) },
        { runId: 'end', summary: cost(8) },
        { runId: 'outside', summary: cost(13) },
      ],
    });

    const day = await store.listRuns({
      from: '2026-02-18',
      to: '2026-02-18',
      sortBy: 'startedAt',
      sortOrder: 'asc',
    });
    expect(day.items.map((item) => item.run.id)).toEqual(['start', 'middle', 'end']);
    expect(day.repairLoopCounts).toEqual({ all: 3, with: 2, without: 1, stalled: 1, exhausted: 1 });

    const costFiltered = await store.listRuns({ costMin: 2, costMax: 10, sortBy: 'totalCostUsd', sortOrder: 'asc' });
    expect(costFiltered.items.map((item) => item.run.id)).toEqual(['middle', 'end']);

    const withRepairSorted = await store.listRuns({ repairLoop: 'with', sortBy: 'validationFailed', sortOrder: 'desc' });
    expect(withRepairSorted.items.map((item) => item.run.id)).toEqual(['end', 'middle']);

    const exhausted = await store.listRuns({ repairLoop: 'exhausted' });
    expect(exhausted.items.map((item) => item.run.id)).toEqual(['end']);
  });

  it('passes normalized date boundaries to adapter-backed listings and filters adapter rows', async () => {
    const adapterRuns = [
      run('plain', '2026-02-18T00:00:00.000Z'),
      run('repair', '2026-02-18T00:01:00.000Z', {
        metadata: { repairLoop: repairLoop({ validationFailed: 1, repairNoProgress: 1 }) },
      }),
      run('expensive', '2026-02-18T00:02:00.000Z', {
        metadata: { repairLoop: repairLoop({ validationFailed: 4, backEdgeExhausted: 1 }) },
      }),
    ];
    const costs = new Map([
      ['plain', cost(3)],
      ['repair', cost(5)],
      ['expensive', cost(9)],
    ]);

    const adapter = {
      listRuns: vi.fn(async () => adapterRuns),
      getRun: vi.fn(async () => null),
      getSteps: vi.fn(async (runId: string) => [step(`${runId}-step`, runId)]),
      getArtifacts: vi.fn(async () => []),
      getRunCostSummary: vi.fn(async (runId: string) => costs.get(runId) ?? cost(0)),
      getAuditTimeline: vi.fn(async () => []),
      getLatestCheckpoint: vi.fn(async () => null),
      saveRun: vi.fn(async () => undefined),
    };
    const store = new AdapterHistoryStore(adapter);

    const result = await store.listRuns({
      from: '2026-02-18',
      to: '2026-02-18',
      costMin: 4,
      costMax: 6,
      repairLoop: 'with',
      sortBy: 'validationFailed',
      sortOrder: 'asc',
    });

    expect(adapter.listRuns).toHaveBeenCalledWith({
      status: undefined,
      workflowName: undefined,
      from: '2026-02-18T00:00:00.000Z',
      to: '2026-02-18T23:59:59.999Z',
      limit: 200,
      offset: 0,
    });
    expect(result.items.map((item) => item.run.id)).toEqual(['repair']);
    expect(result.items[0]?.repairLoop?.repairNoProgress).toBe(1);
    expect(result.repairLoopCounts).toEqual({ all: 1, with: 1, without: 0, stalled: 1, exhausted: 0 });
  });

  it('returns adapter-backed details with sorted audit pagination and checkpoint state', async () => {
    const checkpoint: CheckpointRecord = {
      id: 'cp-1',
      runId: 'run-1',
      stepName: 'draft',
      stateSnapshot: { ok: true },
      completedSteps: ['draft'],
      policyHash: 'policy',
      createdAt: '2026-02-18T00:02:00.000Z',
    };
    const adapter = {
      listRuns: vi.fn(async () => []),
      getRun: vi.fn(async () => run('run-1', '2026-02-18T00:00:00.000Z')),
      getSteps: vi.fn(async () => [step('step-1', 'run-1')]),
      getArtifacts: vi.fn(async () => []),
      getRunCostSummary: vi.fn(async () => cost(1, 100)),
      getAuditTimeline: vi.fn(async () => [
        audit('late', '2026-02-18T00:02:00.000Z'),
        audit('early', '2026-02-18T00:00:00.000Z'),
        audit('middle', '2026-02-18T00:01:00.000Z'),
      ]),
      getLatestCheckpoint: vi.fn(async () => checkpoint),
      saveRun: vi.fn(async () => undefined),
    };
    const store = new AdapterHistoryStore(adapter);

    const detail = await store.getRunDetail('run-1', { auditLimit: 1, auditOffset: 1 });

    expect(detail?.auditTimeline.map((event) => event.id)).toEqual(['middle']);
    expect(detail?.pagination).toEqual({ auditTotal: 3, auditLimit: 1, auditOffset: 1 });
    expect(detail?.checkpoints).toEqual([checkpoint]);
  });

  it('previews text-like artifacts, truncates long content, and reports unsupported/read failures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obora-history-store-'));
    tempDirs.push(dir);
    const longPath = join(dir, 'large.log');
    await writeFile(longPath, 'a'.repeat(20_010), 'utf8');

    const artifacts = [
      artifact('large', longPath, { name: 'large.log', mimeType: 'application/octet-stream', sizeBytes: 20_010 }),
      artifact('binary', join(dir, 'binary.png'), { name: 'binary.png', mimeType: 'image/png' }),
      artifact('missing', join(dir, 'missing.txt'), { name: 'missing.txt', mimeType: 'text/plain' }),
    ];
    const adapter = {
      listRuns: vi.fn(async () => []),
      getRun: vi.fn(async () => run('run-1', '2026-02-18T00:00:00.000Z')),
      getSteps: vi.fn(async () => []),
      getArtifacts: vi.fn(async () => artifacts),
      getRunCostSummary: vi.fn(async () => cost(0)),
      getAuditTimeline: vi.fn(async () => []),
      getLatestCheckpoint: vi.fn(async () => null),
      saveRun: vi.fn(async () => undefined),
    };
    const store = new AdapterHistoryStore(adapter);

    const large = await store.getArtifactPreview('run-1', 'large');
    expect(large?.supported).toBe(true);
    expect(large?.truncated).toBe(true);
    expect(large?.text?.endsWith('\n...[truncated]')).toBe(true);

    const unsupported = await store.getArtifactPreview('run-1', 'binary');
    expect(unsupported).toMatchObject({
      supported: false,
      reason: 'Preview is only supported for text-like artifacts',
    });

    const missing = await store.getArtifactPreview('run-1', 'missing');
    expect(missing?.supported).toBe(false);
    expect(missing?.reason).toContain('Artifact read failed:');
  });

  it('handles resume branches for missing, completed, executor failure, executor success, and fallback save', async () => {
    const runs = new Map<string, RunRecord>([
      ['completed', run('completed', '2026-02-18T00:00:00.000Z')],
      ['suspended', run('suspended', '2026-02-18T00:00:00.000Z', { status: 'suspended', completedAt: '2026-02-18T00:10:00.000Z' })],
    ]);
    const adapter = {
      listRuns: vi.fn(async () => []),
      getRun: vi.fn(async (runId: string) => runs.get(runId) ?? null),
      getSteps: vi.fn(async () => []),
      getArtifacts: vi.fn(async () => []),
      getRunCostSummary: vi.fn(async () => cost(0)),
      getAuditTimeline: vi.fn(async () => []),
      getLatestCheckpoint: vi.fn(async () => null),
      saveRun: vi.fn(async (updated: RunRecord) => {
        runs.set(updated.id, updated);
      }),
    };

    const store = new AdapterHistoryStore(adapter);
    await expect(store.resumeRun('missing')).resolves.toEqual({ ok: false, reason: 'Run not found' });
    await expect(store.resumeRun('completed')).resolves.toEqual({ ok: false, reason: 'Run is not suspended' });
    await expect(store.resumeRun('suspended')).resolves.toEqual({ ok: true });
    expect(adapter.saveRun).toHaveBeenCalledWith(expect.objectContaining({ id: 'suspended', status: 'running', completedAt: undefined }));

    runs.set('suspended', run('suspended', '2026-02-18T00:00:00.000Z', { status: 'suspended' }));
    const failedExecutorStore = new AdapterHistoryStore(adapter, async () => ({ ok: false, reason: 'policy drift' }));
    await expect(failedExecutorStore.resumeRun('suspended')).resolves.toEqual({ ok: false, reason: 'policy drift' });

    runs.set('suspended', run('suspended', '2026-02-18T00:00:00.000Z', { status: 'suspended' }));
    const successExecutorStore = new AdapterHistoryStore(adapter, async () => ({ ok: true }));
    await expect(successExecutorStore.resumeRun('suspended')).resolves.toEqual({ ok: true });
  });

  it('paginates adapter listings and keeps default filters open', async () => {
    const firstPage = Array.from({ length: 200 }, (_value, index) =>
      run(`run-${String(index).padStart(3, '0')}`, `2026-02-18T00:${String(index % 60).padStart(2, '0')}:00.000Z`, {
        metadata: index === 1 ? { repairLoop: [] } : undefined,
      }),
    );
    const listRuns = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([run('run-200', '2026-02-18T01:00:00.000Z')]);
    const adapter = {
      listRuns,
      getRun: vi.fn(async () => null),
      getSteps: vi.fn(async () => []),
      getArtifacts: vi.fn(async () => []),
      getRunCostSummary: vi.fn(async () => cost(0)),
      getAuditTimeline: vi.fn(async () => []),
      getLatestCheckpoint: vi.fn(async () => null),
      saveRun: vi.fn(async () => undefined),
    };
    const store = new AdapterHistoryStore(adapter);

    const result = await store.listRuns({ limit: 2, offset: 1, sortBy: 'completedAt', sortOrder: 'asc' });

    expect(listRuns).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ from: undefined, to: undefined, limit: 200, offset: 0 }),
    );
    expect(listRuns).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ from: undefined, to: undefined, limit: 200, offset: 200 }),
    );
    expect(result.total).toBe(201);
    expect(result.items).toHaveLength(2);
    expect(result.repairLoopCounts?.with).toBe(0);
  });

  it('covers in-memory default detail, artifact, preview, and resume branches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obora-history-memory-'));
    tempDirs.push(dir);
    const textPath = join(dir, 'note.md');
    await writeFile(textPath, 'short note', 'utf8');

    const store = new InMemoryHistoryStore();
    store.seed({
      runs: [
        run('sparse', '2026-02-18T00:00:00.000Z', {
          status: 'suspended',
          completedAt: '2026-02-18T00:10:00.000Z',
          metadata: { repairLoop: [] },
        }),
        run('done', '2026-02-18T00:01:00.000Z'),
      ],
      steps: [
        step('late', 'sparse', 'late'),
        { ...step('early', 'sparse', 'early'), startedAt: '2026-02-17T23:59:00.000Z' },
      ],
      artifacts: [
        artifact('text', textPath, { runId: 'sparse', name: 'note.md', mimeType: 'application/octet-stream' }),
        artifact('binary', join(dir, 'image.bin'), { runId: 'sparse', name: 'image.bin', mimeType: 'application/octet-stream' }),
      ],
      audits: [
        { ...audit('audit-late', '2026-02-18T00:02:00.000Z'), runId: 'sparse' },
        { ...audit('audit-early', '2026-02-18T00:01:00.000Z'), runId: 'sparse' },
      ],
      checkpoints: [
        {
          id: 'old-cp',
          runId: 'sparse',
          stepName: 'early',
          stateSnapshot: {},
          completedSteps: [],
          policyHash: 'old',
          createdAt: '2026-02-18T00:01:00.000Z',
        },
        {
          id: 'new-cp',
          runId: 'sparse',
          stepName: 'late',
          stateSnapshot: {},
          completedSteps: [],
          policyHash: 'new',
          createdAt: '2026-02-18T00:02:00.000Z',
        },
      ],
    });

    await expect(store.getRunDetail('missing')).resolves.toBeNull();

    const detail = await store.getRunDetail('sparse');
    expect(detail?.repairLoop).toBeUndefined();
    expect(detail?.steps.map((item) => item.id)).toEqual(['early', 'late']);
    expect(detail?.artifacts.map((item) => item.id)).toEqual(['text', 'binary']);
    expect(detail?.checkpoints.map((item) => item.id)).toEqual(['new-cp', 'old-cp']);
    expect(detail?.pagination).toEqual({ auditTotal: 2, auditLimit: 100, auditOffset: 0 });

    await expect(store.getArtifact('missing-run', 'text')).resolves.toBeNull();
    await expect(store.getArtifactPreview('sparse', 'missing-artifact')).resolves.toBeNull();

    const textPreview = await store.getArtifactPreview('sparse', 'text');
    expect(textPreview).toMatchObject({ supported: true, text: 'short note', truncated: false });

    const binaryPreview = await store.getArtifactPreview('sparse', 'binary');
    expect(binaryPreview).toMatchObject({
      supported: false,
      reason: 'Preview is only supported for text-like artifacts',
    });

    await expect(store.resumeRun('missing')).resolves.toEqual({ ok: false, reason: 'Run not found' });
    await expect(store.resumeRun('done')).resolves.toEqual({ ok: false, reason: 'Run is not suspended' });
    await expect(store.resumeRun('sparse')).resolves.toEqual({ ok: true });
    const resumed = await store.getRunDetail('sparse');
    expect(resumed?.run).toMatchObject({ status: 'running', completedAt: undefined });
  });

  it('applies in-memory status, workflow, ISO date, cost, and completedAt filters', async () => {
    const store = new InMemoryHistoryStore();
    store.seed({
      runs: [
        run('a', '2026-02-18T00:00:00.000Z', {
          workflowName: 'alpha',
          status: 'running',
          completedAt: '2026-02-18T00:10:00.000Z',
        }),
        run('b', '2026-02-18T01:00:00.000Z', {
          workflowName: 'beta',
          status: 'completed',
          completedAt: '2026-02-18T01:10:00.000Z',
          metadata: { repairLoop: repairLoop({ validationFailed: 1 }) },
        }),
        run('c', '2026-02-18T02:00:00.000Z', {
          workflowName: 'alpha',
          status: 'completed',
          completedAt: undefined,
          metadata: { repairLoop: [] },
        }),
      ],
      costs: [
        { runId: 'a', summary: cost(2) },
        { runId: 'b', summary: cost(4) },
        { runId: 'c', summary: cost(6) },
      ],
    });

    const filtered = await store.listRuns({
      status: 'completed',
      workflowName: 'alpha',
      from: '2026-02-18T00:30:00.000Z',
      to: '2026-02-18T02:30:00.000Z',
      costMin: 5,
      costMax: 6,
      repairLoop: 'without',
      sortBy: 'completedAt',
      sortOrder: 'desc',
    });

    expect(filtered.items.map((item) => item.run.id)).toEqual(['c']);
    expect(filtered.repairLoopCounts).toEqual({ all: 1, with: 0, without: 1, stalled: 0, exhausted: 0 });
  });
});

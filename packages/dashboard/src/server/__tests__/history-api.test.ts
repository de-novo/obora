import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { InMemoryHistoryStore } from '../history/history-store.js';
import { createQuietDashboardServer as createDashboardServer } from './test-server.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all([servers.map((server) => server.close()), tempDirs.map((dir) => rm(dir, { recursive: true, force: true }))].flat());
  servers.length = 0;
  tempDirs.length = 0;
});

describe('history routes', () => {
  it('lists runs with filter and pagination', async () => {
    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [
        { id: 'run-1', workflowName: 'wf-a', status: 'completed', input: {}, startedAt: '2026-02-18T00:00:00.000Z' },
        { id: 'run-2', workflowName: 'wf-b', status: 'suspended', input: {}, startedAt: '2026-02-17T00:00:00.000Z' },
      ],
      costs: [
        { runId: 'run-1', summary: { totalTokens: 100, totalCostUsd: 1.2, byStep: [], byModel: [] } },
        { runId: 'run-2', summary: { totalTokens: 200, totalCostUsd: 2.5, byStep: [], byModel: [] } },
      ],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/history/runs?status=suspended&limit=10&offset=0',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { items: Array<{ run: { id: string } }>; total: number };
    expect(body.total).toBe(1);
    expect(body.items[0]?.run.id).toBe('run-2');
  });

  it('filters and sorts runs by repair-loop metadata', async () => {
    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [
        {
          id: 'run-1',
          workflowName: 'wf-a',
          status: 'completed',
          input: {},
          startedAt: '2026-02-18T00:00:00.000Z',
          metadata: {
            repairLoop: {
              validationFailed: 3,
              validationPassed: 1,
              repairStarted: 3,
              repairCompleted: 3,
              repairNoProgress: 0,
              backEdgeTriggered: 3,
              backEdgeExhausted: 0,
              recentValidationFailures: [],
            },
          },
        },
        {
          id: 'run-2',
          workflowName: 'wf-b',
          status: 'completed',
          input: {},
          startedAt: '2026-02-17T00:00:00.000Z',
          metadata: {
            repairLoop: {
              validationFailed: 1,
              validationPassed: 1,
              repairStarted: 1,
              repairCompleted: 1,
              repairNoProgress: 1,
              backEdgeTriggered: 1,
              backEdgeExhausted: 0,
              recentValidationFailures: [],
            },
          },
        },
        { id: 'run-3', workflowName: 'wf-c', status: 'completed', input: {}, startedAt: '2026-02-16T00:00:00.000Z' },
      ],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const stalled = await app.inject({
      method: 'GET',
      url: '/api/history/runs?repairLoop=stalled&sortBy=validationFailed&sortOrder=desc',
    });
    expect(stalled.statusCode).toBe(200);
    const stalledBody = stalled.json() as { items: Array<{ run: { id: string } }>; total: number };
    expect(stalledBody.total).toBe(1);
    expect(stalledBody.items[0]?.run.id).toBe('run-2');

    const withRepairLoop = await app.inject({
      method: 'GET',
      url: '/api/history/runs?repairLoop=with&sortBy=validationFailed&sortOrder=desc',
    });
    expect(withRepairLoop.statusCode).toBe(200);
    const withBody = withRepairLoop.json() as {
      items: Array<{
        run: { id: string };
        repairLoop?: { validationFailed?: number; repairNoProgress?: number };
      }>;
      total: number;
      repairLoopCounts?: { all: number; with: number; without: number; stalled: number; exhausted: number };
    };
    expect(withBody.total).toBe(2);
    expect(withBody.items[0]?.run.id).toBe('run-1');
    expect(withBody.items[1]?.run.id).toBe('run-2');
    expect(withBody.items[0]?.repairLoop?.validationFailed).toBe(3);
    expect(withBody.items[1]?.repairLoop?.repairNoProgress).toBe(1);
    expect(withBody.repairLoopCounts).toEqual({
      all: 3,
      with: 2,
      without: 1,
      stalled: 1,
      exhausted: 0,
    });
    
    const withoutRepairLoop = await app.inject({
      method: 'GET',
      url: '/api/history/runs?repairLoop=without',
    });
    expect(withoutRepairLoop.statusCode).toBe(200);
    const withoutBody = withoutRepairLoop.json() as { items: Array<{ run: { id: string } }>; total: number };
    expect(withoutBody.total).toBe(1);
    expect(withoutBody.items[0]?.run.id).toBe('run-3');
  });

  it('returns 400 when costMin or costMax is not a finite number', async () => {
    const { app } = await createDashboardServer({}, { historyStore: new InMemoryHistoryStore() });
    servers.push(app);

    const invalidCases = ['costMin=NaN', 'costMin=abc', 'costMax=NaN', 'costMax=xyz'];
    for (const query of invalidCases) {
      const response = await app.inject({ method: 'GET', url: `/api/history/runs?${query}` });
      expect(response.statusCode).toBe(400);
    }
  });

  it('returns 400 when list pagination query is outside bounds', async () => {
    const { app } = await createDashboardServer({}, { historyStore: new InMemoryHistoryStore() });
    servers.push(app);

    const invalidCases = [
      ['limit=0', 'limit must be between 1 and 100'],
      ['limit=101', 'limit must be between 1 and 100'],
      ['limit=1.5', 'Expected integer'],
      ['offset=-1', 'offset must be greater than or equal to 0'],
    ];

    for (const [query, message] of invalidCases) {
      const response = await app.inject({ method: 'GET', url: `/api/history/runs?${query}` });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'DASH_7001', message });
    }
  });

  it('returns run detail with audit pagination', async () => {
    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [{ id: 'run-1', workflowName: 'wf-a', status: 'completed', input: {}, startedAt: '2026-02-18T00:00:00.000Z' }],
      steps: [
        { id: 'step-1', runId: 'run-1', stepName: 'draft', status: 'completed', startedAt: '2026-02-18T00:00:00.000Z' },
      ],
      audits: [
        {
          id: 'a1',
          runId: 'run-1',
          stepName: 'draft',
          timestamp: '2026-02-18T00:00:00.000Z',
          category: 'execution',
          action: 'step_start',
          actor: 'system',
          detail: {},
        },
      ],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-1?auditLimit=1&auditOffset=0',
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { run: { id: string }; auditTimeline: unknown[]; pagination?: { auditTotal: number } };
    expect(body.run.id).toBe('run-1');
    expect(body.auditTimeline).toHaveLength(1);
    expect(body.pagination?.auditTotal).toBe(1);
  });

  it('validates run detail audit pagination query', async () => {
    const { app } = await createDashboardServer({}, { historyStore: new InMemoryHistoryStore() });
    servers.push(app);

    const invalidCases = [
      ['auditLimit=0', 'auditLimit must be between 1 and 500'],
      ['auditLimit=501', 'auditLimit must be between 1 and 500'],
      ['auditLimit=abc', 'Expected integer'],
      ['auditOffset=-1', 'auditOffset must be greater than or equal to 0'],
    ];

    for (const [query, message] of invalidCases) {
      const response = await app.inject({ method: 'GET', url: `/api/history/runs/run-1?${query}` });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'DASH_7001', message });
    }
  });

  it('serves artifact preview and raw content branches', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'obora-dashboard-artifact-'));
    tempDirs.push(dir);
    const artifactPath = join(dir, 'result.txt');
    await writeFile(artifactPath, 'artifact text', 'utf8');

    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [{ id: 'run-artifact', workflowName: 'wf-a', status: 'completed', input: {}, startedAt: '2026-02-18T00:00:00.000Z' }],
      artifacts: [
        {
          id: 'artifact-1',
          runId: 'run-artifact',
          stepName: 'draft',
          name: 'result.txt',
          mimeType: 'text/plain',
          sizeBytes: 13,
          storageRef: artifactPath,
          createdAt: '2026-02-18T00:00:00.000Z',
        },
        {
          id: 'missing-file',
          runId: 'run-artifact',
          stepName: 'draft',
          name: 'missing.txt',
          mimeType: 'text/plain',
          sizeBytes: 1,
          storageRef: join(dir, 'missing.txt'),
          createdAt: '2026-02-18T00:00:00.000Z',
        },
      ],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const missingPreview = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/nope/preview',
    });
    expect(missingPreview.statusCode).toBe(404);

    const preview = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/artifact-1/preview',
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({ supported: true, text: 'artifact text' });

    const inlineRaw = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/artifact-1/raw',
    });
    expect(inlineRaw.statusCode).toBe(200);
    expect(inlineRaw.headers['content-type']).toContain('text/plain');
    expect(inlineRaw.headers['content-disposition']).toBe('inline; filename="result.txt"');
    expect(inlineRaw.body).toBe('artifact text');

    const downloadRaw = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/artifact-1/raw?download=1',
    });
    expect(downloadRaw.headers['content-disposition']).toBe('attachment; filename="result.txt"');

    const missingRaw = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/nope/raw',
    });
    expect(missingRaw.statusCode).toBe(404);

    const readFailure = await app.inject({
      method: 'GET',
      url: '/api/history/runs/run-artifact/artifacts/missing-file/raw',
    });
    expect(readFailure.statusCode).toBe(404);
    expect(readFailure.json().message).toContain('Artifact read failed');
  });

  it('supports encoded runId in detail and resume routes', async () => {
    const encodedRunId = 'run:특수 id +@#';
    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [{ id: encodedRunId, workflowName: 'wf-a', status: 'suspended', input: {}, startedAt: '2026-02-18T00:00:00.000Z' }],
      steps: [{ id: 'step-1', runId: encodedRunId, stepName: 'draft', status: 'completed', startedAt: '2026-02-18T00:00:00.000Z' }],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const detail = await app.inject({
      method: 'GET',
      url: `/api/history/runs/${encodeURIComponent(encodedRunId)}`,
    });
    expect(detail.statusCode).toBe(200);
    expect((detail.json() as { run: { id: string } }).run.id).toBe(encodedRunId);

    const resume = await app.inject({
      method: 'POST',
      url: `/api/history/runs/${encodeURIComponent(encodedRunId)}/resume`,
    });
    expect(resume.statusCode).toBe(200);
  });

  it('resumes suspended run', async () => {    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [{ id: 'run-2', workflowName: 'wf-b', status: 'suspended', input: {}, startedAt: '2026-02-17T00:00:00.000Z' }],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/api/history/runs/run-2/resume',
    });

    expect(response.statusCode).toBe(200);
    const updated = await app.inject({ method: 'GET', url: '/api/history/runs?status=running' });
    const body = updated.json() as { total: number };
    expect(body.total).toBe(1);
  });

  it('returns 400 for invalid resume target', async () => {
    const historyStore = new InMemoryHistoryStore();
    historyStore.seed({
      runs: [{ id: 'run-1', workflowName: 'wf-a', status: 'completed', input: {}, startedAt: '2026-02-18T00:00:00.000Z' }],
    });

    const { app } = await createDashboardServer({}, { historyStore });
    servers.push(app);

    const response = await app.inject({ method: 'POST', url: '/api/history/runs/run-1/resume' });
    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when resume target run does not exist', async () => {
    const { app } = await createDashboardServer({}, { historyStore: new InMemoryHistoryStore() });
    servers.push(app);

    const response = await app.inject({ method: 'POST', url: '/api/history/runs/missing-run/resume' });
    expect(response.statusCode).toBe(404);
  });

  it('returns 500 when history store throws during list', async () => {
    const throwingStore: InMemoryHistoryStore = new InMemoryHistoryStore();
    const listRunsSpy = vi.spyOn(throwingStore, 'listRuns').mockRejectedValue(new Error('db down'));
    const { app } = await createDashboardServer({}, { historyStore: throwingStore });
    servers.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/history/runs' });
    expect(response.statusCode).toBe(500);
    listRunsSpy.mockRestore();
  });

  it('returns 500 when history store throws during detail', async () => {
    const throwingStore: InMemoryHistoryStore = new InMemoryHistoryStore();
    const detailSpy = vi.spyOn(throwingStore, 'getRunDetail').mockRejectedValue(new Error('db down'));
    const { app } = await createDashboardServer({}, { historyStore: throwingStore });
    servers.push(app);

    const response = await app.inject({ method: 'GET', url: '/api/history/runs/run-1' });
    expect(response.statusCode).toBe(500);
    detailSpy.mockRestore();
  });
});

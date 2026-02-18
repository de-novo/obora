import { afterEach, describe, expect, it } from 'vitest';

import { createDashboardServer } from '../index.js';
import { InMemoryHistoryStore } from '../history/history-store.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
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

  it('returns 400 when costMin or costMax is not a finite number', async () => {
    const { app } = await createDashboardServer({}, { historyStore: new InMemoryHistoryStore() });
    servers.push(app);

    const invalidCases = ['costMin=NaN', 'costMin=abc', 'costMax=NaN', 'costMax=xyz'];
    for (const query of invalidCases) {
      const response = await app.inject({ method: 'GET', url: `/api/history/runs?${query}` });
      expect(response.statusCode).toBe(400);
    }
  });

  it('returns run detail with audit pagination', async () => {    const historyStore = new InMemoryHistoryStore();
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
});

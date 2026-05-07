import Fastify from 'fastify';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { registerDLQRoutes } from '../routes/dlq.js';
import { registerMetricsRoutes } from '../routes/metrics.js';

const apps: Array<ReturnType<typeof Fastify>> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(apps.map((app) => app.close()));
  apps.length = 0;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

const createApp = (): ReturnType<typeof Fastify> => {
  const app = Fastify({ logger: false });
  apps.push(app);
  return app;
};

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'obora-dashboard-routes-'));
  tempDirs.push(dir);
  return dir;
};

const createDLQFile = async (): Promise<string> => {
  const dir = await createTempDir();
  const filePath = join(dir, 'dlq', 'dead-letters.json');
  await mkdir(join(dir, 'dlq'), { recursive: true });
  await writeFile(
    filePath,
    JSON.stringify(
      {
        lastUpdated: '2026-02-17T12:00:00.000Z',
        entries: [
          {
            id: 'old-pending',
            createdAt: '2026-02-17T10:00:00.000Z',
            executionId: 'exec-1',
            workflowName: 'workflow-a',
            stepName: 'draft',
            errorCode: 'E_STEP',
            errorMessage: 'first failure',
            repairAttempts: 1,
            status: 'pending',
          },
          {
            id: 'new-pending',
            createdAt: '2026-02-17T11:00:00.000Z',
            executionId: 'exec-2',
            workflowName: 'workflow-b',
            errorCode: 'E_GATE',
            errorMessage: 'second failure',
            repairAttempts: 2,
            status: 'pending',
          },
          {
            id: 'reviewed-entry',
            createdAt: '2026-02-17T09:00:00.000Z',
            executionId: 'exec-3',
            workflowName: 'workflow-c',
            errorCode: 'E_REVIEWED',
            errorMessage: 'reviewed failure',
            repairAttempts: 0,
            status: 'reviewed',
          },
        ],
      },
      null,
      2,
    ),
    'utf-8',
  );
  return filePath;
};

describe('metrics routes', () => {
  it('serves injected prometheus and JSON metrics', async () => {
    const app = createApp();
    registerMetricsRoutes(app, '/api', {
      getPrometheusMetrics: () => 'obora_runs_total 2\n',
      getJsonMetrics: () => ({ counters: [{ name: 'obora_runs_total', value: 2 }] }),
    });

    const textResponse = await app.inject({ method: 'GET', url: '/api/metrics' });
    expect(textResponse.statusCode).toBe(200);
    expect(textResponse.headers['content-type']).toContain('text/plain; version=0.0.4');
    expect(textResponse.body).toBe('obora_runs_total 2\n');

    const jsonResponse = await app.inject({ method: 'GET', url: '/api/metrics/json' });
    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.json()).toEqual({
      counters: [{ name: 'obora_runs_total', value: 2 }],
    });
  });

  it('returns empty metric defaults without collectors', async () => {
    const app = createApp();
    registerMetricsRoutes(app, '/api');

    await expect(app.inject({ method: 'GET', url: '/api/metrics' })).resolves.toMatchObject({
      statusCode: 200,
      body: '',
    });
    await expect(app.inject({ method: 'GET', url: '/api/metrics/json' })).resolves.toMatchObject({
      statusCode: 200,
    });

    const jsonResponse = await app.inject({ method: 'GET', url: '/api/metrics/json' });
    expect(jsonResponse.json()).toEqual({ counters: [], gauges: [], histograms: [] });
  });
});

describe('DLQ routes', () => {
  it('lists, summarizes, reads, and resolves DLQ entries', async () => {
    const app = createApp();
    const dlqFilePath = await createDLQFile();
    registerDLQRoutes(app, '/api', { dlqFilePath });

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/dlq?status=pending&limit=1&offset=0',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject({
      total: 2,
      limit: 1,
      offset: 0,
      pending: 2,
      entries: [{ id: 'new-pending' }],
    });

    const readResponse = await app.inject({ method: 'GET', url: '/api/dlq/old-pending' });
    expect(readResponse.statusCode).toBe(200);
    expect(readResponse.json()).toMatchObject({
      id: 'old-pending',
      workflowName: 'workflow-a',
      stepName: 'draft',
    });

    const summaryBeforeResolve = await app.inject({ method: 'GET', url: '/api/dlq/summary' });
    expect(summaryBeforeResolve.statusCode).toBe(200);
    expect(summaryBeforeResolve.json()).toMatchObject({
      totalEntries: 3,
      pendingCount: 2,
      reviewedCount: 1,
      retriedCount: 0,
      dismissedCount: 0,
      oldestPendingAt: '2026-02-17T10:00:00.000Z',
      lastUpdated: '2026-02-17T12:00:00.000Z',
    });

    const resolveResponse = await app.inject({
      method: 'POST',
      url: '/api/dlq/old-pending/resolve',
      payload: {
        status: 'retried',
        actor: 'operator',
        note: 'replayed after policy fix',
      },
    });
    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.json()).toMatchObject({
      id: 'old-pending',
      status: 'retried',
      resolvedBy: 'operator',
      resolution: 'replayed after policy fix',
    });
    expect(resolveResponse.json().resolvedAt).toEqual(expect.any(String));

    const persisted = JSON.parse(await readFile(dlqFilePath, 'utf-8')) as {
      entries: Array<{ id: string; status: string; resolvedBy?: string }>;
    };
    expect(persisted.entries.find((entry) => entry.id === 'old-pending')).toMatchObject({
      status: 'retried',
      resolvedBy: 'operator',
    });
  });

  it('handles missing DLQ files and validation errors', async () => {
    const app = createApp();
    const dir = await createTempDir();
    registerDLQRoutes(app, '/api', { dlqFilePath: join(dir, 'missing', 'dead-letters.json') });

    const emptyList = await app.inject({ method: 'GET', url: '/api/dlq' });
    expect(emptyList.statusCode).toBe(200);
    expect(emptyList.json()).toMatchObject({
      entries: [],
      total: 0,
      limit: 50,
      offset: 0,
      pending: 0,
    });

    await expect(app.inject({ method: 'GET', url: '/api/dlq/missing-entry' })).resolves.toMatchObject({
      statusCode: 404,
    });
    await expect(
      app.inject({
        method: 'POST',
        url: '/api/dlq/missing-entry/resolve',
        payload: { status: 'pending' },
      }),
    ).resolves.toMatchObject({ statusCode: 400 });
    await expect(
      app.inject({
        method: 'POST',
        url: '/api/dlq/missing-entry/resolve',
        payload: { status: 'dismissed' },
      }),
    ).resolves.toMatchObject({ statusCode: 404 });
  });
});

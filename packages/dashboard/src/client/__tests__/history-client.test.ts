import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  __private__,
  fetchHistoryRunDetail,
  fetchHistoryRuns,
  getHistoryArtifactRawUrl,
  resumeHistoryRun,
} from '../api/history-client';

const fetchMock = vi.fn<typeof fetch>();

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('history-client', () => {
  it('serializes query params and omits empty values', () => {
    const query = __private__.buildQuery({
      status: 'failed',
      workflowName: '',
      costMin: Number.NaN,
      costMax: 10,
      limit: 20,
      offset: undefined,
    });

    expect(query).toContain('status=failed');
    expect(query).toContain('costMin=NaN');
    expect(query).toContain('costMax=10');
    expect(query).toContain('limit=20');
    expect(query).not.toContain('workflowName');
    expect(query).not.toContain('offset');
  });

  it('fetches run list and detail with encoded params', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { items: [], total: 0, limit: 5, offset: 10 }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          run: {
            id: 'run:특수 id +@#',
            workflowName: 'wf',
            status: 'completed',
            input: {},
            startedAt: '2026-02-18T00:00:00.000Z',
          },
          steps: [],
          artifacts: [],
          costSummary: { totalTokens: 0, totalCostUsd: 0, byStep: [], byModel: [] },
          auditTimeline: [],
          checkpoints: [],
        }),
      );

    await fetchHistoryRuns({
      status: 'completed',
      workflowName: 'wf a',
      repairLoop: 'with',
      from: '2026-02-18',
      to: '2026-02-19',
      costMin: 1,
      costMax: 2,
      limit: 5,
      offset: 10,
      sortBy: 'totalCostUsd',
      sortOrder: 'asc',
    });
    await fetchHistoryRunDetail('run:특수 id +@#', { auditLimit: 25, auditOffset: 50 });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/history/runs?status=completed&workflowName=wf+a&repairLoop=with&from=2026-02-18&to=2026-02-19&costMin=1&costMax=2&limit=5&offset=10&sortBy=totalCostUsd&sortOrder=asc',
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/history/runs/run%3A%ED%8A%B9%EC%88%98%20id%20%2B%40%23?auditLimit=25&auditOffset=50',
    );
  });

  it('builds encoded raw artifact urls', () => {
    expect(getHistoryArtifactRawUrl('run/a', 'artifact #1')).toBe('/api/history/runs/run%2Fa/artifacts/artifact%20%231/raw');
    expect(getHistoryArtifactRawUrl('run/a', 'artifact #1', { download: true })).toBe(
      '/api/history/runs/run%2Fa/artifacts/artifact%20%231/raw?download=1',
    );
  });

  it('throws API payload messages and status fallbacks', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { message: 'bad history query' }))
      .mockResolvedValueOnce(new Response('not json', { status: 500 }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await expect(fetchHistoryRuns({ costMin: Number.NaN })).rejects.toThrow('bad history query');
    await expect(fetchHistoryRuns({})).rejects.toThrow('Request failed with 500');

    await expect(resumeHistoryRun('run-1')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/history/runs/run-1/resume', { method: 'POST' });
  });
});

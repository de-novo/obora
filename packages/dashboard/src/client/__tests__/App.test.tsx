// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { HistoryRunsResponse, RunDetailResponse } from '../../shared/history-types';

const historyApi = vi.hoisted(() => ({
  fetchHistoryArtifactPreview: vi.fn(),
  fetchHistoryRunDetail: vi.fn(),
  fetchHistoryRuns: vi.fn(),
  getHistoryArtifactRawUrl: vi.fn(),
  resumeHistoryRun: vi.fn(),
}));

vi.mock('../api/history-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/history-client')>();
  return {
    ...actual,
    fetchHistoryArtifactPreview: historyApi.fetchHistoryArtifactPreview,
    fetchHistoryRunDetail: historyApi.fetchHistoryRunDetail,
    fetchHistoryRuns: historyApi.fetchHistoryRuns,
    getHistoryArtifactRawUrl: historyApi.getHistoryArtifactRawUrl,
    resumeHistoryRun: historyApi.resumeHistoryRun,
  };
});

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({
    status: 'connected',
    connect: vi.fn(),
    disconnect: vi.fn(),
    lastError: undefined,
  }),
}));

const runsResponse: HistoryRunsResponse = {
  items: [
    {
      run: {
        id: 'run/nav',
        workflowName: 'navigation-flow',
        status: 'completed',
        input: {},
        startedAt: '2026-05-05T01:00:00.000Z',
        completedAt: '2026-05-05T01:02:00.000Z',
      },
      stepCount: 1,
      costSummary: {
        totalTokens: 100,
        totalCostUsd: 0.001,
        byStep: [],
        byModel: [],
      },
    },
  ],
  total: 1,
  limit: 20,
  offset: 0,
};

const detailResponse: RunDetailResponse = {
  run: runsResponse.items[0]!.run,
  steps: [
    {
      id: 'step-1',
      runId: 'run/nav',
      stepName: 'plan',
      status: 'completed',
      input: {},
      output: { ok: true },
      startedAt: '2026-05-05T01:00:00.000Z',
      completedAt: '2026-05-05T01:02:00.000Z',
      durationMs: 120000,
    },
  ],
  artifacts: [],
  costSummary: {
    totalTokens: 100,
    totalCostUsd: 0.001,
    byStep: [{ stepName: 'plan', tokens: 100, costUsd: 0.001 }],
    byModel: [],
  },
  auditTimeline: [],
  checkpoints: [],
};

beforeEach(() => {
  historyApi.fetchHistoryArtifactPreview.mockReset();
  historyApi.fetchHistoryRunDetail.mockReset();
  historyApi.fetchHistoryRuns.mockReset();
  historyApi.getHistoryArtifactRawUrl.mockReset();
  historyApi.resumeHistoryRun.mockReset();

  historyApi.fetchHistoryRuns.mockResolvedValue(runsResponse);
  historyApi.fetchHistoryRunDetail.mockResolvedValue(detailResponse);
  historyApi.fetchHistoryArtifactPreview.mockResolvedValue({ supported: false });
  historyApi.getHistoryArtifactRawUrl.mockReturnValue('/raw');
  historyApi.resumeHistoryRun.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('App history routing', () => {
  it('navigates from realtime to history list and encoded run detail', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/');

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'History' }));
    expect(await screen.findByText('History / Runs')).toBeTruthy();

    await user.click(screen.getByText('run/nav'));
    expect(window.location.pathname).toBe('/history/runs/run%2Fnav');
    expect(await screen.findByText('Run Detail / run/nav')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(window.location.pathname).toBe('/history/runs');
  });

  it('renders invalid encoded history paths with a recovery action', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/history/runs/%E0%A4%A');

    render(<App />);

    expect(screen.getByText('Invalid run id format.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /Back/ }));

    expect(window.location.pathname).toBe('/history/runs');
  });
});

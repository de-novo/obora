// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import { executionStore } from '../store/execution-store';
import type { AuditEvent } from '../api/audit-client';
import type { PolicyDocument } from '../api/policy-client';
import type { HistoryRunsResponse, RunDetailResponse } from '../../shared/history-types';
import type { ExecutionEvent } from '../../server/types.js';

const auditApi = vi.hoisted(() => ({
  fetchAuditEvents: vi.fn(),
  fetchExecutionEvents: vi.fn(),
}));

const historyApi = vi.hoisted(() => ({
  fetchHistoryArtifactPreview: vi.fn(),
  fetchHistoryRunDetail: vi.fn(),
  fetchHistoryRuns: vi.fn(),
  getHistoryArtifactRawUrl: vi.fn(),
  resumeHistoryRun: vi.fn(),
}));

const policyApi = vi.hoisted(() => ({
  createPolicy: vi.fn(),
  deletePolicy: vi.fn(),
  diffPolicy: vi.fn(),
  getPolicy: vi.fn(),
  listPolicies: vi.fn(),
  reloadPolicy: vi.fn(),
  updatePolicy: vi.fn(),
  validatePolicy: vi.fn(),
}));

const wsMock = vi.hoisted(() => ({
  lastError: undefined as string | undefined,
  onEvent: undefined as undefined | ((event: ExecutionEvent) => void),
  onFullSyncRequired: undefined as undefined | (() => Promise<void> | void),
}));

vi.mock('../api/audit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/audit-client')>();
  return {
    ...actual,
    fetchAuditEvents: auditApi.fetchAuditEvents,
    fetchExecutionEvents: auditApi.fetchExecutionEvents,
  };
});

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

vi.mock('../api/policy-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/policy-client')>();
  return {
    ...actual,
    createPolicy: policyApi.createPolicy,
    deletePolicy: policyApi.deletePolicy,
    diffPolicy: policyApi.diffPolicy,
    getPolicy: policyApi.getPolicy,
    listPolicies: policyApi.listPolicies,
    reloadPolicy: policyApi.reloadPolicy,
    updatePolicy: policyApi.updatePolicy,
    validatePolicy: policyApi.validatePolicy,
  };
});

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: (options: {
    onEvent: (event: ExecutionEvent) => void;
    onFullSyncRequired: () => Promise<void> | void;
  }) => {
    wsMock.onEvent = options.onEvent;
    wsMock.onFullSyncRequired = options.onFullSyncRequired;

    return {
      status: 'connected',
      connect: vi.fn(),
      disconnect: vi.fn(),
      lastError: wsMock.lastError,
    };
  },
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

const auditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    executionId: 'exec-audit',
    timestamp: '2026-05-05T01:00:00.000Z',
    type: 'execution_start',
    summary: 'execution started',
    payload: {},
    severity: 'info',
  },
  {
    id: 'audit-2',
    executionId: 'exec-audit',
    timestamp: '2026-05-05T01:01:00.000Z',
    type: 'step_start',
    stepName: 'review',
    summary: 'review started',
    payload: { input: { topic: 'release' } },
    severity: 'warning',
  },
];

const policy: PolicyDocument = {
  id: 'policy-1',
  name: 'Guardrail',
  content: 'allow: true',
  revision: 'rev-1',
  createdAt: '2026-05-05T01:00:00.000Z',
  updatedAt: '2026-05-05T01:05:00.000Z',
};

beforeEach(() => {
  executionStore.reset();
  wsMock.lastError = undefined;
  wsMock.onEvent = undefined;
  wsMock.onFullSyncRequired = undefined;

  auditApi.fetchAuditEvents.mockReset();
  auditApi.fetchExecutionEvents.mockReset();
  historyApi.fetchHistoryArtifactPreview.mockReset();
  historyApi.fetchHistoryRunDetail.mockReset();
  historyApi.fetchHistoryRuns.mockReset();
  historyApi.getHistoryArtifactRawUrl.mockReset();
  historyApi.resumeHistoryRun.mockReset();
  policyApi.createPolicy.mockReset();
  policyApi.deletePolicy.mockReset();
  policyApi.diffPolicy.mockReset();
  policyApi.getPolicy.mockReset();
  policyApi.listPolicies.mockReset();
  policyApi.reloadPolicy.mockReset();
  policyApi.updatePolicy.mockReset();
  policyApi.validatePolicy.mockReset();

  auditApi.fetchAuditEvents.mockResolvedValue({
    events: auditEvents,
    total: auditEvents.length,
    hasMore: false,
    limit: 20,
    offset: 0,
  });
  auditApi.fetchExecutionEvents.mockResolvedValue({
    events: auditEvents,
    total: auditEvents.length,
    hasMore: false,
    limit: 500,
    offset: 0,
  });
  historyApi.fetchHistoryRuns.mockResolvedValue(runsResponse);
  historyApi.fetchHistoryRunDetail.mockResolvedValue(detailResponse);
  historyApi.fetchHistoryArtifactPreview.mockResolvedValue({ supported: false });
  historyApi.getHistoryArtifactRawUrl.mockReturnValue('/raw');
  historyApi.resumeHistoryRun.mockResolvedValue({ ok: true });
  policyApi.createPolicy.mockResolvedValue({ ...policy, id: 'policy-created', name: 'Created', revision: 'rev-new' });
  policyApi.deletePolicy.mockResolvedValue(undefined);
  policyApi.diffPolicy.mockResolvedValue({ currentRevision: 'rev-1', diff: { summary: 'no changes', changes: [] } });
  policyApi.getPolicy.mockResolvedValue(policy);
  policyApi.listPolicies.mockResolvedValue([policy]);
  policyApi.reloadPolicy.mockResolvedValue({ success: true, policy });
  policyApi.updatePolicy.mockResolvedValue({ ...policy, revision: 'rev-2' });
  policyApi.validatePolicy.mockResolvedValue({ valid: true, errors: [] });
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('App history routing', () => {
  it('syncs realtime dashboard state from websocket recovery and reports connection errors', async () => {
    window.history.pushState({}, '', '/');
    wsMock.lastError = 'socket down';
    auditApi.fetchAuditEvents
      .mockResolvedValueOnce({
        events: [
          {
            id: 'sync-1',
            executionId: 'exec-sync',
            timestamp: '2026-05-05T01:00:00.000Z',
            type: 'execution_start',
            summary: 'execution started',
            payload: {},
          },
          {
            id: 'sync-2',
            executionId: 'exec-sync',
            timestamp: '2026-05-05T01:01:00.000Z',
            type: 'step_start',
            stepName: 'plan',
            summary: 'plan started',
            payload: { input: { goal: 'ship' }, blackboard: { draft: false } },
          },
        ],
        total: 3,
        hasMore: true,
        limit: 500,
        offset: 0,
      })
      .mockResolvedValueOnce({
        events: [
          {
            id: 'sync-3',
            executionId: 'exec-sync',
            timestamp: '2026-05-05T01:02:00.000Z',
            type: 'custom_event',
            stepName: 'write',
            summary: 'write emitted',
            payload: { response: { ok: true }, blackboardSnapshot: { draft: true } },
          },
        ],
        total: 3,
        hasMore: false,
        limit: 500,
        offset: 500,
      });

    render(<App />);

    await act(async () => {
      await wsMock.onFullSyncRequired?.();
    });

    expect(auditApi.fetchAuditEvents).toHaveBeenNthCalledWith(1, { limit: 500, offset: 0 });
    expect(auditApi.fetchAuditEvents).toHaveBeenNthCalledWith(2, { limit: 500, offset: 500 });
    expect(await screen.findByText('Timeline · exec-sync')).toBeTruthy();
    expect(screen.getByText('연결 상태: socket down')).toBeTruthy();
    expect(screen.getByText('plan')).toBeTruthy();
    expect(screen.getByText('write')).toBeTruthy();

    act(() => {
      wsMock.onEvent?.({
        id: 'sync-4',
        executionId: 'exec-sync',
        timestamp: '2026-05-05T01:03:00.000Z',
        type: 'step_end',
        knownType: 'step_end',
        stepName: 'write',
        payload: { output: { ok: true } },
      });
    });

    await waitFor(() => expect(screen.getByText(/완료/)).toBeTruthy());
  });

  it('switches realtime tabs and routes audit replay into playback', async () => {
    const user = userEvent.setup();
    window.history.pushState({}, '', '/');

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Audit' }));
    expect(await screen.findByText('execution started')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Replay' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Playback' })).toBeTruthy();
    await waitFor(() =>
      expect(auditApi.fetchExecutionEvents).toHaveBeenCalledWith('exec-audit', {
        limit: 500,
        offset: 0,
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Policy Editor' }));
    expect(await screen.findByText('Guardrail')).toBeTruthy();
  });

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

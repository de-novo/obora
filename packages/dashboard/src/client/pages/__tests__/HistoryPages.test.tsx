// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HistoryRunDetailPage } from '../HistoryRunDetailPage';
import { HistoryRunsPage } from '../HistoryRunsPage';
import type {
  ArtifactRecord,
  HistoryRunsResponse,
  PersistedRepairLoopSummary,
  RunDetailResponse,
} from '../../../shared/history-types';

const historyApi = vi.hoisted(() => ({
  fetchHistoryArtifactPreview: vi.fn(),
  fetchHistoryRunDetail: vi.fn(),
  fetchHistoryRuns: vi.fn(),
  getHistoryArtifactRawUrl: vi.fn(),
  resumeHistoryRun: vi.fn(),
}));

vi.mock('../../api/history-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/history-client')>();
  return {
    ...actual,
    fetchHistoryArtifactPreview: historyApi.fetchHistoryArtifactPreview,
    fetchHistoryRunDetail: historyApi.fetchHistoryRunDetail,
    fetchHistoryRuns: historyApi.fetchHistoryRuns,
    getHistoryArtifactRawUrl: historyApi.getHistoryArtifactRawUrl,
    resumeHistoryRun: historyApi.resumeHistoryRun,
  };
});

const repairLoop: PersistedRepairLoopSummary = {
  validationFailed: 2,
  validationPassed: 1,
  repairStarted: 1,
  repairCompleted: 0,
  repairNoProgress: 1,
  backEdgeTriggered: 1,
  backEdgeExhausted: 0,
  lastValidationSummary: 'schema mismatch on invoice total',
  lastValidationStep: 'validate',
  lastRepairStep: 'repair',
  lastAttempt: 2,
  lastNoProgressReason: 'same diff after retry',
  recentValidationFailures: [
    {
      stepName: 'validate',
      summary: 'missing invoice total',
      logPath: '/tmp/validate.log',
      failedChecks: [{ name: 'total', file: 'invoice.json', message: 'required' }],
    },
  ],
};

const artifact: ArtifactRecord = {
  id: 'artifact-1',
  runId: 'run-a',
  stepName: 'validate',
  name: 'validation.json',
  mimeType: 'application/json',
  sizeBytes: 128,
  storageRef: 'file:///tmp/validation.json',
  createdAt: '2026-05-05T01:03:00.000Z',
};

const runsResponse: HistoryRunsResponse = {
  items: [
    {
      run: {
        id: 'run-a',
        workflowName: 'invoice-flow',
        status: 'suspended',
        input: { invoiceId: 'inv-1' },
        startedAt: '2026-05-05T01:00:00.000Z',
      },
      repairLoop,
      stepCount: 2,
      costSummary: {
        totalTokens: 1200,
        totalCostUsd: 0.0245,
        byStep: [],
        byModel: [],
      },
    },
  ],
  total: 40,
  limit: 20,
  offset: 0,
  repairLoopCounts: {
    all: 40,
    with: 12,
    without: 28,
    stalled: 1,
    exhausted: 2,
  },
};

const runDetailResponse: RunDetailResponse = {
  run: {
    id: 'run-a',
    workflowName: 'invoice-flow',
    status: 'suspended',
    input: { invoiceId: 'inv-1' },
    startedAt: '2026-05-05T01:00:00.000Z',
  },
  repairLoop,
  steps: [
    {
      id: 'step-validate',
      runId: 'run-a',
      stepName: 'validate',
      status: 'failed',
      input: { invoiceId: 'inv-1' },
      output: { valid: false },
      error: { code: 'VALIDATION_FAILED', message: 'missing invoice total' },
      startedAt: '2026-05-05T01:02:00.000Z',
      completedAt: '2026-05-05T01:03:00.000Z',
      durationMs: 1000,
    },
    {
      id: 'step-repair',
      runId: 'run-a',
      stepName: 'repair',
      status: 'running',
      input: { attempt: 2 },
      startedAt: '2026-05-05T01:04:00.000Z',
    },
  ],
  artifacts: [artifact],
  costSummary: {
    totalTokens: 1200,
    totalCostUsd: 0.0245,
    byStep: [{ stepName: 'validate', tokens: 800, costUsd: 0.018 }],
    byModel: [{ model: 'test-model', tokens: 1200, costUsd: 0.0245 }],
  },
  auditTimeline: [
    {
      id: 'audit-1',
      runId: 'run-a',
      stepName: 'validate',
      timestamp: '2026-05-05T01:03:00.000Z',
      category: 'policy',
      action: 'validation_failed',
      actor: 'validator',
      detail: { reason: 'missing invoice total' },
      vote: { decision: 'reject', confidence: 0.82 },
    },
    {
      id: 'audit-2',
      runId: 'run-a',
      stepName: 'repair',
      timestamp: '2026-05-05T01:04:00.000Z',
      category: 'recovery',
      action: 'repair_started',
      actor: 'repair-agent',
      detail: { attempt: 2 },
    },
  ],
  checkpoints: [
    {
      id: 'checkpoint-1',
      runId: 'run-a',
      stepName: 'validate',
      stateSnapshot: { invoiceId: 'inv-1' },
      completedSteps: ['validate'],
      policyHash: 'policy-hash',
      createdAt: '2026-05-05T01:03:30.000Z',
    },
  ],
  pagination: {
    auditTotal: 150,
    auditLimit: 100,
    auditOffset: 0,
  },
};

beforeEach(() => {
  historyApi.fetchHistoryArtifactPreview.mockReset();
  historyApi.fetchHistoryRunDetail.mockReset();
  historyApi.fetchHistoryRuns.mockReset();
  historyApi.getHistoryArtifactRawUrl.mockReset();
  historyApi.resumeHistoryRun.mockReset();

  historyApi.fetchHistoryRuns.mockResolvedValue(runsResponse);
  historyApi.fetchHistoryRunDetail.mockResolvedValue(runDetailResponse);
  historyApi.fetchHistoryArtifactPreview.mockResolvedValue({
    artifact,
    supported: true,
    contentType: 'application/json',
    text: '{"valid": false}',
    truncated: true,
  });
  historyApi.getHistoryArtifactRawUrl.mockImplementation(
    (runId: string, artifactId: string, options?: { download?: boolean }) =>
      `/raw/${encodeURIComponent(runId)}/${encodeURIComponent(artifactId)}${options?.download ? '?download=1' : ''}`,
  );
  historyApi.resumeHistoryRun.mockResolvedValue({ ok: true });

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });

  Object.defineProperty(window.HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HistoryRunsPage', () => {
  it('loads runs, applies filters, pages forward, and opens a run', async () => {
    const user = userEvent.setup();
    const onOpenRun = vi.fn();

    render(<HistoryRunsPage onOpenRun={onOpenRun} />);

    expect(await screen.findByText('run-a')).toBeTruthy();
    expect(historyApi.fetchHistoryRuns).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 20,
        offset: 0,
        sortBy: 'startedAt',
        sortOrder: 'desc',
      }),
    );

    fireEvent.change(screen.getAllByRole('combobox')[0]!, { target: { value: 'failed' } });
    fireEvent.change(screen.getByPlaceholderText('workflow name'), { target: { value: 'invoice-flow' } });
    fireEvent.change(screen.getByPlaceholderText('cost min'), { target: { value: '0.01' } });

    await waitFor(() =>
      expect(historyApi.fetchHistoryRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({
          status: 'failed',
          workflowName: 'invoice-flow',
          costMin: 0.01,
          offset: 0,
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Stalled (1)' }));
    await waitFor(() =>
      expect(historyApi.fetchHistoryRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({
          repairLoop: 'stalled',
          offset: 0,
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(historyApi.fetchHistoryRuns).toHaveBeenLastCalledWith(
        expect.objectContaining({
          offset: 20,
        }),
      ),
    );

    await user.click(screen.getByText('run-a'));
    expect(onOpenRun).toHaveBeenCalledWith('run-a');
  });

  it('renders list load failures', async () => {
    historyApi.fetchHistoryRuns.mockRejectedValueOnce(new Error('history list failed'));

    render(<HistoryRunsPage onOpenRun={vi.fn()} />);

    expect(await screen.findByText('history list failed')).toBeTruthy();
  });
});

describe('HistoryRunDetailPage', () => {
  it('loads detail, previews artifacts, resumes suspended runs, and pages audit events', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    render(<HistoryRunDetailPage runId="run-a" onBack={onBack} />);

    expect(await screen.findByText('Run Detail / run-a')).toBeTruthy();
    expect(screen.getByText('Repair Loop')).toBeTruthy();
    expect(screen.getByText('Recent Validation Failures')).toBeTruthy();
    expect(screen.getByText('validation_failed')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText('json')).toBeTruthy();
    expect(screen.getByText('Preview truncated for readability.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Disable wrap' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    historyApi.fetchHistoryArtifactPreview.mockRejectedValueOnce(new Error('preview unavailable'));
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    expect(await screen.findByText('preview unavailable')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Resume run' }));
    expect(screen.getByText('Policy drift warning')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Yes, resume' }));

    await waitFor(() => expect(historyApi.resumeHistoryRun).toHaveBeenCalledWith('run-a'));
    expect(historyApi.fetchHistoryRunDetail).toHaveBeenLastCalledWith('run-a', {
      auditLimit: 100,
      auditOffset: 0,
    });

    await user.click(screen.getByRole('button', { name: 'Next audit' }));
    await waitFor(() =>
      expect(historyApi.fetchHistoryRunDetail).toHaveBeenLastCalledWith('run-a', {
        auditLimit: 100,
        auditOffset: 100,
      }),
    );

    await user.click(screen.getByRole('button', { name: /Back/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('renders detail load failures with a back action', async () => {
    const onBack = vi.fn();
    historyApi.fetchHistoryRunDetail.mockRejectedValueOnce(new Error('detail failed'));

    render(<HistoryRunDetailPage runId="run-a" onBack={onBack} />);

    expect(await screen.findByText('detail failed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});

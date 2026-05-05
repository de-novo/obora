// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuditViewer } from '../AuditViewer';
import { PlaybackView } from '../PlaybackView';
import { PolicyEditor } from '../PolicyEditor';
import type { AuditEvent } from '../../api/audit-client';
import type { PolicyDocument } from '../../api/policy-client';

const auditApi = vi.hoisted(() => ({
  fetchAuditEvents: vi.fn(),
  fetchExecutionEvents: vi.fn(),
}));

const policyApi = vi.hoisted(() => ({
  createPolicy: vi.fn(),
  deletePolicy: vi.fn(),
  getPolicy: vi.fn(),
  listPolicies: vi.fn(),
  validatePolicy: vi.fn(),
  diffPolicy: vi.fn(),
  reloadPolicy: vi.fn(),
  updatePolicy: vi.fn(),
}));

vi.mock('../../api/audit-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/audit-client')>();
  return {
    ...actual,
    fetchAuditEvents: auditApi.fetchAuditEvents,
    fetchExecutionEvents: auditApi.fetchExecutionEvents,
  };
});

vi.mock('../../api/policy-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/policy-client')>();
  return {
    ...actual,
    createPolicy: policyApi.createPolicy,
    deletePolicy: policyApi.deletePolicy,
    getPolicy: policyApi.getPolicy,
    listPolicies: policyApi.listPolicies,
    validatePolicy: policyApi.validatePolicy,
    diffPolicy: policyApi.diffPolicy,
    reloadPolicy: policyApi.reloadPolicy,
    updatePolicy: policyApi.updatePolicy,
  };
});

const auditEvents: AuditEvent[] = [
  {
    id: 'audit-1',
    executionId: 'exec-1',
    timestamp: '2026-05-05T01:00:00.000Z',
    type: 'execution_start',
    summary: 'execution started',
    payload: { stepName: 'plan' },
    severity: 'info',
  },
  {
    id: 'audit-2',
    executionId: 'exec-2',
    timestamp: '2026-05-05T01:01:00.000Z',
    type: 'step_start',
    stepName: 'draft',
    summary: 'draft started',
    payload: { input: { topic: 'invoice' } },
    severity: 'warning',
  },
];

const executionEvents: AuditEvent[] = [
  {
    id: 'event-1',
    executionId: 'exec-2',
    timestamp: '2026-05-05T01:02:00.000Z',
    type: 'step_start',
    stepName: 'draft',
    summary: 'draft started',
    payload: { input: { topic: 'invoice' } },
  },
  {
    id: 'event-2',
    executionId: 'exec-2',
    timestamp: '2026-05-05T01:03:00.000Z',
    type: 'step_end',
    stepName: 'draft',
    summary: 'draft completed',
    payload: { output: { ok: true } },
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
  auditApi.fetchAuditEvents.mockReset();
  auditApi.fetchExecutionEvents.mockReset();
  policyApi.createPolicy.mockReset();
  policyApi.deletePolicy.mockReset();
  policyApi.getPolicy.mockReset();
  policyApi.listPolicies.mockReset();
  policyApi.validatePolicy.mockReset();
  policyApi.diffPolicy.mockReset();
  policyApi.reloadPolicy.mockReset();
  policyApi.updatePolicy.mockReset();

  auditApi.fetchAuditEvents.mockResolvedValue({
    events: auditEvents,
    total: 25,
    hasMore: true,
    limit: 20,
    offset: 0,
  });
  auditApi.fetchExecutionEvents.mockResolvedValue({
    events: executionEvents,
    total: executionEvents.length,
    hasMore: false,
    limit: 500,
    offset: 0,
  });

  policyApi.createPolicy.mockResolvedValue({ ...policy, id: 'policy-created', name: 'Created', revision: 'rev-new' });
  policyApi.deletePolicy.mockResolvedValue(undefined);
  policyApi.getPolicy.mockResolvedValue(policy);
  policyApi.listPolicies.mockResolvedValue([policy]);
  policyApi.validatePolicy.mockResolvedValue({ valid: true, errors: [] });
  policyApi.diffPolicy.mockResolvedValue({
    currentRevision: 'rev-1',
    diff: { summary: '1 change', changes: [{ path: 'allow', type: 'modified', oldValue: true, newValue: false }] },
  });
  policyApi.reloadPolicy.mockResolvedValue({ success: true, policy: { ...policy, content: 'allow: false', revision: 'rev-2' } });
  policyApi.updatePolicy.mockResolvedValue({ ...policy, revision: 'rev-2' });
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AuditViewer', () => {
  it('loads audit events, replays an execution, and pages forward', async () => {
    const user = userEvent.setup();
    const onReplayExecution = vi.fn();

    render(<AuditViewer onReplayExecution={onReplayExecution} />);

    expect(await screen.findByText('execution started')).toBeTruthy();
    await user.click(screen.getAllByRole('button', { name: 'Replay' })[0]!);
    await user.click(screen.getByRole('button', { name: '다음' }));

    expect(onReplayExecution).toHaveBeenCalledWith('exec-1');
    await waitFor(() =>
      expect(auditApi.fetchAuditEvents).toHaveBeenLastCalledWith(
        expect.objectContaining({
          limit: 20,
          offset: 20,
        }),
      ),
    );
  });

  it('surfaces audit load failures', async () => {
    auditApi.fetchAuditEvents.mockRejectedValueOnce(new Error('audit failed'));

    render(<AuditViewer />);

    expect(await screen.findByText('audit failed')).toBeTruthy();
    expect(screen.getByText('조회된 감사 이벤트가 없습니다.')).toBeTruthy();
  });
});

describe('PlaybackView', () => {
  it('selects the first execution when no initial execution is provided', async () => {
    render(<PlaybackView />);

    await waitFor(() =>
      expect(auditApi.fetchExecutionEvents).toHaveBeenCalledWith('exec-1', {
        limit: 500,
        offset: 0,
      }),
    );
    expect(screen.getByRole<HTMLSelectElement>('combobox').value).toBe('exec-1');
  });

  it('renders audit list failures with the fallback message for non-error rejections', async () => {
    auditApi.fetchAuditEvents.mockRejectedValueOnce('audit source unavailable');

    render(<PlaybackView />);

    expect(await screen.findByText('execution 목록 로드 실패')).toBeTruthy();
    expect(screen.getByText('재생할 이벤트가 없습니다.')).toBeTruthy();
  });

  it('loads executions, fetches selected execution events, and advances playback state', async () => {
    const user = userEvent.setup();

    render(<PlaybackView initialExecutionId="exec-2" />);

    expect(await screen.findByText('step_start')).toBeTruthy();
    expect(screen.getByText('Timeline · exec-2')).toBeTruthy();
    expect(screen.getByText('이벤트 1 / 2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(screen.getByText('이벤트 2 / 2')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'exec-1' } });
    await waitFor(() =>
      expect(auditApi.fetchExecutionEvents).toHaveBeenLastCalledWith('exec-1', {
        limit: 500,
        offset: 0,
      }),
    );
  });

  it('renders playback load failures', async () => {
    auditApi.fetchExecutionEvents.mockRejectedValueOnce(new Error('execution events failed'));

    render(<PlaybackView initialExecutionId="exec-2" />);

    expect(await screen.findByText('execution events failed')).toBeTruthy();
  });
});

describe('PolicyEditor', () => {
  it('loads policies, deletes selected policies, and creates a new policy', async () => {
    const user = userEvent.setup();

    render(<PolicyEditor />);

    expect(await screen.findByText('Guardrail')).toBeTruthy();
    expect(await screen.findByDisplayValue('allow: true')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '삭제' }));
    await waitFor(() => expect(policyApi.deletePolicy).toHaveBeenCalledWith('policy-1'));

    await user.click(screen.getByRole('button', { name: '+ 새 정책' }));
    fireEvent.change(screen.getByPlaceholderText('YAML 정책을 입력하세요'), { target: { value: 'name: created' } });
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(policyApi.createPolicy).toHaveBeenCalledWith({
        name: 'untitled-policy',
        content: 'name: created',
      }),
    );
  });

  it('renders policy list failures', async () => {
    policyApi.listPolicies.mockRejectedValueOnce(new Error('policy failed'));

    render(<PolicyEditor />);

    expect(await screen.findByText('policy failed')).toBeTruthy();
  });
});

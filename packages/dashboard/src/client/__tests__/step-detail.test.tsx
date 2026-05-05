// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { StepDetail } from '../components/StepDetail';
import {
  applyExecutionEvent,
  createInitialExecutionStoreState,
  extractStepDetailFromEvent,
  getBlackboardDiffPaths,
  type ExecutionEvent,
  type ExecutionStep,
} from '../store/execution-store';

afterEach(() => {
  cleanup();
});

const baseEvent = (overrides: Partial<ExecutionEvent>): ExecutionEvent => ({
  id: 'event-1',
  executionId: 'exec-1',
  timestamp: '2026-02-17T12:00:00.000Z',
  type: 'step_start',
  stepName: 'step-a',
  payload: {},
  ...overrides,
});

describe('step detail extraction', () => {
  it('extracts input/output/policy/error/blackboard from event payload', () => {
    const detail = extractStepDetailFromEvent(
      baseEvent({
        payload: {
          input: { query: 'hello' },
          output: { answer: 'world' },
          policy: { allow: true },
          blackboard: { context: { user: 'u-1' } },
          error: {
            code: 'E_FAIL',
            message: 'failed',
            stack: 'Error: failed\n  at test',
          },
        },
      }),
    );

    expect(detail).toMatchObject({
      input: { query: 'hello' },
      output: { answer: 'world' },
      policy: { allow: true },
      blackboard: { context: { user: 'u-1' } },
      error: {
        code: 'E_FAIL',
        message: 'failed',
      },
    });
  });

  it('stores step detail per step in execution state', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'e1',
        payload: {
          input: { q: 1 },
          blackboard: { a: 1 },
        },
      }),
    );

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'e2',
        stepName: 'step-b',
        payload: {
          output: { ok: true },
          policy: { name: 'default' },
        },
      }),
    );

    expect(state.executions['exec-1']?.stepDetails['step-a']?.input).toEqual({ q: 1 });
    expect(state.executions['exec-1']?.stepDetails['step-a']?.blackboard).toEqual({ a: 1 });
    expect(state.executions['exec-1']?.stepDetails['step-b']?.output).toEqual({ ok: true });
    expect(state.executions['exec-1']?.stepDetails['step-b']?.policy).toEqual({ name: 'default' });
  });
});

describe('blackboard diff', () => {
  it('returns changed paths compared with previous step snapshot', () => {
    const prev = {
      context: { user: 'u-1', count: 1 },
      flags: { blocked: false },
    };

    const next = {
      context: { user: 'u-1', count: 2 },
      flags: { blocked: true },
      traceId: 't-1',
    };

    expect(getBlackboardDiffPaths(prev, next)).toEqual(['context.count', 'flags.blocked', 'traceId']);
  });
});

describe('StepDetail component', () => {
  const step: ExecutionStep = {
    stepName: 'validate',
    status: 'failed',
    firstSeenAt: '2026-02-17T12:00:00.000Z',
    lastUpdatedAt: '2026-02-17T12:01:00.000Z',
  };

  it('renders a placeholder when no execution or step is selected', () => {
    render(<StepDetail />);

    expect(screen.getByText('Timeline에서 step을 선택하세요.')).toBeTruthy();
  });

  it('renders structured sections and supports collapse toggles', () => {
    render(
      <StepDetail
        executionId="exec-1"
        step={step}
        previousBlackboard={{ invoice: { total: 10, currency: 'USD' } }}
        detail={{
          input: { invoiceId: 'inv-1' },
          output: { valid: false },
          policy: { allow: false },
          error: { code: 'E_VALIDATION', message: 'missing total', stack: 'Error: missing total' },
          blackboard: { invoice: { total: 0, currency: 'USD' }, status: 'failed' },
        }}
      />,
    );

    expect(screen.getByText('Step Detail · exec-1 / validate')).toBeTruthy();
    expect(screen.getByText('E_VALIDATION')).toBeTruthy();
    expect(screen.getByText('missing total')).toBeTruthy();
    expect(screen.getByText('Error: missing total')).toBeTruthy();
    expect(screen.getByText(/"invoiceId": "inv-1"/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Input/ }));
    expect(screen.queryByText(/"invoiceId": "inv-1"/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Error/ }));
    expect(screen.queryByText('E_VALIDATION')).toBeNull();
  });

  it('renders empty values and error fallback text', () => {
    render(
      <StepDetail
        executionId="exec-1"
        step={{ ...step, status: 'completed' }}
        detail={{
          error: {},
        }}
      />,
    );

    expect(screen.getAllByText('데이터 없음').length).toBeGreaterThan(0);
    expect(screen.getByText('UNKNOWN_ERROR')).toBeTruthy();
    expect(screen.getByText('메시지 없음')).toBeTruthy();
  });
});

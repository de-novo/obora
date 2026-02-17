import { describe, expect, it } from 'vitest';

import {
  applyExecutionEvent,
  createInitialExecutionStoreState,
  extractStepDetailFromEvent,
  getBlackboardDiffPaths,
  type ExecutionEvent,
} from '../store/execution-store';

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

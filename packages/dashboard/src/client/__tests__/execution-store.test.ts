import { describe, expect, it, vi } from 'vitest';

import {
  applyExecutionEvent,
  createInitialExecutionStoreState,
  executionStore,
  extractStepDetailFromEvent,
  getBlackboardDiffPaths,
  getExecutionSummaries,
  getSortedSteps,
  type ExecutionEvent,
} from '../store/execution-store';

const baseEvent = (overrides: Partial<ExecutionEvent>): ExecutionEvent => ({
  id: 'event-1',
  executionId: 'exec-1',
  timestamp: '2026-02-17T12:00:00.000Z',
  type: 'step_start',
  knownType: 'step_start',
  stepName: 'step-a',
  ...overrides,
});

describe('execution-store', () => {
  it('applies step status transitions from events', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'e1',
        type: 'step_start',
        stepName: 'collect',
        timestamp: '2026-02-17T12:00:00.000Z',
      }),
    );

    expect(state.executions['exec-1']?.steps.collect?.status).toBe('running');

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'e2',
        type: 'step_end',
        knownType: 'step_end',
        stepName: 'collect',
        timestamp: '2026-02-17T12:01:00.000Z',
      }),
    );

    expect(state.executions['exec-1']?.steps.collect?.status).toBe('completed');

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'e3',
        type: 'error',
        knownType: 'error',
        stepName: 'collect',
        timestamp: '2026-02-17T12:02:00.000Z',
      }),
    );

    expect(state.executions['exec-1']?.steps.collect?.status).toBe('failed');
  });

  it('keeps executions isolated per executionId', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({ id: 'a-1', executionId: 'exec-a', stepName: 'a-step', type: 'step_start' }),
    );

    state = applyExecutionEvent(
      state,
      baseEvent({ id: 'b-1', executionId: 'exec-b', stepName: 'b-step', type: 'step_start' }),
    );

    expect(Object.keys(state.executions)).toEqual(['exec-a', 'exec-b']);
    expect(state.executions['exec-a']?.steps['a-step']).toBeDefined();
    expect(state.executions['exec-a']?.steps['b-step']).toBeUndefined();
    expect(state.executions['exec-b']?.steps['b-step']).toBeDefined();
  });

  it('handles events without knownType safely', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'u1',
        type: 'step_start',
        knownType: undefined,
        stepName: 'unknown-step',
      }),
    );

    expect(state.executions['exec-1']?.steps['unknown-step']?.status).toBe('pending');
  });

  it('sorts timeline steps by first seen timestamp', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({ id: '2', timestamp: '2026-02-17T12:02:00.000Z', stepName: 'step-b', type: 'step_start' }),
    );
    state = applyExecutionEvent(
      state,
      baseEvent({ id: '1', timestamp: '2026-02-17T12:01:00.000Z', stepName: 'step-a', type: 'step_start' }),
    );

    const execution = state.executions['exec-1'];
    const sorted = getSortedSteps(execution);

    expect(sorted.map((step) => step.stepName)).toEqual(['step-a', 'step-b']);
  });

  it('extracts step details from payload aliases and error variants', () => {
    const previous = {
      input: { old: true },
      output: { previous: true },
      policy: { allowed: true },
      blackboard: { count: 1 },
    };

    expect(extractStepDetailFromEvent(baseEvent({ stepName: undefined }), previous)).toBe(previous);

    expect(
      extractStepDetailFromEvent(
        baseEvent({
          payload: {
            inputs: { prompt: 'draft' },
            result: { text: 'ok' },
            policyCheck: { allowed: false },
            blackboardSnapshot: { count: 2 },
          },
        }),
        previous,
      ),
    ).toEqual({
      input: { prompt: 'draft' },
      output: { text: 'ok' },
      policy: { allowed: false },
      blackboard: { count: 2 },
      error: undefined,
    });

    expect(
      extractStepDetailFromEvent(
        baseEvent({
          type: 'error',
          knownType: 'error',
          payload: { code: 'E_STEP', message: 'failed', stack: 'stack' },
        }),
      )?.error,
    ).toMatchObject({ code: 'E_STEP', message: 'failed', stack: 'stack' });

    expect(
      extractStepDetailFromEvent(
        baseEvent({
          payload: { error: { code: 'E_PAYLOAD', message: 'payload failure' } },
        }),
      )?.error,
    ).toMatchObject({ code: 'E_PAYLOAD', message: 'payload failure' });
  });

  it('covers execution activity, status fallbacks, summaries, and diffs', () => {
    let state = createInitialExecutionStoreState();

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'start',
        type: 'execution_start',
        knownType: 'execution_start',
        stepName: undefined,
      }),
    );
    expect(state.executions['exec-1']?.isActive).toBe(true);

    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'running',
        type: 'progress',
        knownType: undefined,
        status: 'running',
        stepName: 'same-time-b',
      }),
    );
    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'completed',
        type: 'progress',
        knownType: undefined,
        status: 'completed',
        stepName: 'same-time-a',
      }),
    );
    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'failed',
        type: 'step_start',
        knownType: 'step_start',
        status: 'failed',
        stepName: 'failed-step',
      }),
    );
    state = applyExecutionEvent(
      state,
      baseEvent({
        id: 'end',
        type: 'execution_end',
        knownType: 'execution_end',
        stepName: undefined,
      }),
    );

    expect(state.executions['exec-1']?.isActive).toBe(false);
    expect(state.executions['exec-1']?.steps['same-time-b']?.status).toBe('running');
    expect(state.executions['exec-1']?.steps['same-time-a']?.status).toBe('completed');
    expect(state.executions['exec-1']?.steps['failed-step']?.status).toBe('failed');
    expect(getSortedSteps(undefined)).toEqual([]);
    expect(getSortedSteps(state.executions['exec-1']).map((step) => step.stepName)).toEqual([
      'failed-step',
      'same-time-a',
      'same-time-b',
    ]);

    expect(getExecutionSummaries({ ...state, executionOrder: ['missing', ...state.executionOrder] })).toEqual([
      { executionId: 'exec-1', isActive: false, stepCount: 3, lastEventAt: '2026-02-17T12:00:00.000Z' },
    ]);

    expect(getBlackboardDiffPaths({ a: { b: 1 }, same: true }, { a: { b: 2 }, added: true, same: true })).toEqual([
      'a.b',
      'added',
    ]);
    expect(getBlackboardDiffPaths('same', 'same')).toEqual([]);
    expect(getBlackboardDiffPaths({ value: 1 }, ['not-record'])).toEqual([]);
  });

  it('notifies subscribers from the singleton execution store', () => {
    const listener = vi.fn();
    const unsubscribe = executionStore.subscribe(listener);

    executionStore.reset();
    executionStore.receiveEvent(baseEvent({ id: 'singleton-event' }));

    expect(listener).toHaveBeenCalledTimes(2);
    expect(executionStore.getState().lastEventId).toBe('singleton-event');

    unsubscribe();
    executionStore.reset();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

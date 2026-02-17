import { describe, expect, it } from 'vitest';

import {
  applyExecutionEvent,
  createInitialExecutionStoreState,
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
});

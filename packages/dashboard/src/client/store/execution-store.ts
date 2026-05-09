import { useSyncExternalStore } from 'react';

import type { ExecutionEvent } from '../../server/types.js';

export type { ExecutionEvent } from '../../server/types.js';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StepErrorDetail {
  code?: string;
  message?: string;
  stack?: string;
  raw?: unknown;
}

export interface StepDetailData {
  input?: unknown;
  output?: unknown;
  policy?: unknown;
  error?: StepErrorDetail;
  blackboard?: unknown;
}

export interface ExecutionStep {
  stepName: string;
  status: StepStatus;
  firstSeenAt: string;
  lastUpdatedAt: string;
}

export interface ExecutionRecord {
  executionId: string;
  isActive: boolean;
  lastEventId?: string;
  lastEventAt?: string;
  steps: Record<string, ExecutionStep>;
  stepDetails: Record<string, StepDetailData>;
}

export interface ExecutionStoreState {
  executions: Record<string, ExecutionRecord>;
  executionOrder: string[];
  lastEventId?: string;
}

export const createInitialExecutionStoreState = (): ExecutionStoreState => ({
  executions: {},
  executionOrder: [],
  lastEventId: undefined,
});

const toStepStatus = (event: ExecutionEvent): StepStatus | undefined => {
  const known = event.knownType ?? 'unknown';

  if (event.status === 'failed') {
    return 'failed';
  }

  if (known === 'step_start') {
    return 'running';
  }

  if (known === 'step_end') {
    return 'completed';
  }

  if (known === 'error' && event.stepName) {
    return 'failed';
  }

  if (!event.stepName) {
    return undefined;
  }

  if (event.status === 'running') {
    return 'running';
  }

  if (event.status === 'completed') {
    return 'completed';
  }

  return 'pending';
};

const asObject = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
};

const pick = (obj: Record<string, unknown>, keys: string[]): unknown => {
  const key = keys.find((candidate) => candidate in obj);
  return key ? obj[key] : undefined;
};

const extractErrorDetail = (event: ExecutionEvent, payload: Record<string, unknown>): StepErrorDetail | undefined => {
  const eventError = asObject((event as unknown as Record<string, unknown>).error);
  const payloadError = asObject(payload.error);
  const source = eventError ?? payloadError;

  if (source) {
    return {
      code: typeof source.code === 'string' ? source.code : undefined,
      message: typeof source.message === 'string' ? source.message : undefined,
      stack: typeof source.stack === 'string' ? source.stack : undefined,
      raw: source,
    };
  }

  const code = typeof payload.code === 'string' ? payload.code : undefined;
  const message = typeof payload.message === 'string' ? payload.message : undefined;
  const stack = typeof payload.stack === 'string' ? payload.stack : undefined;

  if (code || message || stack || event.type === 'error' || event.knownType === 'error') {
    return { code, message, stack, raw: payload };
  }

  return undefined;
};

export const extractStepDetailFromEvent = (event: ExecutionEvent, previous?: StepDetailData): StepDetailData | undefined => {
  if (!event.stepName) {
    return previous;
  }

  const payload = event.payload ?? {};

  const input = pick(payload, ['input', 'inputs', 'request']);
  const output = pick(payload, ['output', 'result', 'response']);
  const policy = pick(payload, ['policy', 'policyCheck', 'policyResult']);
  const blackboard = pick(payload, ['blackboard', 'blackboardSnapshot']);
  const error = extractErrorDetail(event, payload);

  const next: StepDetailData = {
    input: input ?? previous?.input,
    output: output ?? previous?.output,
    policy: policy ?? previous?.policy,
    blackboard: blackboard ?? previous?.blackboard,
    error: error ?? previous?.error,
  };

  if (!next.input && !next.output && !next.policy && !next.error && !next.blackboard) {
    return previous;
  }

  return next;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

export const getBlackboardDiffPaths = (prev: unknown, next: unknown): string[] => {
  const paths = new Set<string>();

  const walk = (left: unknown, right: unknown, basePath: string): void => {
    if (left === right) {
      return;
    }

    if (!isRecord(left) || !isRecord(right)) {
      if (basePath) {
        paths.add(basePath);
      }
      return;
    }

    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    keys.forEach((key) => {
      const nextPath = basePath ? `${basePath}.${key}` : key;
      walk(left[key], right[key], nextPath);
    });
  };

  walk(prev, next, '');

  return [...paths].sort();
};

const compareByTimeThenName = (a: ExecutionStep, b: ExecutionStep): number => {
  if (a.firstSeenAt === b.firstSeenAt) {
    return a.stepName.localeCompare(b.stepName);
  }

  return a.firstSeenAt.localeCompare(b.firstSeenAt);
};

export const applyExecutionEvent = (state: ExecutionStoreState, event: ExecutionEvent): ExecutionStoreState => {
  const currentExecution = state.executions[event.executionId];
  const nextExecution: ExecutionRecord = currentExecution
    ? {
        ...currentExecution,
        steps: { ...currentExecution.steps },
        stepDetails: { ...currentExecution.stepDetails },
      }
    : {
        executionId: event.executionId,
        isActive: true,
        steps: {},
        stepDetails: {},
      };

  const nextOrder = currentExecution ? state.executionOrder : [...state.executionOrder, event.executionId];

  nextExecution.lastEventAt = event.timestamp;
  nextExecution.lastEventId = event.id;

  const known = event.knownType ?? 'unknown';
  if (known === 'execution_end') {
    nextExecution.isActive = false;
  }

  if (known === 'execution_start') {
    nextExecution.isActive = true;
  }

  if (event.stepName) {
    const existing = nextExecution.steps[event.stepName];
    const nextStatus = toStepStatus(event);

    if (existing) {
      nextExecution.steps[event.stepName] = {
        ...existing,
        status: nextStatus ?? existing.status,
        lastUpdatedAt: event.timestamp,
      };
    } else {
      nextExecution.steps[event.stepName] = {
        stepName: event.stepName,
        status: nextStatus ?? 'pending',
        firstSeenAt: event.timestamp,
        lastUpdatedAt: event.timestamp,
      };
    }

    const nextDetail = extractStepDetailFromEvent(event, nextExecution.stepDetails[event.stepName]);
    if (nextDetail) {
      nextExecution.stepDetails[event.stepName] = nextDetail;
    }
  }

  return {
    executions: {
      ...state.executions,
      [event.executionId]: nextExecution,
    },
    executionOrder: nextOrder,
    lastEventId: event.id,
  };
};

export const getSortedSteps = (execution?: ExecutionRecord): ExecutionStep[] => {
  if (!execution) {
    return [];
  }

  return Object.values(execution.steps).sort(compareByTimeThenName);
};

export interface ExecutionSummary {
  executionId: string;
  isActive: boolean;
  stepCount: number;
  lastEventAt?: string;
}

export const getExecutionSummaries = (state: ExecutionStoreState): ExecutionSummary[] => {
  return state.executionOrder
    .map((executionId) => state.executions[executionId])
    .filter((execution): execution is ExecutionRecord => Boolean(execution))
    .map((execution) => ({
      executionId: execution.executionId,
      isActive: execution.isActive,
      stepCount: Object.keys(execution.steps).length,
      lastEventAt: execution.lastEventAt,
    }));
};

type Listener = () => void;

const createExecutionStore = () => {
  const store = { state: createInitialExecutionStoreState() };
  const listeners = new Set<Listener>();

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState(): ExecutionStoreState {
      return store.state;
    },
    reset(): void {
      store.state = createInitialExecutionStoreState();
      emit();
    },
    receiveEvent(event: ExecutionEvent): void {
      store.state = applyExecutionEvent(store.state, event);
      emit();
    },
  };
};

export const executionStore = createExecutionStore();

export const useExecutionStore = <T>(selector: (state: ExecutionStoreState) => T): T => {
  return useSyncExternalStore(executionStore.subscribe, () => selector(executionStore.getState()));
};

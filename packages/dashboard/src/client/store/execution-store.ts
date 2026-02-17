import { useSyncExternalStore } from 'react';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ExecutionEvent {
  id: string;
  executionId: string;
  timestamp: string;
  type: string;
  knownType?: string;
  stepName?: string;
  status?: 'running' | 'completed' | 'failed' | 'waiting' | 'skipped';
  payload?: Record<string, unknown>;
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
  const known = event.knownType ?? event.type;

  if (event.status === 'failed') {
    return 'failed';
  }

  if (known === 'step_start') {
    return 'running';
  }

  if (known === 'step_end') {
    return event.status === 'failed' ? 'failed' : 'completed';
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
      }
    : {
        executionId: event.executionId,
        isActive: true,
        steps: {},
      };

  const nextOrder = currentExecution ? state.executionOrder : [...state.executionOrder, event.executionId];

  nextExecution.lastEventAt = event.timestamp;
  nextExecution.lastEventId = event.id;

  const known = event.knownType ?? event.type;
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
  let state = createInitialExecutionStoreState();
  const listeners = new Set<Listener>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState(): ExecutionStoreState {
      return state;
    },
    reset(): void {
      state = createInitialExecutionStoreState();
      emit();
    },
    receiveEvent(event: ExecutionEvent): void {
      state = applyExecutionEvent(state, event);
      emit();
    },
  };
};

export const executionStore = createExecutionStore();

export const useExecutionStore = <T>(selector: (state: ExecutionStoreState) => T): T => {
  return useSyncExternalStore(executionStore.subscribe, () => selector(executionStore.getState()));
};

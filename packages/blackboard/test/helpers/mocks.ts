/**
 * @module test/helpers/mocks
 * @description 테스트용 모킹 유틸리티
 */

import { vi, type Mock } from 'vitest';
import type {
  AgentId,
  TaskId,
  AgendaId,
  AgentRole,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  Stance,
  VotingMethod,
  AgentStatus,
  Task,
  Agenda,
  Opinion,
  Fact,
  Inference,
  Pattern,
  EventHandler,
  Event,
} from '../../src';

/**
 * Mock 함수 타입
 */
export type MockedFunction<T extends (...args: any[]) => any> = Mock<Parameters<T>, ReturnType<T>>;

/**
 * Mock 이벤트 핸들러
 */
export interface MockEventHandler {
  fn: EventHandler;
  mock: MockedFunction<EventHandler>;
  timesCalled: number;
}

/**
 * Mock 이벤트 핸들러 생성
 */
export function createMockEventHandler(type: string): MockEventHandler {
  const mock = vi.fn();
  const handler: EventHandler = (event: Event) => {
    mock(event);
  };

  return {
    fn: handler,
    mock,
    get timesCalled() {
      return mock.mock.calls.length;
    },
  };
}

/**
 * Mock 에이전트 생성기
 */
export function mockAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  return {
    id: overrides.id ?? ('agent-mock' as AgentId),
    role: overrides.role ?? 'analyst',
    status: overrides.status ?? AgentStatusEnum.IDLE,
    currentTask: overrides.currentTask ?? null,
    lastHeartbeat: overrides.lastHeartbeat ?? new Date('2026-02-06T12:00:00Z'),
    metadata: overrides.metadata ?? {},
    createdAt: overrides.createdAt ?? new Date('2026-02-06T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-06T12:00:00Z'),
  };
}

/**
 * Mock 작업 생성기
 */
export function mockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? ('task-mock' as TaskId),
    name: overrides.name ?? 'Mock Task',
    description: overrides.description ?? 'A mock task for testing',
    assignedTo: overrides.assignedTo ?? null,
    status: overrides.status ?? TaskStatus.PENDING,
    priority: overrides.priority ?? TaskPriority.NORMAL,
    inputs: overrides.inputs ?? {},
    outputs: overrides.outputs ?? null,
    dependsOn: overrides.dependsOn ?? [],
    error: overrides.error ?? null,
    startedAt: overrides.startedAt ?? null,
    completedAt: overrides.completedAt ?? null,
    timeout: overrides.timeout ?? null,
    version: overrides.version ?? 1,
    createdAt: overrides.createdAt ?? new Date('2026-02-06T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-06T10:00:00Z'),
  };
}

/**
 * Mock 안건 생성기
 */
export function mockAgenda(overrides: Partial<Agenda> = {}): Agenda {
  return {
    id: overrides.id ?? ('agenda-mock' as AgendaId),
    title: overrides.title ?? 'Mock Agenda',
    description: overrides.description ?? 'A mock agenda for testing',
    proposer: overrides.proposer ?? ('agent-mock' as AgentId),
    status: overrides.status ?? AgendaStatus.SUBMITTED,
    deadline: overrides.deadline ?? new Date('2026-02-10T12:00:00Z'),
    requiredQuorum: overrides.requiredQuorum ?? 3,
    votingMethod: overrides.votingMethod ?? 'majority',
    priority: overrides.priority ?? 5,
    tags: overrides.tags ?? ['test', 'mock'],
    attachments: overrides.attachments ?? [],
    version: overrides.version ?? 1,
    createdAt: overrides.createdAt ?? new Date('2026-02-06T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-06T10:00:00Z'),
  };
}

/**
 * Mock 의견 생성기
 */
export function mockOpinion(overrides: Partial<Opinion> = {}): Opinion {
  return {
    agentId: overrides.agentId ?? ('agent-mock' as AgentId),
    agendaId: overrides.agendaId ?? ('agenda-mock' as AgendaId),
    stance: overrides.stance ?? 'approve',
    reason: overrides.reason ?? 'Mock reason',
    conditions: overrides.conditions ?? [],
    confidence: overrides.confidence ?? 0.9,
    references: overrides.references ?? [],
    createdAt: overrides.createdAt ?? new Date('2026-02-06T10:00:00Z'),
    updatedAt: overrides.updatedAt ?? new Date('2026-02-06T10:00:00Z'),
  };
}

/**
 * Mock 사실(Fact) 생성기
 */
export function mockFact(overrides: Partial<Fact> = {}): Fact {
  const now = new Date('2026-02-06T12:00:00Z');
  return {
    id: overrides.id ?? `fact-${Date.now()}`,
    content: overrides.content ?? 'Mock fact',
    source: overrides.source ?? ('agent-mock' as AgentId),
    confidence: overrides.confidence ?? 0.9,
    category: overrides.category ?? 'test',
    tags: overrides.tags ?? [],
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

/**
 * Mock 추론(Inference) 생성기
 */
export function mockInference(overrides: Partial<Inference> = {}): Inference {
  const now = new Date('2026-02-06T12:00:00Z');
  return {
    id: overrides.id ?? `inference-${Date.now()}`,
    conclusion: overrides.conclusion ?? 'Mock inference conclusion',
    premises: overrides.premises ?? ['fact-1', 'fact-2'],
    confidence: overrides.confidence ?? 0.8,
    source: overrides.source ?? ('agent-mock' as AgentId),
    category: overrides.category ?? 'test',
    tags: overrides.tags ?? [],
    expiresAt: overrides.expiresAt ?? null,
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

/**
 * Mock 패턴(Pattern) 생성기
 */
export function mockPattern(overrides: Partial<Pattern> = {}): Pattern {
  const now = new Date('2026-02-06T12:00:00Z');
  return {
    id: overrides.id ?? `pattern-${Date.now()}`,
    name: overrides.name ?? 'Mock pattern',
    description: overrides.description ?? 'A mock pattern for testing',
    confidence: overrides.confidence ?? 0.85,
    occurrences: overrides.occurrences ?? 5,
    lastSeen: overrides.lastSeen ?? now,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
  };
}

/**
 * Mock 이벤트 생성기
 */
export function mockEvent<T extends Event = Event>(overrides: Partial<T> = {}): T {
  return {
    id: overrides.id ?? `event-${Date.now()}`,
    type: overrides.type ?? ('test.mock' as T['type']),
    timestamp: overrides.timestamp ?? new Date('2026-02-06T12:00:00Z'),
    source: overrides.source ?? 'system',
    payload: overrides.payload ?? {},
  } as T;
}

/**
 * 복수의 Mock 에이전트 생성
 */
export function mockAgents(count: number, overrides?: Partial<AgentStatus>): AgentStatus[] {
  return Array.from({ length: count }, (_, i) =>
    mockAgent({
      ...overrides,
      id: `agent-mock-${i}` as AgentId,
    })
  );
}

/**
 * 복수의 Mock 작업 생성
 */
export function mockTasks(count: number, overrides?: Partial<Task>): Task[] {
  return Array.from({ length: count }, (_, i) =>
    mockTask({
      ...overrides,
      id: `task-mock-${i}` as TaskId,
      name: overrides?.name ?? `Mock Task ${i}`,
    })
  );
}

/**
 * 복수의 Mock 안건 생성
 */
export function mockAgendas(count: number, overrides?: Partial<Agenda>): Agenda[] {
  return Array.from({ length: count }, (_, i) =>
    mockAgenda({
      ...overrides,
      id: `agenda-mock-${i}` as AgendaId,
      title: overrides?.title ?? `Mock Agenda ${i}`,
    })
  );
}

/**
 * 복수의 Mock 의견 생성
 */
export function mockOpinions(count: number, overrides?: Partial<Opinion>): Opinion[] {
  return Array.from({ length: count }, (_, i) =>
    mockOpinion({
      ...overrides,
      agentId: overrides?.agentId ?? (`agent-mock-${i}` as AgentId),
    })
  );
}

/**
 * 에이전트 역할 Mock 데이터 생성
 */
export function mockAgentRoles(): AgentRole[] {
  return ['analyst', 'executor', 'verifier', 'director'];
}

/**
 * 에이전트 상태 Mock 데이터 생성
 */
export function mockAgentStatuses(): AgentStatusEnum[] {
  return Object.values(AgentStatusEnum);
}

/**
 * 작업 상태 Mock 데이터 생성
 */
export function mockTaskStatuses(): TaskStatus[] {
  return Object.values(TaskStatus);
}

/**
 * 작업 우선순위 Mock 데이터 생성
 */
export function mockTaskPriorities(): TaskPriority[] {
  return Object.values(TaskPriority);
}

/**
 * 안건 상태 Mock 데이터 생성
 */
export function mockAgendaStatuses(): AgendaStatus[] {
  return Object.values(AgendaStatus);
}

/**
 * 입장(Stance) Mock 데이터 생성
 */
export function mockStances(): Stance[] {
  return ['approve', 'reject', 'conditional', 'abstain'];
}

/**
 * 투표 방식 Mock 데이터 생성
 */
export function mockVotingMethods(): VotingMethod[] {
  return ['majority', 'unanimous', 'weighted', 'supermajority'];
}

/**
 * Mock EventBus용 가상 구독자 관리자
 */
export class MockSubscriptionManager {
  private subscriptions: Map<string, Set<MockEventHandler>> = new Map();

  /**
   * 핸들러 등록
   */
  subscribe(eventType: string): MockEventHandler {
    const handler = createMockEventHandler(eventType);

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, new Set());
    }
    this.subscriptions.get(eventType)!.add(handler);

    return handler;
  }

  /**
   * 핸들러 해제
   */
  unsubscribe(eventType: string, handler: MockEventHandler): void {
    const handlers = this.subscriptions.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * 모든 핸들러 가져오기
   */
  getHandlers(eventType?: string): MockEventHandler[] {
    if (eventType) {
      return Array.from(this.subscriptions.get(eventType) ?? []);
    }
    // eventType이 없으면 모든 핸들러 반환
    const allHandlers: MockEventHandler[] = [];
    for (const handlers of this.subscriptions.values()) {
      allHandlers.push(...Array.from(handlers));
    }
    return allHandlers;
  }

  /**
   * 모든 핸들러 초기화
   */
  clear(): void {
    this.subscriptions.clear();
  }

  /**
   * Mock 정리 (mockRestore 호출 포함)
   */
  mockRestore(): void {
    for (const handlers of this.subscriptions.values()) {
      for (const handler of handlers) {
        handler.mock.mockRestore();
      }
    }
    this.clear();
  }

  /**
   * 모든 핸들러의 호출 횟수 합계
   */
  totalCalls(eventType: string): number {
    return this.getHandlers(eventType).reduce((sum, h) => sum + h.timesCalled, 0);
  }
}

/**
 * 비동기 함수 Mock 생성기
 */
export function createAsyncMock<T>(
  resolveValue: T,
  delay: number = 0
): MockedFunction<() => Promise<T>> {
  return vi.fn(async () => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    return resolveValue;
  });
}

/**
 * 에러를 던지는 비동기 Mock 생성기
 */
export function createAsyncErrorMock<T>(
  error: Error,
  delay: number = 0
): MockedFunction<() => Promise<T>> {
  return vi.fn(async () => {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    throw error;
  });
}

/**
 * 타이머 Mock 설정 헬퍼
 */
export function setupTimers(baseDate: Date = new Date('2026-02-06T12:00:00Z')) {
  vi.useFakeTimers();
  vi.setSystemTime(baseDate);

  return {
    advance: (ms: number) => vi.advanceTimersByTime(ms),
    now: () => vi.getSystemTime(),
    restore: () => {
      vi.useRealTimers();
    },
  };
}

/**
 * 콘솔 로그 Mock 설정
 */
export function mockConsole(): {
  log: MockedFunction<typeof console.log>;
  error: MockedFunction<typeof console.error>;
  warn: MockedFunction<typeof console.warn>;
  restore: () => void;
} {
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

  return {
    log,
    error,
    warn,
    restore: () => {
      log.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    },
  };
}

/**
 * Math.random Mock 설정
 */
export function mockRandomSequence(values: number[]): MockedFunction<typeof Math.random> {
  let index = 0;
  return vi.spyOn(Math, 'random').mockImplementation(() => {
    const value = values[index % values.length];
    index++;
    return value;
  });
}

/**
 * ID 생성기 Mock 설정
 */
export function mockIdGenerator(prefix: string = 'mock'): MockedFunction<() => string> {
  let counter = 0;
  return vi.fn(() => `${prefix}-${++counter}`);
}

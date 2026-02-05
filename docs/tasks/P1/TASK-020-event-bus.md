# TASK-020: Event Bus 구현

## 개요
- **상태**: 📋 대기
- **우선순위**: P1
- **예상 소요**: 6시간
- **담당**: 개발자
- **의존성**: TASK-019 (Blackboard Core)

## 목표
Node.js EventEmitter 기반의 Event Bus 구현. Pub/Sub 패턴, 이벤트 필터링, 와일드카드 구독 지원.

---

## 작업 내용

### 1. 이벤트 타입 정의 (`events/types.ts`)

```typescript
import type { 
  AgentId, 
  TaskId, 
  AgendaId,
  BoardPhase,
  AgentStatus,
  TaskError,
  TaskStatus,
  AgendaStatus,
  Task,
  Agenda,
  Opinion,
  Resolution,
  Fact,
  Inference,
} from '../types';

/**
 * 이벤트 카테고리
 */
export type EventCategory = 
  | 'state'      // 상태 변경
  | 'knowledge'  // 지식 변경
  | 'decision'   // 의사결정 관련
  | 'task'       // 작업 관련
  | 'agent'      // 에이전트 관련
  | 'system';    // 시스템 이벤트

/**
 * 기본 이벤트 인터페이스
 */
export interface BaseEvent {
  /** 이벤트 ID (고유) */
  readonly id: string;
  /** 이벤트 타입 (예: 'state.phase.changed') */
  readonly type: string;
  /** 발생 시간 */
  readonly timestamp: Date;
  /** 발생 소스 (에이전트 ID 또는 'system') */
  readonly source: AgentId | 'system';
  /** 상관 ID (관련 이벤트 추적용) */
  readonly correlationId?: string;
}

// === State Events ===

/**
 * 단계 변경 이벤트
 */
export interface PhaseChangedEvent extends BaseEvent {
  type: 'state.phase.changed';
  payload: {
    previousPhase: BoardPhase;
    newPhase: BoardPhase;
  };
}

/**
 * 컨텍스트 업데이트 이벤트
 */
export interface ContextUpdatedEvent extends BaseEvent {
  type: 'state.context.updated';
  payload: {
    key: string;
    previousValue: unknown;
    newValue: unknown;
  };
}

/**
 * 에이전트 등록 이벤트 (spec 호환)
 */
export interface StateAgentRegisteredEvent extends BaseEvent {
  type: 'state.agent.registered';
  payload: {
    agent: AgentStatus;
  };
}

/**
 * 에이전트 업데이트 이벤트 (spec 호환)
 */
export interface StateAgentUpdatedEvent extends BaseEvent {
  type: 'state.agent.updated';
  payload: {
    agentId: AgentId;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
  };
}

/**
 * 작업 생성 이벤트 (spec 호환)
 */
export interface StateTaskCreatedEvent extends BaseEvent {
  type: 'state.task.created';
  payload: {
    task: Task;
  };
}

/**
 * 작업 할당 이벤트 (spec 호환)
 */
export interface StateTaskAssignedEvent extends BaseEvent {
  type: 'state.task.assigned';
  payload: {
    taskId: TaskId;
    assignedTo: AgentId;
  };
}

/**
 * 작업 완료 이벤트 (spec 호환)
 */
export interface StateTaskCompletedEvent extends BaseEvent {
  type: 'state.task.completed';
  payload: {
    taskId: TaskId;
    result: unknown;
    duration: number; // ms
  };
}

/**
 * 작업 실패 이벤트 (spec 호환)
 */
export interface StateTaskFailedEvent extends BaseEvent {
  type: 'state.task.failed';
  payload: {
    taskId: TaskId;
    error: TaskError;
    retryable: boolean;
  };
}

// === Agent Events (기존 호환성 유지) ===

/**
 * 에이전트 등록 이벤트
 */
export interface AgentRegisteredEvent extends BaseEvent {
  type: 'agent.registered';
  payload: {
    agent: AgentStatus;
  };
}

/**
 * 에이전트 상태 변경 이벤트
 */
export interface AgentStatusChangedEvent extends BaseEvent {
  type: 'agent.status.changed';
  payload: {
    agentId: AgentId;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
  };
}

/**
 * 에이전트 제거 이벤트
 */
export interface AgentRemovedEvent extends BaseEvent {
  type: 'agent.removed';
  payload: {
    agentId: AgentId;
    reason: string;
  };
}

// === Task Events (기존 호환성 유지) ===

/**
 * 작업 생성 이벤트
 */
export interface TaskCreatedEvent extends BaseEvent {
  type: 'task.created';
  payload: {
    task: Task;
  };
}

/**
 * 작업 할당 이벤트
 */
export interface TaskAssignedEvent extends BaseEvent {
  type: 'task.assigned';
  payload: {
    taskId: TaskId;
    assignedTo: AgentId;
  };
}

/**
 * 작업 상태 변경 이벤트
 */
export interface TaskStatusChangedEvent extends BaseEvent {
  type: 'task.status.changed';
  payload: {
    taskId: TaskId;
    previousStatus: TaskStatus;
    newStatus: TaskStatus;
  };
}

/**
 * 작업 완료 이벤트
 */
export interface TaskCompletedEvent extends BaseEvent {
  type: 'task.completed';
  payload: {
    taskId: TaskId;
    result: unknown;
    duration: number; // ms
  };
}

/**
 * 작업 실패 이벤트
 */
export interface TaskFailedEvent extends BaseEvent {
  type: 'task.failed';
  payload: {
    taskId: TaskId;
    error: TaskError;
    retryable: boolean;
  };
}

// === Decision Events ===

/**
 * 안건 생성 이벤트 (spec 호환)
 */
export interface DecisionsAgendaCreatedEvent extends BaseEvent {
  type: 'decisions.agenda.created';
  payload: {
    agenda: Agenda;
  };
}

/**
 * 안건 시작 이벤트 (spec 호환)
 */
export interface DecisionsAgendaStartedEvent extends BaseEvent {
  type: 'decisions.agenda.started';
  payload: {
    agendaId: AgendaId;
  };
}

/**
 * 의견 제출 이벤트 (spec 호환)
 */
export interface DecisionsOpinionSubmittedEvent extends BaseEvent {
  type: 'decisions.opinion.submitted';
  payload: {
    opinion: Opinion;
  };
}

/**
 * 투표 시작 이벤트 (spec 호환)
 */
export interface DecisionsVotingStartedEvent extends BaseEvent {
  type: 'decisions.voting.started';
  payload: {
    agendaId: AgendaId;
    deadline: Date;
  };
}

/**
 * 투표 제출 이벤트 (spec 호환)
 */
export interface DecisionsVoteSubmittedEvent extends BaseEvent {
  type: 'decisions.vote.submitted';
  payload: {
    agendaId: AgendaId;
    agentId: AgentId;
    vote: 'approve' | 'reject' | 'abstain';
  };
}

/**
 * 투표 종료 이벤트 (spec 호환)
 */
export interface DecisionsVotingEndedEvent extends BaseEvent {
  type: 'decisions.voting.ended';
  payload: {
    agendaId: AgendaId;
    result: Resolution;
  };
}

/**
 * 합의 도달 이벤트 (spec 호환)
 */
export interface DecisionsConsensusReachedEvent extends BaseEvent {
  type: 'decisions.consensus.reached';
  payload: {
    resolution: Resolution;
  };
}

/**
 * 안건 해결 이벤트 (spec 호환)
 */
export interface DecisionsAgendaResolvedEvent extends BaseEvent {
  type: 'decisions.agenda.resolved';
  payload: {
    agendaId: AgendaId;
    resolution: Resolution;
  };
}

/**
 * 안건 제출 이벤트 (기존 호환성 유지)
 */
export interface AgendaSubmittedEvent extends BaseEvent {
  type: 'decision.agenda.submitted';
  payload: {
    agenda: Agenda;
  };
}

/**
 * 안건 상태 변경 이벤트
 */
export interface AgendaStatusChangedEvent extends BaseEvent {
  type: 'decision.agenda.status.changed';
  payload: {
    agendaId: AgendaId;
    previousStatus: AgendaStatus;
    newStatus: AgendaStatus;
  };
}

/**
 * 의견 제출 이벤트
 */
export interface OpinionSubmittedEvent extends BaseEvent {
  type: 'decision.opinion.submitted';
  payload: {
    opinion: Opinion;
  };
}

/**
 * 투표 요청 이벤트
 */
export interface VoteRequestedEvent extends BaseEvent {
  type: 'decision.vote.requested';
  payload: {
    agendaId: AgendaId;
    deadline: Date;
    requiredVoters: AgentId[];
  };
}

/**
 * 합의 도달 이벤트
 */
export interface ConsensusReachedEvent extends BaseEvent {
  type: 'decision.consensus.reached';
  payload: {
    resolution: Resolution;
  };
}

// === Knowledge Events ===

/**
 * 사실 추가 이벤트
 */
export interface FactAddedEvent extends BaseEvent {
  type: 'knowledge.fact.added';
  payload: {
    fact: Fact;
  };
}

/**
 * 추론 추가 이벤트
 */
export interface InferenceAddedEvent extends BaseEvent {
  type: 'knowledge.inference.added';
  payload: {
    inference: Inference;
  };
}

/**
 * 패턴 학습 이벤트 (spec 호환)
 */
export interface KnowledgePatternLearnedEvent extends BaseEvent {
  type: 'knowledge.pattern.learned';
  payload: {
    pattern: Pattern;
  };
}

// === System Events ===

/**
 * 스냅샷 생성 이벤트 (spec 호환)
 */
export interface SystemSnapshotCreatedEvent extends BaseEvent {
  type: 'system.snapshot.created';
  payload: {
    snapshotId: string;
    timestamp: Date;
  };
}

/**
 * 스냅샷 복원 이벤트 (spec 호환)
 */
export interface SystemSnapshotRestoredEvent extends BaseEvent {
  type: 'system.snapshot.restored';
  payload: {
    snapshotId: string;
    timestamp: Date;
  };
}

/**
 * 시스템 오류 이벤트
 */
export interface SystemErrorEvent extends BaseEvent {
  type: 'system.error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 버전 충돌 이벤트
 */
export interface VersionConflictEvent extends BaseEvent {
  type: 'system.version.conflict';
  payload: {
    path: string;
    expectedVersion: number;
    actualVersion: number;
  };
}

// === Union Type ===

/**
 * 모든 이벤트 타입 유니온
 */
export type BlackboardEvent =
  // State
  | PhaseChangedEvent
  | ContextUpdatedEvent
  | StateAgentRegisteredEvent
  | StateAgentUpdatedEvent
  | StateTaskCreatedEvent
  | StateTaskAssignedEvent
  | StateTaskCompletedEvent
  | StateTaskFailedEvent
  // Agent (기존 호환성)
  | AgentRegisteredEvent
  | AgentStatusChangedEvent
  | AgentRemovedEvent
  // Task (기존 호환성)
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  // Decision (spec 호환)
  | DecisionsAgendaCreatedEvent
  | DecisionsAgendaStartedEvent
  | DecisionsOpinionSubmittedEvent
  | DecisionsVotingStartedEvent
  | DecisionsVoteSubmittedEvent
  | DecisionsVotingEndedEvent
  | DecisionsConsensusReachedEvent
  | DecisionsAgendaResolvedEvent
  // Decision (기존 호환성)
  | AgendaSubmittedEvent
  | AgendaStatusChangedEvent
  | OpinionSubmittedEvent
  | VoteRequestedEvent
  | ConsensusReachedEvent
  // Knowledge
  | FactAddedEvent
  | InferenceAddedEvent
  | KnowledgePatternLearnedEvent
  // System
  | SystemSnapshotCreatedEvent
  | SystemSnapshotRestoredEvent
  | SystemErrorEvent
  | VersionConflictEvent;

/**
 * 이벤트 타입 문자열 유니온
 */
export type EventType = BlackboardEvent['type'];

/**
 * 이벤트 타입에서 이벤트 추출
 */
export type EventByType<T extends EventType> = Extract<BlackboardEvent, { type: T }>;
```

### 2. Event Bus 클래스 (`events/event-bus.ts`)

```typescript
import { EventEmitter } from 'events';
import type { 
  BlackboardEvent, 
  EventType, 
  EventByType,
  BaseEvent,
  EventCategory,
} from './types';

/**
 * 이벤트 핸들러 타입
 */
export type EventHandler<T extends BlackboardEvent = BlackboardEvent> = (event: T) => void | Promise<void>;

/**
 * 구독 해제 함수
 */
export type Unsubscribe = () => void;

/**
 * 이벤트 필터 조건
 */
export interface EventFilter {
  /** 소스 에이전트 ID */
  source?: AgentId | 'system';
  /** 상관 ID */
  correlationId?: string;
  /** 커스텀 필터 함수 */
  predicate?: (event: BlackboardEvent) => boolean;
}

/**
 * Event Bus 설정
 */
export interface EventBusOptions {
  /** 최대 리스너 수 (기본: 100) */
  maxListeners?: number;
  /** 비동기 핸들러 에러 시 throw 여부 (기본: false) */
  throwOnAsyncError?: boolean;
  /** 이벤트 히스토리 유지 개수 (기본: 0 = 유지 안함) */
  historySize?: number;
  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * Event Bus 통계
 */
export interface EventBusStats {
  /** 총 발행된 이벤트 수 */
  totalEmitted: number;
  /** 타입별 발행 수 */
  emittedByType: Map<string, number>;
  /** 현재 구독자 수 */
  subscriberCount: number;
  /** 타입별 구독자 수 */
  subscribersByType: Map<string, number>;
}

/**
 * Event Bus
 * @description Blackboard 이벤트를 위한 Pub/Sub 시스템
 * 
 * @example
 * ```typescript
 * const bus = new EventBus({ historySize: 100 });
 * 
 * // 특정 이벤트 구독
 * const unsub = bus.subscribe('task.completed', (event) => {
 *   console.log('Task completed:', event.payload.taskId);
 * });
 * 
 * // 와일드카드 구독
 * bus.subscribe('task.*', (event) => {
 *   console.log('Task event:', event.type);
 * });
 * 
 * // 모든 이벤트 구독
 * bus.subscribe('*', (event) => {
 *   console.log('Any event:', event.type);
 * });
 * 
 * // 필터와 함께 구독
 * bus.subscribeWithFilter('decision.*', 
 *   { source: createAgentId('ceo') },
 *   (event) => console.log('CEO decision event')
 * );
 * 
 * // 이벤트 발행
 * bus.emit({
 *   id: generateId(),
 *   type: 'task.completed',
 *   timestamp: new Date(),
 *   source: createAgentId('executor-1'),
 *   payload: { taskId: createTaskId('task-1'), result: {}, duration: 5000 }
 * });
 * 
 * // 구독 해제
 * unsub();
 * ```
 */
export class EventBus extends EventEmitter {
  private readonly options: Required<EventBusOptions>;
  private history: BlackboardEvent[];
  private stats: EventBusStats;
  private wildcardSubscribers: Map<string, Set<EventHandler>>;
  private filterMap: WeakMap<EventHandler, EventFilter>;

  constructor(options: EventBusOptions = {}) {
    super();
    this.options = this.normalizeOptions(options);
    this.history = [];
    this.stats = this.createInitialStats();
    this.wildcardSubscribers = new Map();
    this.filterMap = new WeakMap();
    
    this.setMaxListeners(this.options.maxListeners);
  }

  // === 구독 API ===

  /**
   * 이벤트 구독
   * @param eventType - 이벤트 타입 (와일드카드 지원: 'task.*', '*')
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribe<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe;

  /**
   * 필터와 함께 구독
   * @param eventType - 이벤트 타입
   * @param filter - 필터 조건
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribeWithFilter<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    filter: EventFilter,
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe;

  /**
   * 일회성 구독
   * @param eventType - 이벤트 타입
   * @param handler - 이벤트 핸들러
   * @returns 구독 해제 함수
   */
  subscribeOnce<T extends EventType>(
    eventType: T,
    handler: EventHandler<EventByType<T>>
  ): Unsubscribe;

  /**
   * 구독 해제
   * @param eventType - 이벤트 타입
   * @param handler - 제거할 핸들러
   */
  unsubscribe<T extends EventType>(
    eventType: T | `${EventCategory}.*` | '*',
    handler: EventHandler<EventByType<T>>
  ): void;

  // === 발행 API ===

  /**
   * 이벤트 발행
   * @param event - 발행할 이벤트
   */
  emit<T extends BlackboardEvent>(event: T): void;

  /**
   * 이벤트 발행 (비동기 핸들러 완료 대기)
   * @param event - 발행할 이벤트
   * @returns 모든 핸들러 완료 시 resolve
   */
  emitAsync<T extends BlackboardEvent>(event: T): Promise<void>;

  /**
   * 배치 이벤트 발행
   * @param events - 발행할 이벤트 목록
   */
  emitBatch(events: BlackboardEvent[]): void;

  // === 히스토리 API ===

  /**
   * 이벤트 히스토리 조회
   * @param filter - 필터 조건
   * @param limit - 최대 개수
   * @returns 필터링된 이벤트 목록
   */
  getHistory(filter?: {
    type?: EventType | `${EventCategory}.*`;
    source?: AgentId | 'system';
    since?: Date;
    until?: Date;
  }, limit?: number): BlackboardEvent[];

  /**
   * 히스토리 재생
   * @description 지정된 이벤트들을 다시 발행
   * @param events - 재생할 이벤트 목록
   */
  replay(events: BlackboardEvent[]): void;

  /**
   * 히스토리 클리어
   */
  clearHistory(): void;

  // === 유틸리티 API ===

  /**
   * 통계 조회
   */
  getStats(): EventBusStats;

  /**
   * 모든 구독 해제
   */
  removeAllSubscribers(): void;

  /**
   * 특정 타입의 모든 구독 해제
   */
  removeSubscribersForType(eventType: EventType | `${EventCategory}.*` | '*'): void;

  /**
   * 이벤트 대기 (Promise 기반)
   * @param eventType - 대기할 이벤트 타입
   * @param timeout - 타임아웃 (ms)
   * @returns 발생한 이벤트
   */
  waitFor<T extends EventType>(
    eventType: T,
    timeout?: number
  ): Promise<EventByType<T>>;

  /**
   * 이벤트 대기 (조건 충족 시)
   * @param eventType - 대기할 이벤트 타입
   * @param predicate - 조건 함수
   * @param timeout - 타임아웃 (ms)
   */
  waitForCondition<T extends EventType>(
    eventType: T,
    predicate: (event: EventByType<T>) => boolean,
    timeout?: number
  ): Promise<EventByType<T>>;

  // === 내부 메서드 ===

  /**
   * 와일드카드 패턴 매칭
   * @param pattern - 패턴 (예: 'task.*')
   * @param eventType - 실제 이벤트 타입
   */
  private matchesPattern(pattern: string, eventType: string): boolean;

  /**
   * 필터 적용
   * @param event - 이벤트
   * @param filter - 필터 조건
   */
  private applyFilter(event: BlackboardEvent, filter: EventFilter): boolean;

  /**
   * 히스토리에 이벤트 추가
   */
  private addToHistory(event: BlackboardEvent): void;

  /**
   * 통계 업데이트
   */
  private updateStats(event: BlackboardEvent): void;
}
```

### 3. 이벤트 팩토리 (`events/event-factory.ts`)

```typescript
import type { AgentId, TaskId, AgendaId } from '../types';
import type { BlackboardEvent, EventType } from './types';

/**
 * 이벤트 생성 옵션
 */
export interface CreateEventOptions {
  /** 상관 ID */
  correlationId?: string;
  /** 소스 (기본: 'system') */
  source?: AgentId | 'system';
}

/**
 * 이벤트 팩토리
 * @description 타입 안전한 이벤트 생성
 */
export class EventFactory {
  constructor(private idGenerator: () => string) {}

  // === State Events ===

  /**
   * 단계 변경 이벤트 생성
   */
  createPhaseChanged(
    previousPhase: BoardPhase,
    newPhase: BoardPhase,
    options?: CreateEventOptions
  ): PhaseChangedEvent;

  /**
   * 컨텍스트 업데이트 이벤트 생성
   */
  createContextUpdated(
    key: string,
    previousValue: unknown,
    newValue: unknown,
    options?: CreateEventOptions
  ): ContextUpdatedEvent;

  // === Agent Events ===

  createAgentRegistered(agent: AgentStatus, options?: CreateEventOptions): AgentRegisteredEvent;
  createAgentStatusChanged(
    agentId: AgentId,
    previousStatus: AgentStatus,
    newStatus: AgentStatus,
    options?: CreateEventOptions
  ): AgentStatusChangedEvent;
  createAgentRemoved(agentId: AgentId, reason: string, options?: CreateEventOptions): AgentRemovedEvent;

  // === Task Events ===

  createTaskCreated(task: Task, options?: CreateEventOptions): TaskCreatedEvent;
  createTaskAssigned(taskId: TaskId, assignedTo: AgentId, options?: CreateEventOptions): TaskAssignedEvent;
  createTaskStatusChanged(
    taskId: TaskId,
    previousStatus: TaskStatus,
    newStatus: TaskStatus,
    options?: CreateEventOptions
  ): TaskStatusChangedEvent;
  createTaskCompleted(taskId: TaskId, result: unknown, duration: number, options?: CreateEventOptions): TaskCompletedEvent;
  createTaskFailed(taskId: TaskId, error: TaskError, retryable: boolean, options?: CreateEventOptions): TaskFailedEvent;

  // === Decision Events ===

  createAgendaSubmitted(agenda: Agenda, options?: CreateEventOptions): AgendaSubmittedEvent;
  createAgendaStatusChanged(
    agendaId: AgendaId,
    previousStatus: AgendaStatus,
    newStatus: AgendaStatus,
    options?: CreateEventOptions
  ): AgendaStatusChangedEvent;
  createOpinionSubmitted(opinion: Opinion, options?: CreateEventOptions): OpinionSubmittedEvent;
  createVoteRequested(
    agendaId: AgendaId,
    deadline: Date,
    requiredVoters: AgentId[],
    options?: CreateEventOptions
  ): VoteRequestedEvent;
  createConsensusReached(resolution: Resolution, options?: CreateEventOptions): ConsensusReachedEvent;

  // === Knowledge Events ===

  createFactAdded(fact: Fact, options?: CreateEventOptions): FactAddedEvent;
  createInferenceAdded(inference: Inference, options?: CreateEventOptions): InferenceAddedEvent;

  // === System Events ===

  createSystemError(code: string, message: string, details?: unknown, options?: CreateEventOptions): SystemErrorEvent;
  createVersionConflict(
    path: string,
    expectedVersion: number,
    actualVersion: number,
    options?: CreateEventOptions
  ): VersionConflictEvent;

  // === 헬퍼 ===

  /**
   * 기본 이벤트 속성 생성
   */
  private createBaseEvent(type: EventType, options?: CreateEventOptions): Omit<BaseEvent, 'payload'>;
}
```

### 4. Blackboard-EventBus 통합 (`core/blackboard-events.ts`)

```typescript
import { Blackboard } from './blackboard';
import { EventBus } from '../events/event-bus';
import { EventFactory } from '../events/event-factory';

/**
 * 이벤트 발행 기능이 통합된 Blackboard
 * @description Blackboard의 상태 변경 시 자동으로 이벤트 발행
 */
export class EventAwareBlackboard extends Blackboard {
  public readonly events: EventBus;
  private readonly eventFactory: EventFactory;

  constructor(options: BlackboardOptions & { eventBusOptions?: EventBusOptions }) {
    super(options);
    this.events = new EventBus(options.eventBusOptions);
    this.eventFactory = new EventFactory(() => this.generateId());
    
    this.setupEventEmission();
  }

  /**
   * 상태 변경 시 이벤트 자동 발행 설정
   */
  private setupEventEmission(): void;

  /**
   * 상태 섹션 접근자 오버라이드 (이벤트 발행 포함)
   */
  override get state(): EventAwareStateSectionAccessor;
  override get knowledge(): EventAwareKnowledgeSectionAccessor;
  override get decisions(): EventAwareDecisionsSectionAccessor;
}
```

---

## 파일 구조

```
packages/blackboard/
└── src/
    ├── types/                  # (TASK-018)
    ├── core/                   # (TASK-019)
    │   ├── ...
    │   └── blackboard-events.ts  # EventBus 통합
    └── events/
        ├── index.ts            # Events exports
        ├── types.ts            # 이벤트 타입 정의
        ├── event-bus.ts        # Event Bus 클래스
        └── event-factory.ts    # 이벤트 팩토리
```

---

## 사용 예시

```typescript
import { EventAwareBlackboard, createAgentId } from '@obora-kit/blackboard';

const board = new EventAwareBlackboard({
  sessionId: createSessionId('session-001'),
  eventBusOptions: { historySize: 1000 },
});

// 작업 관련 모든 이벤트 구독 (와일드카드)
board.events.subscribe('task.*', (event) => {
  console.log(`Task event: ${event.type}`);
});

// 특정 이벤트 구독
board.events.subscribe('decision.consensus.reached', (event) => {
  console.log(`Consensus reached: ${event.payload.resolution.decision}`);
});

// 필터와 함께 구독
board.events.subscribeWithFilter(
  'agent.status.changed',
  { source: createAgentId('ceo') },
  (event) => {
    console.log('CEO status changed');
  }
);

// 이벤트 대기
const consensus = await board.events.waitFor('decision.consensus.reached', 60000);

// 상태 변경 시 자동으로 이벤트 발행됨
board.state.phase = 'discussion'; // → PhaseChangedEvent 발행
board.decisions.submitAgenda({...}); // → AgendaSubmittedEvent 발행

// 히스토리 조회
const recentTaskEvents = board.events.getHistory({
  type: 'task.*',
  since: new Date(Date.now() - 3600000), // 1시간 이내
}, 50);
```

---

## 완료 조건

- [ ] 모든 이벤트 타입 정의 완료
- [ ] EventBus 클래스 구현 완료
- [ ] 와일드카드 구독 동작 확인
- [ ] 이벤트 필터링 동작 확인
- [ ] 히스토리 기능 동작 확인
- [ ] Blackboard 통합 완료
- [ ] `tsc --noEmit` 통과

---

## 참고 문서

- [TASK-019: Blackboard Core](./TASK-019-blackboard-core.md)
- [Blackboard + Actor 설계 문서](../../architecture/blackboard-actor-design.md)
- Node.js EventEmitter 문서

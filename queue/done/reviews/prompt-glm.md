<review>
  <mode>checklist_verification</mode>
  <task>
    <name>TASK-024-actor-interface</name>
    <spec><![CDATA[
# TASK-024: Actor 인터페이스 정의

## 개요
- **상태**: 📋 대기
- 우선순위: P1
- 예상 소요: 4시간
- 담당: 개발자
- Phase: Week 3-4

## 목표
Actor 시스템의 핵심 인터페이스와 타입을 정의하여 Blackboard와 Actor 간의 명확한 계약을 수립합니다.

## 작업 내용

### 1. Actor 인터페이스 정의

**파일:** `packages/actor/src/types/actor.ts`

#### Actor 기본 인터페이스

```typescript
/**
 * Actor는 Blackboard와 상호작용하는 독립적인 실행 단위입니다.
 * "뇌(Blackboard) ↔ 손발(Actor)" 패러다임에서 손발 역할을 수행합니다.
 *
 * 스펙 기준: [[spec/13-actor.md|13-actor.md]]
 */
export interface Actor {
  /** 고유 식별자 */
  readonly id: ActorId;

  /** Actor 이름 */
  readonly name: string;

  /** Actor 역할 */
  readonly role: ActorRole;

  /** 연결된 Blackboard 인스턴스 */
  board: IBlackboard;

  /** 메시지 버스 */
  messageBus: IMessageBus;

  /** Actor 현재 상태 */
  readonly status: ActorStatus;

  /** 마지막 활동 시간 */
  lastActivity: Date;

  /** 생성 시간 */
  createdAt: Date;

  /** 실행 메트릭 */
  metrics: ActorMetrics;

  /**
   * 메시지 수신
   * @param message 수신할 메시지
   */
  receive(message: Message): void | Promise<void>;

  /**
   * 관찰 단계: Blackboard에서 필요한 정보를 읽습니다.
   * @returns 관찰된 데이터 (Observation)
   */
  observe(): Observation;

  /**
   * 사고 단계: 관찰된 데이터를 바탕으로 수행할 행동을 결정합니다.
   * @param obs 관찰된 데이터
   * @returns 수행할 행동 (Action)
   */
  think(observation: Observation): Action;

  /**
   * 실행 단계: 결정된 행동을 실제로 수행합니다.
   * @param action 수행할 행동
   * @returns 실행 결과 (Result)
   */
  act(action: Action): Result;

  /**
   * 보고 단계: 실행 결과를 Blackboard에 기록합니다.
   * @param result 실행 결과
   */
  report(result: Result): void;

  /**
   * Actor를 시작합니다.
   */
  start(): void | Promise<void>;

  /**
   * Actor를 정상적으로 종료합니다.
   */
  stop(): void | Promise<void>;

  /**
   * Actor를 재시작합니다.
   */
  restart(): void | Promise<void>;

  /**
   * Actor의 현재 상태를 조회합니다.
   */
  getStatus(): ActorStatus;

  /**
   * Actor가 살아있는지 확인합니다.
   */
  isAlive(): boolean;
}
```

### 2. 타입 정의

#### ActorId

```typescript
/**
 * Actor 고유 식별자
 *
 * 형식: `<role>-<uuid>`
 * 예: analyst-550e8400-e29b-41d4-a716-446655440000
 */
export type ActorId = string;
export type ActionId = string;
export type ResultId = string;
export type TaskId = string;

/**
 * ActorId 유효성 검사
 * @param id 검사할 ActorId
 * @returns 유효 여부
 */
export function isValidActorId(id: string): id is ActorId {
  const pattern = /^([a-z]+)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return pattern.test(id);
}

/**
 * ActorId 생성
 * @param role Actor 역할
 * @returns 새 ActorId
 */
export function createActorId(role: ActorRole): ActorId {
  const uuid = crypto.randomUUID();
  return `${role}-${uuid}`;
}
```

#### ActorLifecycleStatus

```typescript
/**
 * Actor 생명주기 상태 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export enum ActorLifecycleStatus {
  /** 생성됨 */
  CREATED = 'created',

  /** 시작 중 */
  STARTING = 'starting',

  /** 실행 중 */
  RUNNING = 'running',

  /** 대기 중 (작업 없음) */
  IDLE = 'idle',

  /** 작업 중 */
  BUSY = 'busy',

  /** 중지 중 */
  STOPPING = 'stopping',

  /** 중지됨 */
  STOPPED = 'stopped',

  /** 재시작 중 */
  RESTARTING = 'restarting',

  /** 에러 상태 */
  ERROR = 'error',
}

/**
 * Actor 상태 (스펙 기준)
 *
 * Actor의 현재 상태 정보를 포함하는 인터페이스
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface ActorStatus {
  /** Actor ID */
  id: ActorId;

  /** Actor 이름 */
  name: string;

  /** Actor 역할 */
  role: ActorRole;

  /** 생명주기 상태 */
  status: ActorLifecycleStatus;

  /** 메시지 큐 상태 */
  messageQueue: {
    pending: number;
    processing: boolean;
  };

  /** 현재 작업 */
  currentTask?: {
    id: TaskId;
    type: string;
    startedAt: Date;
  };

  /** 성능 메트릭 */
  metrics: {
    totalMessagesProcessed: number;
    totalActionsExecuted: number;
    totalErrors: number;
    averageResponseTime: number; // ms
    uptime: number; // ms
  };

  /** 마지막 활동 */
  lastSeen: Date;

  /** 마지막 활동 유형 */
  lastActivity?: 'message_received' | 'action_executed' | 'error_occurred';

  /** 에러 상태 */
  errorCount: number;

  /** 마지막 에러 */
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

/**
 * 상태 전이 유효성 검사 (스펙 기준)
 *
 * 상태 전이 다이어그램:
 * CREATED → STARTING
 * STARTING → RUNNING | ERROR
 * RUNNING → IDLE | BUSY | STOPPING | ERROR
 * IDLE → BUSY | STOPPING
 * BUSY → IDLE | ERROR
 * ERROR → RESTARTING | STOPPING
 * RESTARTING → RUNNING | ERROR
 * STOPPING → STOPPED
 * STOPPED → (터미널 상태)
 *
 * @param current 현재 상태
 * @param next 다음 상태
 * @returns 유효 여부
 */
export function isValidTransition(
  current: ActorLifecycleStatus,
  next: ActorLifecycleStatus
): boolean {
  const transitions: Record<ActorLifecycleStatus, ActorLifecycleStatus[]> = {
    [ActorLifecycleStatus.CREATED]: [ActorLifecycleStatus.STARTING],
    [ActorLifecycleStatus.STARTING]: [ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.RUNNING]: [ActorLifecycleStatus.IDLE, ActorLifecycleStatus.BUSY, ActorLifecycleStatus.STOPPING, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.IDLE]: [ActorLifecycleStatus.BUSY, ActorLifecycleStatus.STOPPING],
    [ActorLifecycleStatus.BUSY]: [ActorLifecycleStatus.IDLE, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.ERROR]: [ActorLifecycleStatus.RESTARTING, ActorLifecycleStatus.STOPPING],
    [ActorLifecycleStatus.RESTARTING]: [ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.STOPPING]: [ActorLifecycleStatus.STOPPED],
    [ActorLifecycleStatus.STOPPED]: [],
  };

  return transitions[current]?.includes(next) ?? false;
}
```

#### ActorRole

```typescript
/**
 * Actor 역할 유형 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export type ActorRole = 'analyst' | 'executor' | 'verifier' | 'director';

/**
 * 역할별 기능 설명 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export const ActorRoleDescription: Record<ActorRole, string> = {
  analyst: '데이터 분석, 추론, 위험 평가 수행',
  executor: 'API 호출, 파일 처리, 외부 작업 실행',
  verifier: '결과 검증, 품질 체크, 오류 탐지',
  director: '회의 진행, 투표 관리, 의사결정 조율',
};

/**
 * 역할별 권한 레벨 (스펙 기준)
 */
export const ActorRoleLevel: Record<ActorRole, number> = {
  analyst: 1,
  executor: 1,
  verifier: 1,
  director: 2, // 상위 레벨
};
```

#### ActorMetrics

```typescript
/**
 * Actor 실행 메트릭
 */
export interface ActorMetrics {
  /** 총 실행 횟수 */
  totalRuns: number;

  /** 성공 횟수 */
  successCount: number;

  /** 실패 횟수 */
  failureCount: number;

  /** 마지막 에러 (있는 경우) */
  lastError: Error | null;

  /** 평균 실행 시간 (ms) */
  averageExecutionTime: number;

  /** 마지막 실행 시간 (ms) */
  lastExecutionTime: number | null;

  /** 총 CPU 시간 (ms) */
  totalCpuTime: number;

  /** 메모리 사용량 (bytes) */
  memoryUsage: number;
}

/**
 * ActorMetrics 초기화
 */
export function createActorMetrics(): ActorMetrics {
  return {
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    lastError: null,
    averageExecutionTime: 0,
    lastExecutionTime: null,
    totalCpuTime: 0,
    memoryUsage: 0,
  };
}
```

### 3. 행동 사이클 타입

#### Observation

```typescript
/**
 * Observation: 보드에서 관찰한 정보 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface Observation {
  /** Actor ID */
  actorId: ActorId;

  /** 관찰 시간 */
  timestamp: Date;

  /** 관찰한 섹션별 데이터 */
  state?: {
    context: Record<string, unknown>;
    agents: unknown[]; // AgentStatus[]
    tasks: unknown[]; // Task[]
  };

  knowledge?: {
    facts: unknown[]; // Fact[]
    inferences: unknown[]; // Inference[]
  };

  decisions?: {
    currentAgenda: unknown | null; // Agenda | null
    opinions: unknown[]; // Opinion[]
  };
}

/**
 * Observation 생성 헬퍼 (스펙 기준)
 */
export function createObservation(
  actorId: ActorId,
  data?: Partial<Observation>
): Observation {
  return {
    actorId,
    timestamp: new Date(),
    ...data,
  };
}
```

#### Action

```typescript
/**
 * Actor가 수행하기로 결정한 행동 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface Action {
  /** 행동 ID */
  id: ActionId;

  /** 수행 Actor ID */
  actorId: ActorId;

  /** 행동 유형 */
  type: ActionType;

  /** 타임스탬프 */
  timestamp: Date;

  /** 액션별 파라미터 */
  params?: Record<string, unknown>;

  /** 관련 태스크 ID (선택사항) */
  taskId?: TaskId;
}

/**
 * 행동 유형 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export type ActionType =
  | 'analyze'           // 분석 수행
  | 'execute'           // 실행 수행
  | 'verify'            // 검증 수행
  | 'coordinate'        // 조율 수행
  | 'submit_opinion'    // 의견 제출
  | 'submit_vote'       // 투표 제출
  | 'create_agenda'     // 안건 생성
  | 'unknown';

/**
 * Action 생성 헬퍼
 */
/**
 * Action 생성 헬퍼 (스펙 기준)
 */
export function createAction(
  actorId: ActorId,
  type: ActionType,
  params?: Record<string, unknown>,
  taskId?: TaskId
): Action {
  return {
    id: crypto.randomUUID(),
    actorId,
    type,
    params,
    taskId,
    timestamp: new Date(),
  };
}
```

#### Result

```typescript
/**
 * Action 실행 결과 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface Result {
  /** 결과 ID */
  id: ResultId;

  /** 원본 Action ID */
  actionId: ActionId;

  /** 수행 Actor ID */
  actorId: ActorId;

  /** 타임스탬프 */
  timestamp: Date;

  /** 상태 */
  status: 'success' | 'failure' | 'partial';

  /** 성공 시 결과 */
  output?: unknown;

  /** 실패 시 에러 */
  error?: string;

  /** 메트릭 */
  metrics?: {
    duration: number; // ms 단위
    memoryUsage?: number;
  };

  /** 보드에 기록할 데이터 */
  toRecord?: {
    section: 'state' | 'knowledge' | 'decisions';
    data: unknown;
  };
}

/**
 * 성공 Result 생성 (스펙 기준)
 */
export function createSuccessResult(
  actionId: ActionId,
  actorId: ActorId,
  output: unknown,
  duration: number
): Result {
  return {
    id: crypto.randomUUID() as ResultId,
    actionId,
    actorId,
    timestamp: new Date(),
    status: 'success',
    output,
    metrics: { duration },
  };
}

/**
 * 실패 Result 생성 (스펙 기준)
 */
export function createFailureResult(
  actionId: ActionId,
  actorId: ActorId,
  error: string,
  duration: number
): Result {
  return {
    id: crypto.randomUUID() as ResultId,
    actionId,
    actorId,
    timestamp: new Date(),
    status: 'failure',
    error,
    metrics: { duration },
  };
}
```

### 4. Blackboard 인터페이스 (Actor 연결용)

**파일:** `packages/actor/src/types/blackboard.ts`

### 5. Message 타입 (스펙 기준)

**파일:** `packages/actor/src/types/message.ts`

```typescript
/**
 * Message 기본 구조 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface Message<T = unknown> {
  /** 메시지 ID */
  id: MessageId;

  /** 메시지 타입 */
  type: MessageType;

  /** 발신자 Actor ID */
  from: ActorId;

  /** 수신자 Actor ID ('broadcast' 시 전체 전송) */
  to: ActorId | 'broadcast';

  /** 메시지 페이로드 */
  payload: T;

  /** 타임스탬프 */
  timestamp: Date;

  /** 응답 연관용 ID */
  correlationId?: string;

  /** 응답 대상 */
  replyTo?: ActorId;

  /** 메시지 우선순위 */
  priority?: MessagePriority;

  /** Time to Live (ms) */
  ttl?: number;

  /** 전달 확인 요청 */
  deliveryReceipt?: boolean;
}

export type MessageId = string;

/**
 * 메시지 우선순위
 */
export enum MessagePriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 메시지 타입 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export enum MessageType {
  // 상태 관련
  STATE_READ = 'state.read',
  STATE_WRITE = 'state.write',
  STATE_SUBSCRIBE = 'state.subscribe',
  STATE_UNSUBSCRIBE = 'state.unsubscribe',

  // 작업 관련
  TASK_ASSIGN = 'task.assign',
  TASK_START = 'task.start',
  TASK_COMPLETE = 'task.complete',
  TASK_FAILED = 'task.failed',
  TASK_CANCEL = 'task.cancel',

  // 의사결정 관련
  DECISION_REQUEST = 'decision.request',
  OPINION_SUBMIT = 'opinion.submit',
  OPINION_REQUEST = 'opinion.request',
  VOTE_SUBMIT = 'vote.submit',
  VOTE_REQUEST = 'vote.request',
  CONSENSUS_REACHED = 'consensus.reached',

  // 시스템 관련
  PING = 'ping',
  PONG = 'pong',
  HEARTBEAT = 'heartbeat',
  STATUS_REQUEST = 'status.request',
  STATUS_RESPONSE = 'status.response',

  // 에러 관련
  ERROR = 'error',
  ERROR_ACK = 'error.ack',

  // 생명주기 관련
  START = 'start',
  STOP = 'stop',
  RESTART = 'restart',
  KILL = 'kill',

  // 사용자 정의
  CUSTOM = 'custom',
}

/**
 * IMessageBus 인터페이스 (스펙 기준)
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface IMessageBus {
  /**
   * 메시지 전송
   */
  send(message: Message): void;

  /**
   * 특정 Actor에 메시지 전송
   */
  sendTo(to: ActorId, message: Omit<Message, 'to'>): void;

  /**
   * 브로드캐스트 전송
   */
  broadcast(message: Omit<Message, 'to'>): void;

  /**
   * 메시지 수신
   */
  receive(handler: (message: Message) => void): void;

  /**
   * 요청-응답 패턴
   */
  request<T>(message: Message, timeoutMs?: number): Promise<Message<T>>;

  /**
   * 메시지 타입 구독
   */
  subscribe(
    messageType: MessageType,
    handler: (message: Message) => void
  ): UnsubscribeFn;

  /**
   * 메시지 큐 크기 조회
   */
  getQueueSize(actorId: ActorId): number;

  /**
   * 메시지 큐 비우기
   */
  clearQueue(actorId: ActorId): void;

  /**
   * 메시지 필터링
   */
  filter(predicate: (message: Message) => boolean): void;
}

/**
 * 구독 취소 함수
 */
export type UnsubscribeFn = () => void;
```

### 6. Blackboard 인터페이스 (Actor 연결용)

**파일:** `packages/actor/src/types/blackboard.ts`

```typescript
/**
 * Actor와 상호작용하는 Blackboard 인터페이스 (스펙 기준: IBlackboard)
 *
 * Actor 시스템에서 필요한 Blackboard의 최소 기능만 정의합니다.
 * 전체 구현은 @obora-kit/blackboard 패키지에서 제공됩니다.
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export interface IBlackboard {
  /**
   * 현재 Blackboard 버전
   */
  readonly version: number;
}
```

### 5. 기본 Actor 구현 (추상 클래스)

**파일:** `packages/actor/src/base/BaseActor.ts`

```typescript
import { Actor, ActorId, ActorRole, ActorStatus, Observation, Action, Result } from '../types/actor';
import { Blackboard } from '../types/blackboard';
import { createActorMetrics, ActorMetrics } from '../types/actor';

/**
 * Actor 구현을 위한 추상 기본 클래스 (스펙 기준)
 *
 * 구체적인 Actor 구현 시 이 클래스를 상속받아 필요한 메서드를 구현합니다.
 *
 * 참고: [[spec/13-actor.md|13-actor.md]]
 */
export abstract class BaseActor implements Actor {
  readonly id: ActorId;
  readonly name: string;
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  private _status: ActorLifecycleStatus;
  lastActivity: Date;
  createdAt: Date;
  metrics: ActorMetrics;

  constructor(
    id: ActorId,
    name: string,
    role: ActorRole,
    board: IBlackboard,
    messageBus: IMessageBus
  ) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this._status = ActorStatus.CREATED;
    this.lastActivity = new Date();
    this.createdAt = new Date();
    this.metrics = createActorMetrics();
  }

  get status(): ActorLifecycleStatus {
    return this._status;
  }

  protected setStatus(newStatus: ActorLifecycleStatus): void {
    if (!isValidTransition(this._status, newStatus)) {
      throw new Error(
        `Invalid status transition: ${this._status} → ${newStatus}`
      );
    }
    this._status = newStatus;
    this.lastActivity = new Date();
  }

  /**
   * 하위 클래스에서 observe()를 구현해야 합니다 (동기).
   */
  abstract observe(): Observation;

  /**
   * 하위 클래스에서 think()를 구현해야 합니다 (동기).
   */
  abstract think(observation: Observation): Action;

  /**
   * 하위 클래스에서 act()를 구현해야 합니다 (동기).
   */
  abstract act(action: Action): Result;

  /**
   * receive()의 기본 구현 - 메시지 처리
   */
  async receive(message: Message): Promise<void> {
    this.updateLastSeen();

    switch (message.type) {
      case MessageType.PING:
        this.handlePing(message);
        break;
      case MessageType.TASK_ASSIGN:
        await this.handleTaskAssign(message);
        break;
      case MessageType.STATUS_REQUEST:
        this.handleStatusRequest(message);
        break;
      case MessageType.STOP:
        await this.stop();
        break;
      case MessageType.RESTART:
        await this.restart();
        break;
      default:
        this.handleCustomMessage(message);
    }
  }

  /**
   * report()의 기본 구현 - Blackboard에 결과 기록 (동기)
   */
  report(result: Result): void {
    if (result.toRecord) {
      const { section, data } = result.toRecord;
      // 동기 write는 인터페이스에 따라 다를 수 있음
      // 실제 구현에서는 비동기로 처리 후 결과 반환
    }

    // 이벤트 발행
    this.messageBus.broadcast({
      id: crypto.randomUUID() as MessageId,
      type: MessageType.TASK_COMPLETE,
      from: this.id,
      to: 'broadcast',
      payload: { taskId: result.actionId, result },
      timestamp: new Date(),
    });
  }

  /**
   * start()의 기본 구현
   */
  async start(): Promise<void> {
    if (this._status === ActorStatus.RUNNING) return;

    this.setStatus(ActorStatus.STARTING);

    try {
      // 메시지 수신 시작
      this.setupMessageHandlers();

      // 상태 변경
      this.setStatus(ActorStatus.RUNNING);

      // 하트비트 시작
      this.startHeartbeat();
    } catch (error) {
      this.setStatus(ActorStatus.ERROR);
      throw error;
    }
  }

  /**
   * stop()의 기본 구현
   */
  async stop(): Promise<void> {
    if (this._status === ActorStatus.STOPPED) return;

    this.setStatus(ActorStatus.STOPPING);

    // 하트비트 정지
    this.stopHeartbeat();

    this.setStatus(ActorStatus.STOPPED);
  }

  /**
   * restart()의 기본 구현
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * isAlive() 기본 구현
   */
  isAlive(): boolean {
    return (
      this._status === ActorStatus.RUNNING ||
      this._status === ActorStatus.IDLE ||
      this._status === ActorStatus.BUSY
    );
  }

  /**
   * 메트릭 업데이트
   */
  protected updateMetrics(result: Result): void {
    this.metrics.totalRuns++;
    if (result.status === 'success') {
      this.metrics.successCount++;
    } else {
      this.metrics.failureCount++;
      this.metrics.lastError = result.error ? new Error(result.error) : null;
    }
    this.metrics.lastExecutionTime = result.metrics?.duration || 0;
    this.metrics.averageExecutionTime =
      (this.metrics.averageExecutionTime * (this.metrics.totalRuns - 1) +
        (result.metrics?.duration || 0)) / this.metrics.totalRuns;
  }

  // ==================== 핸들러 ====================

  private async handleTaskAssign(message: Message): Promise<void> {
    // 작업 수행
    const observation = this.observe();
    const action = this.think(observation);
    const result = this.act(action);
    this.report(result);
  }

  private handlePing(message: Message): void {
    this.messageBus.sendTo(message.from, {
      id: crypto.randomUUID() as MessageId,
      type: MessageType.PONG,
      from: this.id,
      to: message.from,
      payload: {},
      timestamp: new Date(),
    });
  }

  private handleStatusRequest(message: Message): void {
    const status = this.getStatus();

    this.messageBus.sendTo(message.from, {
      id: crypto.randomUUID() as MessageId,
      type: MessageType.STATUS_RESPONSE,
      from: this.id,
      to: message.from,
      payload: { status },
      timestamp: new Date(),
    });
  }

  protected handleCustomMessage(_message: Message): void {
    // 서브클래스에서 오버라이드
  }

  private setupMessageHandlers(): void {
    this.messageBus.subscribe(MessageType.PING, (msg) => this.receive(msg));
    this.messageBus.subscribe(MessageType.TASK_ASSIGN, (msg) =>
      this.receive(msg)
    );
    this.messageBus.subscribe(MessageType.STATUS_REQUEST, (msg) =>
      this.receive(msg)
    );
    this.messageBus.subscribe(MessageType.STOP, (msg) => this.receive(msg));
    this.messageBus.subscribe(MessageType.RESTART, (msg) => this.receive(msg));
  }

  private heartbeatTimer?: NodeJS.Timeout;

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.messageBus.broadcast({
        id: crypto.randomUUID() as MessageId,
        type: MessageType.HEARTBEAT,
        from: this.id,
        to: 'broadcast',
        payload: {
          timestamp: new Date(),
          status: this._status,
        },
        timestamp: new Date(),
      });
    }, 30000); // 30초마다
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = undefined;
    }
  }

  private updateLastSeen(): void {
    this.lastActivity = new Date();
  }
}
```

### 6. 내보내기 설정

**파일:** `packages/actor/src/types/index.ts`

```typescript
export * from './actor';
export * from './blackboard';
export * from './message';
```

**파일:** `packages/actor/src/index.ts`

```typescript
export * from './types';
export * from './base/BaseActor';
```

### 7. 단위 테스트 작성

**파일:** `packages/actor/src/types/__tests__/actor.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  ActorId,
  ActorRole,
  ActorStatus,
  ActorMetrics,
  isValidActorId,
  createActorId,
  isValidTransition,
  createActorMetrics,
  createObservation,
  createAction,
  createSuccessResult,
  createFailureResult,
} from '../actor';

describe('ActorId', () => {
  it('should validate correct ActorId format', () => {
    const validId = 'analyst-550e8400-e29b-41d4-a716-446655440000';
    expect(isValidActorId(validId)).toBe(true);
  });

  it('should reject invalid ActorId formats', () => {
    expect(isValidActorId('invalid')).toBe(false);
    expect(isValidActorId('analyst-123')).toBe(false);
    expect(isValidActorId('550e8400-e29b-41d4-a716-446655440000')).toBe(false);
  });

  it('should create valid ActorId for each role', () => {
    Object.values(ActorRole).forEach((role) => {
      const id = createActorId(role);
      expect(isValidActorId(id)).toBe(true);
      expect(id.startsWith(role)).toBe(true);
    });
  });
});

describe('ActorStatus', () => {
  it('should allow valid transitions', () => {
    expect(isValidTransition(ActorLifecycleStatus.CREATED, ActorLifecycleStatus.STARTING)).toBe(true);
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.IDLE)).toBe(true);
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.STOPPING)).toBe(true);
  });

  it('should reject invalid transitions', () => {
    expect(isValidTransition(ActorLifecycleStatus.CREATED, ActorLifecycleStatus.RUNNING)).toBe(false);
    expect(isValidTransition(ActorLifecycleStatus.STOPPED, ActorLifecycleStatus.RUNNING)).toBe(false);
    expect(isValidTransition(ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.CREATED)).toBe(false);
  });

  it('should handle all status values', () => {
    Object.values(ActorLifecycleStatus).forEach((status) => {
      expect(typeof status).toBe('string');
    });
  });
});

describe('ActorMetrics', () => {
  it('should create initial metrics with zeros', () => {
    const metrics = createActorMetrics();
    expect(metrics.totalRuns).toBe(0);
    expect(metrics.successCount).toBe(0);
    expect(metrics.failureCount).toBe(0);
    expect(metrics.lastError).toBeNull();
    expect(metrics.averageExecutionTime).toBe(0);
    expect(metrics.lastExecutionTime).toBeNull();
  });
});

describe('Observation', () => {
  it('should create observation with timestamp', () => {
    const obs = createObservation('state', { key: 'value' });
    expect(obs.timestamp).toBeInstanceOf(Date);
    expect(obs.section).toBe('state');
    expect(obs.data).toEqual({ key: 'value' });
    expect(obs.metadata.source).toBe('read');
  });

  it('should accept custom metadata', () => {
    const obs = createObservation('state', null, {
      source: 'event',
      latency: 42,
    });
    expect(obs.metadata.source).toBe('event');
    expect(obs.metadata.latency).toBe(42);
  });
});

describe('Action', () => {
  it('should create action with UUID', () => {
    const action = createAction('read', { key: 'value' });
    expect(action.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(action.type).toBe('read');
    expect(action.params).toEqual({ key: 'value' });
    expect(action.priority).toBe(0);
  });

  it('should accept custom options', () => {
    const action = createAction('write', { data: 'test' }, {
      priority: 10,
      target: 'section-1',
    });
    expect(action.priority).toBe(10);
    expect(action.target).toBe('section-1');
  });
});

describe('Result', () => {
  it('should create success result', () => {
    const result = createSuccessResult('action-1', { output: 'value' }, 100);
    expect(result.actionId).toBe('action-1');
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ output: 'value' });
    expect(result.error).toBeNull();
    expect(result.executionTime).toBe(100);
    expect(result.metadata.retryCount).toBe(0);
  });

  it('should create failure result', () => {
    const error = new Error('Test error');
    const result = createFailureResult('action-1', error, 50);
    expect(result.success).toBe(false);
    expect(result.error).toBe(error);
    expect(result.data).toBeNull();
    expect(result.executionTime).toBe(50);
  });
});
```

**파일:** `packages/actor/src/base/__tests__/BaseActor.test.ts`

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ActorRole, ActorStatus } from '../types/actor';
import { Blackboard } from '../types/blackboard';
import { BaseActor } from '../BaseActor';

class TestActor extends BaseActor {
  observe() {
    return { actorId: this.id, timestamp: new Date() };
  }

  think(obs: any) {
    return { id: crypto.randomUUID(), actorId: this.id, type: 'execute' as const, timestamp: new Date() };
  }

  act(action: any) {
    return { id: crypto.randomUUID(), actionId: action.id, actorId: this.id, timestamp: new Date(), status: 'success' as const };
  }
}

describe('BaseActor', () => {
  let mockBoard: Blackboard;
  let actor: TestActor;

  beforeEach(() => {
    mockBoard = {
      read: vi.fn(),
      write: vi.fn(),
      subscribe: vi.fn(),
      version: 1,
    };
    actor = new TestActor('analyst-test-id', 'analyst', mockBoard, {} as any);
  });

  it('should initialize with correct properties', () => {
    expect(actor.id).toBe('analyst-test-id');
    expect(actor.role).toBe('analyst');
    expect(actor.board).toBe(mockBoard);
    expect(actor.status).toBe(ActorLifecycleStatus.CREATED);
  });

  it('should reject invalid status transitions', () => {
    expect(() => {
      actor['setStatus'](ActorLifecycleStatus.RUNNING);
    }).toThrow();
  });

  it('should update metrics on success result', async () => {
    const result = createSuccessResult('1', null, 100);
    await actor.report(result);
    expect(actor.metrics.totalRuns).toBe(1);
    expect(actor.metrics.successCount).toBe(1);
    expect(actor.metrics.lastExecutionTime).toBe(100);
  });

  it('should update metrics on failure result', async () => {
    const result = createFailureResult('1', new Error('test'), 50);
    await actor.report(result);
    expect(actor.metrics.totalRuns).toBe(1);
    expect(actor.metrics.failureCount).toBe(1);
    expect(actor.metrics.lastError).toBeInstanceOf(Error);
  });
});
```

## 파일 구조

```
packages/actor/src/
├── types/
│   ├── __tests__/
│   │   └── actor.test.ts
│   ├── actor.ts          # Actor 인터페이스 및 타입
│   ├── blackboard.ts     # Blackboard 인터페이스
│   ├── message.ts        # Message, IMessageBus 타입
│   └── index.ts          # 타입 내보내기
├── base/
│   ├── __tests__/
│   │   └── BaseActor.test.ts
│   └── BaseActor.ts      # 추상 기본 클래스
└── index.ts              # 패키지 내보내기
```

## 완료 조건
- [ ] Actor 인터페이스 정의 완료
- [ ] ActorId, ActorStatus, ActorRole 타입 정의 완료
- [ ] Observation, Action, Result 타입 정의 완료
- [ ] ActorMetrics 타입 정의 완료
- [ ] Blackboard 인터페이스 정의 완료
- [ ] BaseActor 추상 클래스 구현 완료
- [ ] 모든 타입에 대한 단위 테스트 작성 완료
- [ ] 테스트 커버리지 90% 이상
- [ ] TypeScript 타입 체크 통과

## 의존성
- TASK-018 (Blackboard 기본 구조)

## 참고 자료
- `/docs/architecture/blackboard-actor-design.md` - 아키텍처 설계
- `/docs/tasks/P0-MVP/TASK-015-core-tests.md` - 태스크 문서 형식 참조

## 수락 기준
1. Actor 인터페이스의 4가지 메서드 (observe, think, act, report)가 정의되어 있다
2. ActorStatus 상태 전이 규칙이 올바르게 구현되어 있다
3. ActorRole이 4가지 역할을 모두 포함한다
4. 모든 타입이 타입 안전하게 정의되어 있다
5. 단위 테스트가 모든 엣지 케이스를 커버한다
6. BaseActor 클래스가 하위 클래스에서 사용하기 쉽게 설계되어 있다
]]></spec>
  </task>

  <instructions>
    아래 체크리스트의 항목만 검증하세요. 새로운 이슈를 찾지 마세요.
    각 항목에 대해 PASS 또는 FAIL + 근거(파일:라인) 출력.
    모든 항목이 PASS면 10점, 각 FAIL마다 감점.
  </instructions>

  <checklist>
# 자동 생성 체크리스트
# 생성 시각: 2026-02-09 11:50:32

1. createAction, createSuccessResult, createFailureResult 시그니처 불일치 — 15개 테스트 실패
2. Actor 인터페이스와 BaseActor 간 async/sync 불일치 — TypeScript 컴파일 에러 4개
3. Actor 인터페이스에 restart(), getStatus(), isAlive() 누락
4. Actor 인터페이스의 board/messageBus가 readonly — 스펙 불일치
5. BaseActor.updateMetrics()에서 `result.metrics?.executionTimeMs` 참조 — 필드명 불일치
6. types/index.ts에서 blackboard.ts export 누락
7. IBlackboard 중복 정의 — actor.ts와 blackboard.ts
8. 상태 전이 테이블 스펙 불일치 — RUNNING/IDLE/BUSY → RESTARTING
9. `result.test.ts:73-91` 첫 번째 테스트가 객체 패턴 사용 — P0 수정 후 깨짐
  </checklist>

  <source_files>

  </source_files>

  <test_files>

  </test_files>

  <output_format>
# 체크리스트 검증 결과

## 항목별 결과
- [PASS/FAIL] 항목1: 근거 (파일:라인)
- [PASS/FAIL] 항목2: 근거 (파일:라인)
...

## 점수
- 통과: N/M
- **총점: X/10**

## FAIL 항목 수정 방법
### [P1] FAIL 항목 제목
- **파일**: 파일경로:라인
- **문제점**: 설명
- **수정 전 코드**:
```코드```
- **수정 후 코드**:
```코드```
  </output_format>
</review>

위의 XML 프롬프트를 따라서 체크리스트 검증을 수행하고 결과를 마크다운 형식으로 출력하세요.

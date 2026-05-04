/**
 * @module actor
 * @description Actor type definitions - basic interfaces and state management
 */

import type { Action } from "./action";
import type { IBlackboard } from "./blackboard";
import type { Message } from "./message";
import type { IMessageBus } from "./message";
import type { ActorMetrics } from "./metrics";
import type { Observation } from "./observation";
import type { Result } from "./result";
import { generateActorId } from "./crypto";

// Re-export base types to maintain backward compatibility
export {
  ActorId,
  TaskId,
  ActorRole,
  ActorRoleDescription,
  ActorRoleLevel,
  ActorLifecycleStatus,
} from "./base";
import {
  ActorId,
  TaskId,
  ActorRole,
  ActorRoleDescription,
  ActorRoleLevel,
  ActorLifecycleStatus,
} from "./base";

/**
 * Actor 상태 인터페이스
 * @description 액터의 현재 상태 정보
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
    averageResponseTime: number;
    uptime: number;
  };
  /** 마지막 활동 시간 */
  lastSeen: Date;
  /** 마지막 활동 유형 */
  lastActivity?: "message_received" | "action_executed" | "error_occurred";
  /** 에러 카운트 */
  errorCount: number;
  /** 마지막 에러 */
  lastError?: {
    message: string;
    timestamp: Date;
  };
}

/**
 * 상태 전이 유효성 검사 함수
 *
 * 상태 전이 다이어그램:
 * CREATED → STARTING
 * STARTING → RUNNING | ERROR
 * RUNNING → IDLE | BUSY | STOPPING | ERROR | RESTARTING
 * IDLE → BUSY | STOPPING | RESTARTING
 * BUSY → IDLE | ERROR | RESTARTING
 * ERROR → RESTARTING | STOPPING
 * RESTARTING → RUNNING | ERROR
 * STOPPING → STOPPED
 * STOPPED → (터미널 상태)
 *
 * @param current - 현재 상태
 * @param next - 다음 상태
 * @returns 전환 가능 여부
 */
export function isValidTransition(
  current: ActorLifecycleStatus,
  next: ActorLifecycleStatus
): boolean {
  const transitions: Record<ActorLifecycleStatus, ActorLifecycleStatus[]> = {
    [ActorLifecycleStatus.CREATED]: [ActorLifecycleStatus.STARTING],
    [ActorLifecycleStatus.STARTING]: [ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.RUNNING]: [
      ActorLifecycleStatus.IDLE,
      ActorLifecycleStatus.BUSY,
      ActorLifecycleStatus.STOPPING,
      ActorLifecycleStatus.ERROR,
      ActorLifecycleStatus.RESTARTING,
    ],
    [ActorLifecycleStatus.IDLE]: [
      ActorLifecycleStatus.BUSY,
      ActorLifecycleStatus.STOPPING,
      ActorLifecycleStatus.RESTARTING,
    ],
    [ActorLifecycleStatus.BUSY]: [
      ActorLifecycleStatus.IDLE,
      ActorLifecycleStatus.ERROR,
      ActorLifecycleStatus.RESTARTING,
    ],
    [ActorLifecycleStatus.ERROR]: [ActorLifecycleStatus.RESTARTING, ActorLifecycleStatus.STOPPING],
    [ActorLifecycleStatus.RESTARTING]: [ActorLifecycleStatus.RUNNING, ActorLifecycleStatus.ERROR],
    [ActorLifecycleStatus.STOPPING]: [ActorLifecycleStatus.STOPPED],
    [ActorLifecycleStatus.STOPPED]: [],
  };

  return transitions[current]?.includes(next) ?? false;
}

// IBlackboard는 blackboard.ts에서 정의됩니다.
// IMessageBus는 message.ts에서 정의됩니다.

/**
 * Actor 인터페이스
 * @description 모든 액터가 구현해야 하는 기본 인터페이스
 */
export interface Actor {
  /** 고유 식별자 */
  readonly id: ActorId;
  /** 액터 이름 */
  readonly name: string;
  /** 액터 역할 */
  readonly role: ActorRole;
  /** 현재 상태 */
  readonly status: ActorStatus;
  /** 공유 데이터 저장소 (Blackboard) */
  board: IBlackboard;
  /** 메시지 버스 (message.ts의 IMessageBus 타입 사용) */
  messageBus: IMessageBus;
  /** 마지막 활동 시간 */
  lastActivity: Date;
  /** 생성 시간 */
  createdAt: Date;
  /** 성능 메트릭 */
  metrics: ActorMetrics;

  /**
   * 메시지 수신
   * @param message - 수신할 메시지
   * @returns 메시지 처리 결과
   */
  receive(message: Message): void | Promise<void>;

  /**
   * 환경 관찰
   * @returns 관찰 결과
   */
  observe(): Observation | Promise<Observation>;

  /**
   * 의사결정 (생각)
   * @param observation - 관찰 결과
   * @returns 결정된 행동
   */
  think(observation: Observation): Action | Promise<Action>;

  /**
   * 행동 수행
   * @param action - 수행할 행동
   * @returns 행동 결과
   */
  act(action: Action): Result | Promise<Result>;

  /**
   * 결과 보고
   * @param result - 보고할 결과
   */
  report(result: Result): void | Promise<void>;

  /**
   * 액터 시작
   */
  start(): void | Promise<void>;

  /**
   * 액터 중지
   */
  stop(): void | Promise<void>;

  /**
   * 액터 재시작
   */
  restart(): void | Promise<void>;

  /**
   * 액터 현재 상태 조회
   */
  getStatus(): ActorStatus;

  /**
   * 액터가 살아있는지 확인
   */
  isAlive(): boolean;
}

/**
 * Actor ID 생성 함수
 * @param role - Actor 역할
 * @returns 브랜드 타입이 적용된 ActorId
 * @example
 * ```typescript
 * const actorId = createActorId('analyst');
 * // 결과: "analyst-550e8400-e29b-41d4-a716-446655440000"
 * ```
 */
export function createActorId(role: ActorRole): ActorId {
  const id = generateActorId(role);
  return id as ActorId;
}

/**
 * Actor ID 유효성 검사
 * @param value - 확인할 값
 * @returns 유효한 ActorId 여부
 * @example
 * ```typescript
 * const value = 'analyst-550e8400-e29b-41d4-a716-446655440000';
 * if (isValidActorId(value)) {
 *   // value는 유효한 ActorId
 * }
 * ```
 */
export function isValidActorId(value: unknown): value is ActorId {
  if (typeof value !== "string") {
    return false;
  }
  const pattern =
    /^(analyst|executor|verifier|director)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return pattern.test(value);
}

/**
 * Task ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 TaskId
 * @example
 * ```typescript
 * const taskId = createTaskId('task-001');
 * // 타입: TaskId
 * ```
 */
export function createTaskId(id: string): TaskId {
  if (!/^task-.+/.test(id)) {
    throw new Error("TaskId must start with 'task-' followed by an identifier");
  }
  return id as TaskId;
}

/**
 * Task ID 유효성 검사
 * @param value - 확인할 값
 * @returns 유효한 TaskId 여부
 * @example
 * ```typescript
 * const value = 'task-001';
 * if (isValidTaskId(value)) {
 *   // value는 유효한 TaskId
 * }
 * ```
 */
export function isValidTaskId(value: unknown): value is TaskId {
  return typeof value === "string" && /^task-.+/.test(value);
}

export type { IBlackboard } from "./blackboard";

/**
 * @module message
 * @description Message 타입 정의 - 액터 간 통신
 */

import type { ActorId } from "./actor";

/**
 * Message 고유 ID 타입
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 */
export type MessageId = string & { readonly __brand: "MessageId" };

/**
 * 메시지 우선순위 열거형
 * @description 메시지 처리 우선순위를 정의
 */
export enum MessagePriority {
  /** 낮음 */
  LOW = 0,
  /** 보통 */
  NORMAL = 1,
  /** 높음 */
  HIGH = 2,
  /** 매우 높음 */
  CRITICAL = 3,
}

/**
 * 메시지 유형 열거형
 * @description 메시지의 종류를 정의
 */
export enum MessageType {
  // 상태 관련
  /** 상태 읽기 */
  STATE_READ = "state.read",
  /** 상태 쓰기 */
  STATE_WRITE = "state.write",
  /** 상태 구독 */
  STATE_SUBSCRIBE = "state.subscribe",
  /** 상태 구독 취소 */
  STATE_UNSUBSCRIBE = "state.unsubscribe",

  // 작업 관련
  /** 작업 할당 */
  TASK_ASSIGN = "task.assign",
  /** 작업 시작 */
  TASK_START = "task.start",
  /** 작업 완료 */
  TASK_COMPLETE = "task.complete",
  /** 작업 실패 */
  TASK_FAILED = "task.failed",
  /** 작업 취소 */
  TASK_CANCEL = "task.cancel",

  // 의사결정 관련
  /** 의사결정 요청 */
  DECISION_REQUEST = "decision.request",
  /** 의견 제출 */
  OPINION_SUBMIT = "opinion.submit",
  /** 의견 요청 */
  OPINION_REQUEST = "opinion.request",
  /** 투표 제출 */
  VOTE_SUBMIT = "vote.submit",
  /** 투표 요청 */
  VOTE_REQUEST = "vote.request",
  /** 합의 도달 */
  CONSENSUS_REACHED = "consensus.reached",

  // 시스템 관련
  /** 핑 */
  PING = "ping",
  /** 퐁 */
  PONG = "pong",
  /** 하트비트 */
  HEARTBEAT = "heartbeat",
  /** 상태 요청 */
  STATUS_REQUEST = "status.request",
  /** 상태 응답 */
  STATUS_RESPONSE = "status.response",

  // 에러 관련
  /** 에러 */
  ERROR = "error",
  /** 에러 승인 */
  ERROR_ACK = "error.ack",

  // 생명주기 관련
  /** 시작 */
  START = "start",
  /** 중지 */
  STOP = "stop",
  /** 재시작 */
  RESTART = "restart",
  /** 강제 종료 */
  KILL = "kill",

  // 사용자 정의
  /** 사용자 정의 메시지 */
  CUSTOM = "custom",
}

/**
 * Message 인터페이스
 * @description 액터 간 통신에 사용되는 메시지
 */
export interface Message<T = unknown> {
  /** 고유 식별자 */
  id: MessageId;
  /** 메시지 유형 */
  type: MessageType;
  /** 발신자 액터 ID */
  from: ActorId;
  /** 수신자 액터 ID ('broadcast' 시 전체 전송) */
  to: ActorId | "broadcast";
  /** 메시지 내용 */
  payload: T;
  /** 메시지 생성 시간 */
  timestamp: Date;
  /** 상관 관계 ID (선택적) - 응답 메시지와 요청 메시지 연결 */
  correlationId?: string;
  /** 응답 대상 (선택적) - 응답 메시지의 수신자 */
  replyTo?: ActorId;
  /** 메시지 우선순위 (선택적) */
  priority?: MessagePriority;
  /** Time to Live (선택적) - 메시지 유효 시간 (ms) */
  ttl?: number;
  /** 전달 확인 요청 (선택적) */
  deliveryReceipt?: boolean;
}

/**
 * 구독 취소 함수 타입
 * @description 메시지 구독을 취소하는 함수
 */
export type UnsubscribeFn = () => void;

/**
 * IMessageBus 인터페이스
 * @description 액터 간 메시지 전달 시스템
 */
export interface IMessageBus {
  /**
   * 메시지 전송
   * @param message - 전송할 메시지
   */
  send(message: Message): void;

  /**
   * 특정 Actor에 메시지 전송
   * @param to - 수신자 Actor ID
   * @param message - 전송할 메시지 (to 필드 제외)
   */
  sendTo(to: ActorId, message: Omit<Message, "to">): void;

  /**
   * 브로드캐스트 전송
   * @param message - 전송할 메시지 (to 필드 제외)
   */
  broadcast(message: Omit<Message, "to">): void;

  /**
   * 메시지 수신 핸들러 등록
   * @param handler - 메시지 처리 핸들러
   */
  receive(handler: (message: Message) => void): void;

  /**
   * 요청-응답 패턴
   * @param message - 요청 메시지
   * @param timeoutMs - 타임아웃 시간 (ms)
   * @returns 응답 메시지 Promise
   */
  request<T>(message: Message, timeoutMs?: number): Promise<Message<T>>;

  /**
   * 메시지 타입 구독
   * @param messageType - 구독할 메시지 타입
   * @param handler - 메시지 처리 핸들러
   * @returns 구독 취소 함수
   */
  subscribe(messageType: MessageType, handler: (message: Message) => void): UnsubscribeFn;

  /**
   * 메시지 큐 크기 조회
   * @param actorId - Actor ID
   * @returns 큐에 대기 중인 메시지 수
   */
  getQueueSize(actorId: ActorId): number;

  /**
   * 메시지 큐 비우기
   * @param actorId - Actor ID
   */
  clearQueue(actorId: ActorId): void;

  /**
   * 메시지 필터링
   * @param predicate - 필터링 조건
   */
  filter(predicate: (message: Message) => boolean): Message[];
}

/**
 * Message ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 MessageId
 * @example
 * ```typescript
 * const messageId = createMessageId('msg-001');
 * // 타입: MessageId
 * ```
 */
export function createMessageId(id: string): MessageId {
  if (!id.startsWith("msg-")) {
    throw new Error("MessageId must start with 'msg-'");
  }
  return id as MessageId;
}

/**
 * Message ID 유효성 검사
 * @param value - 확인할 값
 * @returns 유효한 MessageId 여부
 */
export function isValidMessageId(value: unknown): value is MessageId {
  return typeof value === "string" && value.length > 0 && value.startsWith("msg-");
}

/**
 * Message 생성 함수
 * @param params - Message 생성 파라미터
 * @returns 생성된 Message 객체
 * @example
 * ```typescript
 * const message = createMessage({
 *   id: createMessageId('msg-001'),
 *   type: MessageType.COMMAND,
 *   from: createActorId('analyst-550e8400-e29b-41d4-a716-446655440000'),
 *   to: createActorId('executor-550e8400-e29b-41d4-a716-446655440001'),
 *   payload: { action: 'start' }
 * });
 * ```
 */
export function createMessage<T>(params: Omit<Message<T>, "timestamp">): Message<T> {
  return {
    ...params,
    timestamp: new Date(),
  };
}

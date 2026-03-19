/**
 * @module message
 * @description 메시지 관련 타입 정의
 */

import type { Identifiable, Timestamped } from './base';
import type { AgentId, TaskId } from './base';

/**
 * 메시지 타입 enum
 * @description 시스템 내 모든 메시지 유형
 */
export enum MessageType {
  // === 상태 관련 ===
  /** 상태 읽기 요청 */
  STATE_READ = 'state.read',
  /** 상태 쓰기 요청 */
  STATE_WRITE = 'state.write',
  /** 상태 구독 */
  STATE_SUBSCRIBE = 'state.subscribe',
  /** 상태 변경 알림 */
  STATE_UPDATED = 'state.updated',

  // === 의사결정 관련 ===
  /** 안건 제출 요청 */
  DECISION_REQUEST = 'decision.request',
  /** 의견 제출 */
  OPINION_SUBMIT = 'opinion.submit',
  /** 투표 제출 */
  VOTE_SUBMIT = 'vote.submit',
  /** 합의 도달 알림 */
  CONSENSUS_REACHED = 'consensus.reached',

  // === 작업 관련 ===
  /** 작업 할당 */
  TASK_ASSIGN = 'task.assign',
  /** 작업 완료 */
  TASK_COMPLETE = 'task.complete',
  /** 작업 실패 */
  TASK_FAILED = 'task.failed',
  /** 작업 진행 상황 */
  TASK_PROGRESS = 'task.progress',

  // === 지식 관련 ===
  /** 사실 추가 */
  KNOWLEDGE_FACT_ADD = 'knowledge.fact.add',
  /** 추론 추가 */
  KNOWLEDGE_INFERENCE_ADD = 'knowledge.inference.add',

  // === 시스템 관련 ===
  /** 하트비트 */
  HEARTBEAT = 'heartbeat',
  /** 에러 */
  ERROR = 'error',
  /** 시스템 알림 */
  SYSTEM_NOTIFICATION = 'system.notification',
}

/**
 * 메시지 기본 인터페이스
 * @description 시스템 내에서 주고받는 모든 메시지의 기본 구조
 * @typeParam T - 페이로드 타입
 *
 * @example
 * ```typescript
 * const message: Message<string> = {
 *   id: 'msg-001',
 *   type: MessageType.HEARTBEAT,
 *   from: createAgentId('agent-001'),
 *   to: 'broadcast',
 *   payload: 'ping',
 *   priority: 1,
 *   ttl: null,
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Message<T = unknown> extends Identifiable, Timestamped {
  /** 메시지 타입 */
  type: MessageType;
  /** 발신자 ID */
  from: AgentId;
  /** 수신자 ID ('broadcast'면 전체) */
  to: AgentId | 'broadcast';
  /** 메시지 내용 */
  payload: T;
  /** 상관 ID (요청-응답 연결용) */
  correlationId?: string;
  /** 우선순위 */
  priority: number;
  /** TTL (밀리초, null이면 무제한) */
  ttl: number | null;
}

/**
 * 상태 읽기 요청 페이로드
 * @description Blackboard의 특정 섹션을 읽기 위한 요청
 */
export interface StateReadPayload {
  /** 읽을 섹션 */
  section: 'state' | 'knowledge' | 'decisions';
  /** 경로 */
  path: string;
  /** 쿼리 파라미터 */
  query?: Record<string, unknown>;
}

/**
 * 상태 쓰기 요청 페이로드
 * @description Blackboard의 특정 섹션에 쓰기 위한 요청
 */
export interface StateWritePayload {
  /** 쓸 섹션 */
  section: 'state' | 'knowledge' | 'decisions';
  /** 경로 */
  path: string;
  /** 데이터 */
  data: unknown;
  /** 기대 버전 (optimistic locking용) */
  expectedVersion?: number;
}

/**
 * 에러 페이로드
 * @description 에러 발생 시 전달하는 정보
 */
export interface ErrorPayload {
  /** 에러 코드 */
  code: string;
  /** 에러 메시지 */
  message: string;
  /** 상세 정보 */
  details?: Record<string, unknown>;
  /** 재시도 가능 여부 */
  retryable: boolean;
}

/**
 * 하트비트 페이로드
 * @description 에이전트 하트비트 정보
 */
export interface HeartbeatPayload {
  /** 에이전트 ID */
  agentId: AgentId;
  /** 현재 작업 ID (없으면 null) */
  currentTask?: TaskId | null;
  /** 타임스탬프 */
  timestamp: Date;
  /** 추가 상태 정보 */
  status?: Record<string, unknown>;
}

/**
 * 메시지 전송 옵션
 * @description 메시지 전송 시 설정 가능한 옵션
 */
export interface MessageSendOptions {
  /** 수신자 ID */
  to: AgentId | 'broadcast';
  /** 메시지 타입 */
  type: MessageType;
  /** 우선순위 (기본: 1) */
  priority?: number;
  /** TTL (밀리초) */
  ttl?: number | null;
  /** 상관 ID */
  correlationId?: string;
}

/**
 * 메시지 핸들러 타입
 * @description 메시지를 처리하는 핸들러 함수의 타입
 */
export type MessageHandler<T = unknown> = (message: Message<T>) => void | Promise<void>;

/**
 * 메시지 필터 타입
 * @description 메시지를 필터링하는 조건 함수의 타입
 */
export type MessageFilter<T = unknown> = (message: Message<T>) => boolean;

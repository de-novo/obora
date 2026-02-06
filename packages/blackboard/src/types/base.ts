/**
 * @module base
 * @description 기본 타입 정의 - ID 타입, 공통 인터페이스
 */

/**
 * 고유 식별자 타입들
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 */

/** 에이전트 고유 ID 타입 */
export type AgentId = string & { readonly __brand: 'AgentId' };

/** 작업 고유 ID 타입 */
export type TaskId = string & { readonly __brand: 'TaskId' };

/** 안건 고유 ID 타입 */
export type AgendaId = string & { readonly __brand: 'AgendaId' };

/** 세션 고유 ID 타입 */
export type SessionId = string & { readonly __brand: 'SessionId' };

/**
 * 타입 가드 및 생성 함수
 */

/**
 * 에이전트 ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 AgentId
 * @example
 * ```typescript
 * const agentId = createAgentId('agent-001');
 * // 타입: AgentId
 * ```
 */
export function createAgentId(id: string): AgentId {
  return id as AgentId;
}

/**
 * 작업 ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 TaskId
 * @example
 * ```typescript
 * const taskId = createTaskId('task-001');
 * // 타입: TaskId
 * ```
 */
export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

/**
 * 안건 ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 AgendaId
 * @example
 * ```typescript
 * const agendaId = createAgendaId('agenda-001');
 * // 타입: AgendaId
 * ```
 */
export function createAgendaId(id: string): AgendaId {
  return id as AgendaId;
}

/**
 * 세션 ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 SessionId
 * @example
 * ```typescript
 * const sessionId = createSessionId('session-001');
 * // 타입: SessionId
 * ```
 */
export function createSessionId(id: string): SessionId {
  return id as SessionId;
}

/**
 * 에이전트 ID 타입 가드
 * @param value - 확인할 값
 * @returns AgentId 여부
 * @example
 * ```typescript
 * const value = 'agent-001';
 * if (isAgentId(value)) {
 *   // value는 AgentId로 취급됨
 * }
 * ```
 */
export function isAgentId(value: unknown): value is AgentId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 작업 ID 타입 가드
 * @param value - 확인할 값
 * @returns TaskId 여부
 * @example
 * ```typescript
 * const value = 'task-001';
 * if (isTaskId(value)) {
 *   // value는 TaskId로 취급됨
 * }
 * ```
 */
export function isTaskId(value: unknown): value is TaskId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 안건 ID 타입 가드
 * @param value - 확인할 값
 * @returns AgendaId 여부
 * @example
 * ```typescript
 * const value = 'agenda-001';
 * if (isAgendaId(value)) {
 *   // value는 AgendaId로 취급됨
 * }
 * ```
 */
export function isAgendaId(value: unknown): value is AgendaId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 세션 ID 타입 가드
 * @param value - 확인할 값
 * @returns SessionId 여부
 * @example
 * ```typescript
 * const value = 'session-001';
 * if (isSessionId(value)) {
 *   // value는 SessionId로 취급됨
 * }
 * ```
 */
export function isSessionId(value: unknown): value is SessionId {
  return typeof value === 'string' && value.length > 0;
}

/**
 * 공통 인터페이스
 */

/**
 * 타임스탬프가 포함된 기본 엔티티
 * @description 생성 및 수정 시간을 추적하는 엔티티
 */
export interface Timestamped {
  /** 생성 시간 */
  readonly createdAt: Date;
  /** 마지막 수정 시간 */
  readonly updatedAt: Date;
}

/**
 * 버전 관리가 포함된 엔티티
 * @description optimistic locking 및 변경 이력 추적용 버전 필드
 */
export interface Versioned {
  /** 버전 번호 */
  readonly version: number;
}

/**
 * 식별 가능한 엔티티
 * @description 고유 ID를 가진 엔티티
 * @typeParam T - ID 타입 (기본값: string)
 */
export interface Identifiable<T extends string = string> {
  /** 고유 식별자 */
  readonly id: T;
}

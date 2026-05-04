/**
 * @module action
 * @description Action 타입 정의 - 액터가 수행하는 행동
 */

import type { ActorId } from "./base";

/**
 * Action 고유 ID 타입
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 */
export type ActionId = string & { readonly __brand: "ActionId" };

/**
 * Action 유형
 * @description 액터가 수행할 수 있는 행동의 종류
 */
export type ActionType =
  | "analyze"
  | "execute"
  | "verify"
  | "coordinate"
  | "submit_opinion"
  | "submit_vote"
  | "create_agenda"
  | "unknown";

/**
 * Action 인터페이스
 * @description 액터가 수행하는 행동의 정의
 */
export interface Action {
  /** 고유 식별자 */
  readonly id: ActionId;
  /** 행동을 수행하는 액터 ID */
  actorId: ActorId;
  /** 행동 유형 */
  type: ActionType;
  /** 행동 생성 시간 */
  timestamp: Date;
  /** 행동 파라미터 (선택적) */
  params?: Record<string, unknown>;
  /** 관련 작업 ID (선택적) */
  taskId?: string;
}

/**
 * Action ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 ActionId
 * @example
 * ```typescript
 * const actionId = createActionId('action-001');
 * // 타입: ActionId
 * ```
 */
export function createActionId(id: string): ActionId {
  if (!id.startsWith("action-")) {
    throw new Error("ActionId must start with 'action-'");
  }
  return id as ActionId;
}

/**
 * Action ID 유효성 검사
 * @param value - 확인할 값
 * @returns 유효한 ActionId 여부
 */
export function isValidActionId(value: unknown): value is ActionId {
  return typeof value === "string" && value.length > 0 && value.startsWith("action-");
}

/**
 * Action 생성 함수
 * @param actorId - 액터 ID
 * @param type - 행동 유형
 * @param params - 행동 파라미터 (선택적)
 * @param taskId - 관련 작업 ID (선택적)
 * @returns 생성된 Action 객체
 * @example
 * ```typescript
 * const action = createAction('actor-001', 'analyze', { target: 'data-001' });
 * ```
 */
export function createAction(
  actorId: ActorId,
  type: ActionType,
  params?: Record<string, unknown>,
  taskId?: string
): Action {
  return {
    id: createActionId(`action-${crypto.randomUUID()}`),
    actorId,
    type,
    params,
    taskId,
    timestamp: new Date(),
  };
}

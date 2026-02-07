/**
 * @module result
 * @description Result 타입 정의 - Action 수행 결과
 */

import type { ActorId } from "./actor";
import type { ActionId } from "./action";

/**
 * Result 고유 ID 타입
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 */
export type ResultId = string & { readonly __brand: "ResultId" };

/**
 * Result 상태
 * @description 행동 수행 결과의 상태
 */
export type ResultStatus = "success" | "failure" | "partial";

/**
 * Result 메트릭
 * @description 행동 수행의 성능 메트릭
 */
export interface ResultMetrics {
  /** 실행 시간 (밀리초) */
  executionTimeMs: number;
  /** 사용된 리소스 */
  resourcesUsed?: Record<string, number>;
  /** 추가 메트릭 */
  [key: string]: unknown;
}

/**
 * Result 인터페이스
 * @description Action 수행 결과
 */
export interface Result {
  /** 고유 식별자 */
  readonly id: ResultId;
  /** 관련 Action ID */
  actionId: ActionId;
  /** 결과를 생성한 액터 ID */
  actorId: ActorId;
  /** 결과 생성 시간 */
  timestamp: Date;
  /** 결과 상태 */
  status: ResultStatus;
  /** 출력 데이터 (성공 시) */
  output?: unknown;
  /** 오류 정보 (실패 시) - 문자열 형태 */
  error?: string;
  /** 성능 메트릭 */
  metrics?: ResultMetrics;
  /** 레코드 변환 메서드 */
  toRecord?(): Record<string, unknown>;
}

/**
 * Result ID 생성 함수
 * @param id - 원본 문자열 ID
 * @returns 브랜드 타입이 적용된 ResultId
 * @example
 * ```typescript
 * const resultId = createResultId('result-001');
 * // 타입: ResultId
 * ```
 */
export function createResultId(id: string): ResultId {
  if (!id.startsWith("result-")) {
    throw new Error("ResultId must start with 'result-'");
  }
  return id as ResultId;
}

/**
 * Result ID 유효성 검사
 * @param value - 확인할 값
 * @returns 유효한 ResultId 여부
 */
export function isValidResultId(value: unknown): value is ResultId {
  return typeof value === "string" && value.length > 0 && value.startsWith("result-");
}

/**
 * 성공 Result 생성 함수
 * @param params - Result 생성 파라미터
 * @returns 생성된 성공 Result 객체
 * @example
 * ```typescript
 * const result = createSuccessResult({
 *   id: createResultId('result-001'),
 *   actionId: createActionId('action-001'),
 *   actorId: createActorId('actor-001'),
 *   output: { data: 'analysis result' }
 * });
 * ```
 */
export function createSuccessResult(
  params: Omit<Result, "timestamp" | "status" | "error" | "toRecord"> & { output: unknown }
): Omit<Result, "toRecord"> {
  return {
    ...params,
    timestamp: new Date(),
    status: "success",
  };
}

/**
 * 실패 Result 생성 함수
 * @param params - Result 생성 파라미터
 * @returns 생성된 실패 Result 객체
 * @example
 * ```typescript
 * const result = createFailureResult({
 *   id: createResultId('result-001'),
 *   actionId: createActionId('action-001'),
 *   actorId: createActorId('actor-001'),
 *   error: 'Analysis failed'
 * });
 * ```
 */
export function createFailureResult(
  params: Omit<Result, "timestamp" | "status" | "output" | "toRecord"> & { error: string }
): Omit<Result, "toRecord"> {
  return {
    ...params,
    timestamp: new Date(),
    status: "failure",
  };
}

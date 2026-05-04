/**
 * @module blackboard-interface
 * @description IBlackboard interface to break circular dependencies
 * between accessors and the Blackboard class.
 */

/**
 * 쿼리 옵션
 */
export interface QueryOptions {
  /** 깊은 복사 반환 여부 (기본: true) */
  deep?: boolean;
  /** 필터 조건 */
  filter?: Record<string, unknown>;
  /** 정렬 기준 */
  sort?: { field: string; order: "asc" | "desc" };
  /** 결과 제한 */
  limit?: number;
  /** 오프셋 */
  offset?: number;
}

/**
 * 쓰기 결과
 */
export interface WriteResult {
  /** 성공 여부 */
  success: boolean;
  /** 새 버전 */
  version: number;
  /** 변경된 경로 */
  path: string;
  /** 이전 값 */
  previousValue: unknown;
  /** 에러 (실패 시) */
  error?: Error;
}

/**
 * Blackboard 인터페이스 — 접근자에서 순환 의존성 없이 사용
 */
export interface IBlackboard {
  read<T = unknown>(path: string, options?: QueryOptions & { strict?: boolean }): T;
  write(path: string, value: unknown, options?: { expectedVersion?: number }): WriteResult;
  emit(event: string, ...args: unknown[]): boolean;
}

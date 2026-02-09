/**
 * @module metrics
 * @description Metrics 타입 정의 - 액터 성능 메트릭
 */

import type { ActorId } from "./actor";

/**
 * Actor 성능 메트릭 인터페이스
 * @description 액터의 성능 및 실행 통계
 */
export interface ActorMetrics {
  /** 총 실행 횟수 */
  totalRuns: number;
  /** 성공 횟수 */
  successCount: number;
  /** 실패 횟수 */
  failureCount: number;
  /** 마지막 오류 */
  lastError: Error | null;
  /** 평균 실행 시간 */
  averageExecutionTime: number;
  /** 총 실행 시간 (밀리초) */
  totalExecutionTimeMs: number;
  /** 마지막 실행 시간 */
  lastRunAt?: Date;
  /** 생성 시간 */
  createdAt: Date;
  /** 마지막 업데이트 시간 */
  updatedAt: Date;
  /** 마지막 실행 시간 (밀리초) */
  lastExecutionTime: number | null;
  /** 총 CPU 사용 시간 (밀리초) */
  totalCpuTime: number;
  /** 메모리 사용량 (바이트) */
  memoryUsage: number;
}

/**
 * Actor 메트릭 생성 함수
 * @returns 생성된 ActorMetrics 객체
 * @example
 * ```typescript
 * const metrics = createActorMetrics();
 * ```
 */
export function createActorMetrics(): ActorMetrics {
  const now = new Date();
  return {
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    lastError: null,
    averageExecutionTime: 0,
    totalExecutionTimeMs: 0,
    createdAt: now,
    updatedAt: now,
    lastExecutionTime: null,
    totalCpuTime: 0,
    memoryUsage: 0,
  };
}

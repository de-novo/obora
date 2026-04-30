/**
 * @module observation
 * @description Observation 타입 정의 - 액터의 환경 관찰 결과
 */

import type { ActorId } from "./actor";

/**
 * 관찰 인터페이스
 * @description 액터가 환경에서 관찰한 정보
 */
export interface Observation {
  /** 관찰을 수행한 액터 ID */
  actorId: ActorId;
  /** 관찰 시간 */
  timestamp: Date;
  /** 관찰된 상태 (선택적) */
  state?: {
    context: Record<string, unknown>;
    agents: unknown[];
    tasks: unknown[];
  };
  /** 획득한 지식 (선택적) */
  knowledge?: {
    facts: unknown[];
    inferences: unknown[];
  };
  /** 관찰된 결정사항 (선택적) */
  decisions?: {
    currentAgenda: unknown | null;
    opinions: unknown[];
  };
}

/**
 * 관찰 생성 함수
 * @param params - 관찰 생성 파라미터
 * @returns 생성된 Observation 객체
 * @example
 * ```typescript
 * const observation = createObservation({
 *   actorId: createActorId('actor-001'),
 *   state: { temperature: 25 },
 *   knowledge: [{ id: 'k1', content: 'fact', confidence: 0.9 }]
 * });
 * ```
 */
export function createObservation(params: Omit<Observation, "timestamp">): Observation {
  return {
    ...params,
    timestamp: new Date(),
  };
}

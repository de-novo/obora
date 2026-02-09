import type { ActorId, Actor } from "../types/actor";

/**
 * 재시작 전략 유형
 */
export enum RestartStrategy {
  /**
   * OneForOne: 실패한 Actor만 재시작
   * - 다른 Actor에 영향 없음
   * - 독립적인 Actor에 적합
   */
  ONE_FOR_ONE = "one-for-one",

  /**
   * AllForOne: 하나가 실패하면 모든 Actor 재시작
   * - 강한 의존성이 있는 Actor 그룹에 적합
   * - 일관된 상태 복원 필요 시 사용
   */
  ALL_FOR_ONE = "all-for-one",

  /**
   * RestForOne: 실패한 Actor와 이후 생성된 Actor들 재시작
   * - 순서 의존성이 있는 Actor에 적합
   */
  REST_FOR_ONE = "rest-for-one",
}

/**
 * 재시작 지시
 */
export enum RestartDirective {
  /** 재시작 */
  RESTART = "restart",

  /** 재시작하지 않음 (정상 종료 처리) */
  STOP = "stop",

  /** 상위 Supervisor로 에스컬레이션 */
  ESCALATE = "escalate",
}

/**
 * 백오프 정책 유형
 */
export enum BackoffPolicy {
  /** 고정 대기 시간 */
  FIXED = "fixed",

  /** 지수 백오프 */
  EXPONENTIAL = "exponential",

  /** 선형 백오프 */
  LINEAR = "linear",

  /** 지터가 포함된 지수 백오프 */
  EXPONENTIAL_JITTER = "exponential-jitter",
}

/**
 * 백오프 설정
 */
export interface BackoffConfig {
  /** 백오프 정책 */
  policy: BackoffPolicy;

  /** 초기 대기 시간 (ms) */
  initialDelay: number;

  /** 최대 대기 시간 (ms) */
  maxDelay: number;

  /** 지수/선형 배율 */
  multiplier?: number;

  /** 지터 범위 (0-1) */
  jitterFactor?: number;
}

/**
 * Supervisor 설정
 */
export interface SupervisorConfig {
  /** 재시작 전략 */
  strategy: RestartStrategy;

  /** 백오프 설정 */
  backoff: BackoffConfig;

  /** 최대 재시작 횟수 (기간 내) */
  maxRestarts: number;

  /** 재시작 횟수 리셋 기간 (ms) */
  restartWindow: number;

  /** 재시작 결정 함수 (커스텀 로직) */
  decider?: (error: Error, actor: Actor) => RestartDirective;

  /** Dead Letter Queue 활성화 */
  enableDeadLetterQueue?: boolean;

  /** Dead Letter Queue 최대 크기 */
  deadLetterQueueSize?: number;

  /** 디버그 모드 */
  debug?: boolean;
}

/**
 * 재시작 이력
 */
export interface RestartHistory {
  /** Actor ID */
  actorId: ActorId;

  /** 재시작 시간 */
  timestamp: Date;

  /** 재시작 원인 에러 */
  error: Error;

  /** 재시작 시도 횟수 */
  attempt: number;

  /** 재시작 성공 여부 */
  success: boolean;
}

/**
 * Dead Letter
 */
export interface DeadLetter {
  /** 원본 메시지/작업 */
  payload: unknown;

  /** 실패한 Actor ID */
  actorId: ActorId;

  /** 실패 에러 */
  error: Error;

  /** 실패 시간 */
  timestamp: Date;

  /** 재시도 횟수 */
  retryCount: number;
}

/**
 * Supervisor 이벤트
 */
export interface SupervisorEvents {
  /** Actor 실패 시 */
  "actor:failed": (actorId: ActorId, error: Error) => void;

  /** Actor 재시작 시 */
  "actor:restarted": (actorId: ActorId, attempt: number) => void;

  /** Actor 영구 정지 시 */
  "actor:stopped": (actorId: ActorId, reason: string) => void;

  /** Dead Letter 발생 시 */
  "dead-letter": (letter: DeadLetter) => void;

  /** 최대 재시작 초과 시 */
  "max-restarts-exceeded": (actorId: ActorId) => void;

  /** 에스컬레이션 */
  escalate: (actorId: ActorId, error: Error) => void;
}

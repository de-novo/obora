/**
 * @module base
 * @description Actor 기본 타입 정의 - 순환 의존성 방지를 위해 분리
 *
 * 이 모듈은 Actor 타입 시스템의 기본 브랜드 타입과 열거형을 정의합니다.
 * 다른 타입 모듈이 이 모듈만 참조하도록 하여 순환 의존성을 방지합니다.
 */

/**
 * Actor 고유 ID 타입
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 *
 * 형식: `<role>-<uuid>`
 * 예: analyst-550e8400-e29b-41d4-a716-446655440000
 */
export type ActorId = string & { readonly __brand: "ActorId" };

/**
 * Task 고유 ID 타입
 * @description 브랜드 타입을 사용하여 타입 안전성을 확보
 */
export type TaskId = string & { readonly __brand: "TaskId" };

/**
 * Actor 역할 타입
 * @description 액터가 수행하는 역할을 정의
 */
export type ActorRole = "analyst" | "executor" | "verifier" | "director";

/**
 * Actor 역할 설명
 * @description 각 역할의 설명 정의
 */
export const ActorRoleDescription: Record<ActorRole, string> = {
  analyst: "데이터 분석, 추론, 위험 평가 수행",
  executor: "API 호출, 파일 처리, 외부 작업 실행",
  verifier: "결과 검증, 품질 체크, 오류 탐지",
  director: "회의 진행, 투표 관리, 의사결정 조율",
};

/**
 * Actor 역할별 권한 레벨
 * @description 각 역할의 권한 레벨 정의
 */
export const ActorRoleLevel: Record<ActorRole, number> = {
  analyst: 1,
  executor: 1,
  verifier: 1,
  director: 2,
};

/**
 * Actor 생명주기 상태 열거형
 * @description 액터의 현재 실행 상태를 나타냄
 */
export enum ActorLifecycleStatus {
  /** 생성됨 - 초기화 완료, 시작 대기 */
  CREATED = "created",
  /** 시작 중 - 초기화 및 리소스 로딩 중 */
  STARTING = "starting",
  /** 실행 중 - 정상적으로 동작 중 */
  RUNNING = "running",
  /** 유휴 상태 - 대기 중, 작업 수행 가능 */
  IDLE = "idle",
  /** 바쁨 - 현재 작업 수행 중 */
  BUSY = "busy",
  /** 중지 중 - 종료 처리 중 */
  STOPPING = "stopping",
  /** 중지됨 - 완전히 종료됨 */
  STOPPED = "stopped",
  /** 재시작 중 - 재시작 처리 중 */
  RESTARTING = "restarting",
  /** 오류 상태 - 오류 발생으로 중단됨 */
  ERROR = "error",
}

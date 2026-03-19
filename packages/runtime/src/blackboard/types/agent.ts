/**
 * @module agent
 * @description 에이전트 관련 타입 정의
 */

import type { Timestamped } from "./base";
import type { AgentId, TaskId } from "./base";

/**
 * 에이전트 상태 enum
 * @description 에이전트의 현재 활동 상태를 나타냄
 */
export enum AgentStatusEnum {
  /** 유휴 상태 - 작업 대기 중 */
  IDLE = "idle",
  /** 작업 중 - 활성 상태 */
  BUSY = "busy",
  /** 오류 상태 - 복구 필요 */
  ERROR = "error",
  /** 중지됨 */
  STOPPED = "stopped",
}

/**
 * 에이전트 역할 타입
 * @description 에이전트가 수행할 수 있는 역할
 */
export type AgentRole = "analyst" | "executor" | "verifier" | "director";

/**
 * 에이전트 상태 정보
 * @description 에이전트의 현재 상태와 작업 정보를 담는 인터페이스
 *
 * @example
 * ```typescript
 * const agentStatus: AgentStatus = {
 *   id: createAgentId('agent-001'),
 *   role: 'analyst',
 *   status: AgentStatusEnum.BUSY,
 *   currentTask: createTaskId('task-001'),
 *   lastHeartbeat: new Date(),
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   metadata: { model: 'gpt-4' }
 * };
 * ```
 */
export interface AgentStatus extends Timestamped {
  /** 에이전트 고유 ID */
  readonly id: AgentId;
  /** 에이전트 역할 */
  readonly role: AgentRole;
  /** 현재 상태 */
  status: AgentStatusEnum;
  /** 현재 수행 중인 작업 (없으면 null) */
  currentTask: TaskId | null;
  /** 마지막 하트비트 시간 */
  lastHeartbeat: Date;
  /** 추가 메타데이터 */
  metadata: Record<string, unknown>;
}

/**
 * 에이전트 상태 업데이트 옵션
 * @description 부분 업데이트를 위한 선택적 필드 인터페이스
 */
export interface AgentStatusUpdate {
  /** 새로운 상태 */
  status?: AgentStatusEnum;
  /** 새로운 현재 작업 */
  currentTask?: TaskId | null;
  /** 마지막 하트비트 시간 */
  lastHeartbeat?: Date;
  /** 업데이트할 메타데이터 */
  metadata?: Partial<Record<string, unknown>>;
}

/**
 * 에이전트 통계
 * @description 에이전트의 성능 및 활동 통계
 */
export interface AgentStats {
  /** 에이전트 ID */
  agentId: AgentId;
  /** 완료한 작업 수 */
  tasksCompleted: number;
  /** 실패한 작업 수 */
  tasksFailed: number;
  /** 총 작업 시간 (밀리초) */
  totalTaskTime: number;
  /** 평균 작업 시간 (밀리초) */
  averageTaskTime: number;
  /** 마지막 활동 시간 */
  lastActiveTime: Date;
}

/**
 * @module task
 * @description 작업(Task) 관련 타입 정의
 */

import type { Identifiable, Timestamped, Versioned } from './base';
import type { AgentId, TaskId } from './base';

/**
 * 작업 상태 enum
 * @description 작업의 진행 상태를 나타냄
 */
export enum TaskStatus {
  /** 대기 중 */
  PENDING = 'pending',
  /** 실행 중 */
  RUNNING = 'running',
  /** 완료됨 */
  COMPLETED = 'completed',
  /** 실패함 */
  FAILED = 'failed',
  /** 취소됨 */
  CANCELLED = 'cancelled',
}

/**
 * 작업 우선순위
 * @description 작업의 중요도를 나타내는 순위
 */
export enum TaskPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  CRITICAL = 3,
}

/**
 * 작업 정의
 * @description 시스템에서 실행할 작업의 정의
 *
 * @example
 * ```typescript
 * const task: Task = {
 *   id: createTaskId('task-001'),
 *   name: '데이터 분석',
 *   description: '사용자 행동 데이터 분석',
 *   assignedTo: createAgentId('agent-001'),
 *   status: TaskStatus.PENDING,
 *   priority: TaskPriority.HIGH,
 *   inputs: { dataset: 'users-2026-01' },
 *   outputs: null,
 *   dependsOn: [],
 *   error: null,
 *   startedAt: null,
 *   completedAt: null,
 *   timeout: 3600000,
 *   version: 1,
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * };
 * ```
 */
export interface Task extends Identifiable<TaskId>, Timestamped, Versioned {
  /** 작업 이름 */
  name: string;
  /** 작업 설명 */
  description: string;
  /** 할당된 에이전트 */
  assignedTo: AgentId | null;
  /** 현재 상태 */
  status: TaskStatus;
  /** 우선순위 */
  priority: TaskPriority;
  /** 입력 데이터 */
  inputs: Record<string, unknown>;
  /** 출력 데이터 (완료 시) */
  outputs: Record<string, unknown> | null;
  /** 의존하는 작업 ID 목록 */
  dependsOn: TaskId[];
  /** 에러 정보 (실패 시) */
  error: TaskError | null;
  /** 시작 시간 */
  startedAt: Date | null;
  /** 완료 시간 */
  completedAt: Date | null;
  /** 제한 시간 (밀리초) */
  timeout: number | null;
}

/**
 * 작업 에러 정보
 * @description 작업 실행 중 발생한 에러의 상세 정보
 */
export interface TaskError {
  /** 에러 코드 */
  code: string;
  /** 에러 메시지 */
  message: string;
  /** 스택 트레이스 */
  stack?: string;
  /** 재시도 가능 여부 */
  retryable: boolean;
}

/**
 * 작업 생성 옵션
 * @description 새 작업 생성 시 필요한 필드
 */
export interface TaskCreateInput {
  /** 작업 이름 */
  name: string;
  /** 작업 설명 */
  description: string;
  /** 할당할 에이전트 (선택) */
  assignedTo?: AgentId | null;
  /** 우선순위 (기본: NORMAL) */
  priority?: TaskPriority;
  /** 입력 데이터 */
  inputs?: Record<string, unknown>;
  /** 의존하는 작업 ID 목록 */
  dependsOn?: TaskId[];
  /** 제한 시간 (밀리초) */
  timeout?: number | null;
}

/**
 * 작업 업데이트 옵션
 * @description 작업 상태 업데이트를 위한 선택적 필드
 */
export interface TaskUpdateInput {
  /** 새로운 상태 */
  status?: TaskStatus;
  /** 할당된 에이전트 */
  assignedTo?: AgentId | null;
  /** 우선순위 */
  priority?: TaskPriority;
  /** 출력 데이터 */
  outputs?: Record<string, unknown> | null;
  /** 에러 정보 */
  error?: TaskError | null;
  /** 시작 시간 */
  startedAt?: Date | null;
  /** 완료 시간 */
  completedAt?: Date | null;
}

/**
 * 작업 진행 상황
 * @description 작업 실행 중의 진행 상황 보고
 */
export interface TaskProgress {
  /** 작업 ID */
  taskId: TaskId;
  /** 진행률 (0.0 - 1.0) */
  progress: number;
  /** 현재 단계 설명 */
  currentStep: string;
  /** 남은 예상 시간 (밀리초) */
  estimatedTimeRemaining?: number;
  /** 추가 메시지 */
  message?: string;
}

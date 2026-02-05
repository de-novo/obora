/**
 * @module blackboard
 * @description Blackboard 상태 스키마 정의 - 전체 시스템 상태
 */

import type { AgentId, TaskId, SessionId } from './base';
import type { AgentStatus } from './agent';
import type { Task } from './task';
import type { Agenda, Opinion, Resolution } from './decision';
import type { Fact, Inference, Pattern } from './knowledge';

/**
 * 이사회 회의 단계
 * @description 이사회(Blackboard)의 현재 진행 단계
 */
export type BoardPhase =
  | 'idle'       // 유휴 상태
  | 'agenda_setting'  // 안건 설정
  | 'discussion'     // 논의
  | 'debate'         // 토론
  | 'voting'         // 투표
  | 'resolved';      // 해결됨

/**
 * Blackboard 메타데이터
 * @description Blackboard 상태의 메타데이터
 */
export interface BlackboardMeta {
  /** 상태 버전 (optimistic locking용) */
  version: number;
  /** 마지막 업데이트 시간 */
  lastUpdated: Date;
  /** 현재 세션 ID */
  sessionId: SessionId;
  /** 생성 시간 */
  createdAt: Date;
}

/**
 * 상태 섹션
 * @description 현재 시스템 상태를 담는 섹션
 */
export interface StateSection {
  /** 현재 단계 */
  phase: BoardPhase;
  /** 컨텍스트 데이터 */
  context: Record<string, unknown>;
  /** 에이전트 상태 맵 */
  agents: Map<AgentId, AgentStatus>;
  /** 작업 맵 */
  tasks: Map<TaskId, Task>;
}

/**
 * 지식 섹션
 * @description 축적된 지식을 담는 섹션
 */
export interface KnowledgeSection {
  /** 사실 목록 */
  facts: Fact[];
  /** 추론 목록 */
  inferences: Inference[];
  /** 패턴 목록 */
  patterns: Pattern[];
}

/**
 * 의사결정 섹션
 * @description 안건 및 결정을 담는 섹션
 */
export interface DecisionsSection {
  /** 현재 논의 중인 안건 */
  current: Agenda | null;
  /** 대기 중인 안건들 */
  pending: Agenda[];
  /** 의견 맵 (키: agendaId:agentId) */
  opinions: Map<string, Opinion>;
  /** 결정 이력 */
  history: Resolution[];
}

/**
 * 전체 Blackboard 상태
 * @description 시스템의 단일 진실 소스 (SSOT)
 *
 * @example
 * ```typescript
 * import { createSessionId } from './base';
 *
 * const blackboardState: BlackboardState = {
 *   meta: {
 *     version: 1,
 *     lastUpdated: new Date(),
 *     sessionId: createSessionId('session-001'),
 *     createdAt: new Date(),
 *   },
 *   state: {
 *     phase: 'idle',
 *     context: {},
 *     agents: new Map(),
 *     tasks: new Map(),
 *   },
 *   knowledge: {
 *     facts: [],
 *     inferences: [],
 *     patterns: [],
 *   },
 *   decisions: {
 *     current: null,
 *     pending: [],
 *     opinions: new Map(),
 *     history: [],
 *   },
 * };
 * ```
 */
export interface BlackboardState {
  /** 메타데이터 */
  meta: BlackboardMeta;
  /** 상태 섹션 */
  state: StateSection;
  /** 지식 섹션 */
  knowledge: KnowledgeSection;
  /** 의사결정 섹션 */
  decisions: DecisionsSection;
}

/**
 * Blackboard 초기 상태 생성 옵션
 * @description 새 Blackboard 인스턴스 생성 시 필요한 옵션
 */
export interface BlackboardCreateOptions {
  /** 세션 ID (없으면 자동 생성) */
  sessionId?: SessionId;
  /** 초기 단계 (기본: idle) */
  initialPhase?: BoardPhase;
  /** 초기 컨텍스트 데이터 */
  initialContext?: Record<string, unknown>;
}

/**
 * 상태 업데이트 요청
 * @description Blackboard 상태 업데이트를 위한 요청
 */
export interface StateUpdateRequest {
  /** 업데이트할 섹션 */
  section: 'state' | 'knowledge' | 'decisions';
  /** 업데이트 유형 */
  type: 'create' | 'update' | 'delete';
  /** 업데이트할 경로 */
  path: string;
  /** 새 데이터 (create/update 시) */
  data?: unknown;
  /** 기대 버전 (optimistic locking용) */
  expectedVersion?: number;
}

/**
 * 상태 업데이트 결과
 * @description 상태 업데이트 작업의 결과
 */
export interface StateUpdateResult {
  /** 성공 여부 */
  success: boolean;
  /** 새 버전 */
  version: number;
  /** 업데이트 시간 */
  updatedAt: Date;
  /** 에러 정보 (실패 시) */
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Blackboard 이벤트 타입
 * @description Blackboard에서 발생하는 이벤트의 종류
 */
export type BlackboardEventType =
  | 'phase_changed'      // 단계 변경
  | 'agent_joined'       // 에이전트 참여
  | 'agent_left'         // 에이전트 이탈
  | 'agent_status_changed'  // 에이전트 상태 변경
  | 'task_created'       // 작업 생성
  | 'task_updated'       // 작업 업데이트
  | 'task_completed'     // 작업 완료
  | 'agenda_submitted'   // 안건 제출
  | 'agenda_updated'     // 안건 업데이트
  | 'opinion_added'      // 의견 추가
  | 'resolution_created';  // 결정 생성

/**
 * Blackboard 이벤트
 * @description Blackboard에서 발생하는 이벤트 정보
 */
export interface BlackboardEvent {
  /** 이벤트 타입 */
  type: BlackboardEventType;
  /** 이벤트 발생 시간 */
  timestamp: Date;
  /** 이벤트 데이터 */
  data: unknown;
  /** 관련 엔티티 ID (있는 경우) */
  entityId?: string;
}

/**
 * Blackboard 통계
 * @description Blackboard의 현재 상태 통계
 */
export interface BlackboardStats {
  /** 현재 단계 */
  phase: BoardPhase;
  /** 참여 중인 에이전트 수 */
  activeAgents: number;
  /** 총 작업 수 */
  totalTasks: number;
  /** 실행 중인 작업 수 */
  runningTasks: number;
  /** 대기 중인 안건 수 */
  pendingAgendas: number;
  /** 총 사실 수 */
  totalFacts: number;
  /** 총 추론 수 */
  totalInferences: number;
  /** 총 패턴 수 */
  totalPatterns: number;
  /** 총 결정 수 */
  totalResolutions: number;
}

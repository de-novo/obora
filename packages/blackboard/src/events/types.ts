/**
 * @module events/types
 * @description 이벤트 타입 정의 - Blackboard Event Bus용 이벤트 타입
 */

import type {
  AgentId,
  TaskId,
  AgendaId,
} from '../types';
import {
  BoardPhase,
  AgentStatus,
  TaskError,
  TaskStatus,
  AgendaStatus,
  Task,
  Agenda,
  Opinion,
  Resolution,
  Fact,
  Inference,
  Pattern,
} from '../types';

// Re-export types for event-factory usage
export type {
  BoardPhase,
  AgentStatus,
  TaskStatus,
  AgendaStatus,
  Task,
  Agenda,
  Opinion,
  Resolution,
  Fact,
  Inference,
  Pattern,
  TaskError,
};

/**
 * 이벤트 카테고리
 */
export type EventCategory =
  | 'state'      // 상태 변경
  | 'knowledge'  // 지식 변경
  | 'decision'   // 의사결정 관련
  | 'task'       // 작업 관련
  | 'agent'      // 에이전트 관련
  | 'system';    // 시스템 이벤트

/**
 * 기본 이벤트 인터페이스
 */
export interface BaseEvent {
  /** 이벤트 ID (고유) */
  readonly id: string;
  /** 이벤트 타입 (예: 'state.phase.changed') */
  readonly type: string;
  /** 발생 시간 */
  readonly timestamp: Date;
  /** 발생 소스 (에이전트 ID 또는 'system') */
  readonly source: AgentId | 'system';
  /** 상관 ID (관련 이벤트 추적용) */
  readonly correlationId?: string;
}

// === State Events ===

/**
 * 단계 변경 이벤트
 */
export interface PhaseChangedEvent extends BaseEvent {
  type: 'state.phase.changed';
  payload: {
    previousPhase: BoardPhase;
    newPhase: BoardPhase;
  };
}

/**
 * 컨텍스트 업데이트 이벤트
 */
export interface ContextUpdatedEvent extends BaseEvent {
  type: 'state.context.updated';
  payload: {
    key: string;
    previousValue: unknown;
    newValue: unknown;
  };
}

/**
 * 에이전트 등록 이벤트 (spec 호환)
 */
export interface StateAgentRegisteredEvent extends BaseEvent {
  type: 'state.agent.registered';
  payload: {
    agent: AgentStatus;
  };
}

/**
 * 에이전트 업데이트 이벤트 (spec 호환)
 */
export interface StateAgentUpdatedEvent extends BaseEvent {
  type: 'state.agent.updated';
  payload: {
    agentId: AgentId;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
  };
}

/**
 * 작업 생성 이벤트 (spec 호환)
 */
export interface StateTaskCreatedEvent extends BaseEvent {
  type: 'state.task.created';
  payload: {
    task: Task;
  };
}

/**
 * 작업 할당 이벤트 (spec 호환)
 */
export interface StateTaskAssignedEvent extends BaseEvent {
  type: 'state.task.assigned';
  payload: {
    taskId: TaskId;
    assignedTo: AgentId;
  };
}

/**
 * 작업 완료 이벤트 (spec 호환)
 */
export interface StateTaskCompletedEvent extends BaseEvent {
  type: 'state.task.completed';
  payload: {
    taskId: TaskId;
    result: unknown;
    duration: number; // ms
  };
}

/**
 * 작업 실패 이벤트 (spec 호환)
 */
export interface StateTaskFailedEvent extends BaseEvent {
  type: 'state.task.failed';
  payload: {
    taskId: TaskId;
    error: TaskError;
    retryable: boolean;
  };
}

// === Agent Events (기존 호환성 유지) ===

/**
 * 에이전트 등록 이벤트
 */
export interface AgentRegisteredEvent extends BaseEvent {
  type: 'agent.registered';
  payload: {
    agent: AgentStatus;
  };
}

/**
 * 에이전트 상태 변경 이벤트
 */
export interface AgentStatusChangedEvent extends BaseEvent {
  type: 'agent.status.changed';
  payload: {
    agentId: AgentId;
    previousStatus: AgentStatus;
    newStatus: AgentStatus;
  };
}

/**
 * 에이전트 제거 이벤트
 */
export interface AgentRemovedEvent extends BaseEvent {
  type: 'agent.removed';
  payload: {
    agentId: AgentId;
    reason: string;
  };
}

// === Task Events (기존 호환성 유지) ===

/**
 * 작업 생성 이벤트
 */
export interface TaskCreatedEvent extends BaseEvent {
  type: 'task.created';
  payload: {
    task: Task;
  };
}

/**
 * 작업 할당 이벤트
 */
export interface TaskAssignedEvent extends BaseEvent {
  type: 'task.assigned';
  payload: {
    taskId: TaskId;
    assignedTo: AgentId;
  };
}

/**
 * 작업 상태 변경 이벤트
 */
export interface TaskStatusChangedEvent extends BaseEvent {
  type: 'task.status.changed';
  payload: {
    taskId: TaskId;
    previousStatus: TaskStatus;
    newStatus: TaskStatus;
  };
}

/**
 * 작업 완료 이벤트
 */
export interface TaskCompletedEvent extends BaseEvent {
  type: 'task.completed';
  payload: {
    taskId: TaskId;
    result: unknown;
    duration: number; // ms
  };
}

/**
 * 작업 실패 이벤트
 */
export interface TaskFailedEvent extends BaseEvent {
  type: 'task.failed';
  payload: {
    taskId: TaskId;
    error: TaskError;
    retryable: boolean;
  };
}

// === Decision Events ===

/**
 * 안건 생성 이벤트 (spec 호환)
 */
export interface DecisionsAgendaCreatedEvent extends BaseEvent {
  type: 'decisions.agenda.created';
  payload: {
    agenda: Agenda;
  };
}

/**
 * 안건 시작 이벤트 (spec 호환)
 */
export interface DecisionsAgendaStartedEvent extends BaseEvent {
  type: 'decisions.agenda.started';
  payload: {
    agendaId: AgendaId;
  };
}

/**
 * 의견 제출 이벤트 (spec 호환)
 */
export interface DecisionsOpinionSubmittedEvent extends BaseEvent {
  type: 'decisions.opinion.submitted';
  payload: {
    opinion: Opinion;
  };
}

/**
 * 투표 시작 이벤트 (spec 호환)
 */
export interface DecisionsVotingStartedEvent extends BaseEvent {
  type: 'decisions.voting.started';
  payload: {
    agendaId: AgendaId;
    deadline: Date;
  };
}

/**
 * 투표 제출 이벤트 (spec 호환)
 */
export interface DecisionsVoteSubmittedEvent extends BaseEvent {
  type: 'decisions.vote.submitted';
  payload: {
    agendaId: AgendaId;
    agentId: AgentId;
    vote: 'approve' | 'reject' | 'abstain';
  };
}

/**
 * 투표 종료 이벤트 (spec 호환)
 */
export interface DecisionsVotingEndedEvent extends BaseEvent {
  type: 'decisions.voting.ended';
  payload: {
    agendaId: AgendaId;
    result: Resolution;
  };
}

/**
 * 합의 도달 이벤트 (spec 호환)
 */
export interface DecisionsConsensusReachedEvent extends BaseEvent {
  type: 'decisions.consensus.reached';
  payload: {
    resolution: Resolution;
  };
}

/**
 * 안건 해결 이벤트 (spec 호환)
 */
export interface DecisionsAgendaResolvedEvent extends BaseEvent {
  type: 'decisions.agenda.resolved';
  payload: {
    agendaId: AgendaId;
    resolution: Resolution;
  };
}

/**
 * 안건 제출 이벤트 (기존 호환성 유지)
 */
export interface AgendaSubmittedEvent extends BaseEvent {
  type: 'decision.agenda.submitted';
  payload: {
    agenda: Agenda;
  };
}

/**
 * 안건 상태 변경 이벤트
 */
export interface AgendaStatusChangedEvent extends BaseEvent {
  type: 'decision.agenda.status.changed';
  payload: {
    agendaId: AgendaId;
    previousStatus: AgendaStatus;
    newStatus: AgendaStatus;
  };
}

/**
 * 의견 제출 이벤트
 */
export interface OpinionSubmittedEvent extends BaseEvent {
  type: 'decision.opinion.submitted';
  payload: {
    opinion: Opinion;
  };
}

/**
 * 투표 요청 이벤트
 */
export interface VoteRequestedEvent extends BaseEvent {
  type: 'decision.vote.requested';
  payload: {
    agendaId: AgendaId;
    deadline: Date;
    requiredVoters: AgentId[];
  };
}

/**
 * 합의 도달 이벤트
 */
export interface ConsensusReachedEvent extends BaseEvent {
  type: 'decision.consensus.reached';
  payload: {
    resolution: Resolution;
  };
}

// === Knowledge Events ===

/**
 * 사실 추가 이벤트
 */
export interface FactAddedEvent extends BaseEvent {
  type: 'knowledge.fact.added';
  payload: {
    fact: Fact;
  };
}

/**
 * 추론 추가 이벤트
 */
export interface InferenceAddedEvent extends BaseEvent {
  type: 'knowledge.inference.added';
  payload: {
    inference: Inference;
  };
}

/**
 * 패턴 학습 이벤트 (spec 호환)
 */
export interface KnowledgePatternLearnedEvent extends BaseEvent {
  type: 'knowledge.pattern.learned';
  payload: {
    pattern: Pattern;
  };
}

// === System Events ===

/**
 * 스냅샷 생성 이벤트 (spec 호환)
 */
export interface SystemSnapshotCreatedEvent extends BaseEvent {
  type: 'system.snapshot.created';
  payload: {
    snapshotId: string;
    timestamp: Date;
  };
}

/**
 * 스냅샷 복원 이벤트 (spec 호환)
 */
export interface SystemSnapshotRestoredEvent extends BaseEvent {
  type: 'system.snapshot.restored';
  payload: {
    snapshotId: string;
    timestamp: Date;
  };
}

/**
 * 시스템 오류 이벤트
 */
export interface SystemErrorEvent extends BaseEvent {
  type: 'system.error';
  payload: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * 버전 충돌 이벤트
 */
export interface VersionConflictEvent extends BaseEvent {
  type: 'system.version.conflict';
  payload: {
    path: string;
    expectedVersion: number;
    actualVersion: number;
  };
}

// === Union Type ===

/**
 * 모든 이벤트 타입 유니온
 */
export type Event =
  // State
  | PhaseChangedEvent
  | ContextUpdatedEvent
  | StateAgentRegisteredEvent
  | StateAgentUpdatedEvent
  | StateTaskCreatedEvent
  | StateTaskAssignedEvent
  | StateTaskCompletedEvent
  | StateTaskFailedEvent
  // Agent (기존 호환성)
  | AgentRegisteredEvent
  | AgentStatusChangedEvent
  | AgentRemovedEvent
  // Task (기존 호환성)
  | TaskCreatedEvent
  | TaskAssignedEvent
  | TaskStatusChangedEvent
  | TaskCompletedEvent
  | TaskFailedEvent
  // Decision (spec 호환)
  | DecisionsAgendaCreatedEvent
  | DecisionsAgendaStartedEvent
  | DecisionsOpinionSubmittedEvent
  | DecisionsVotingStartedEvent
  | DecisionsVoteSubmittedEvent
  | DecisionsVotingEndedEvent
  | DecisionsConsensusReachedEvent
  | DecisionsAgendaResolvedEvent
  // Decision (기존 호환성)
  | AgendaSubmittedEvent
  | AgendaStatusChangedEvent
  | OpinionSubmittedEvent
  | VoteRequestedEvent
  | ConsensusReachedEvent
  // Knowledge
  | FactAddedEvent
  | InferenceAddedEvent
  | KnowledgePatternLearnedEvent
  // System
  | SystemSnapshotCreatedEvent
  | SystemSnapshotRestoredEvent
  | SystemErrorEvent
  | VersionConflictEvent;

/**
 * 이벤트 타입 문자열 유니온
 */
export type EventType = Event['type'];

/**
 * 이벤트 타입에서 이벤트 추출
 */
export type EventByType<T extends EventType> = Extract<Event, { type: T }>;

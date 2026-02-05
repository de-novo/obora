/**
 * @module events/event-factory
 * @description 이벤트 팩토리 - 타입 안전한 이벤트 생성
 */

import type { AgentId, TaskId, AgendaId } from '../types';
import type {
  Event,
  EventType,
  BaseEvent,
  PhaseChangedEvent,
  ContextUpdatedEvent,
  StateAgentRegisteredEvent,
  StateAgentUpdatedEvent,
  StateTaskCreatedEvent,
  StateTaskAssignedEvent,
  StateTaskCompletedEvent,
  StateTaskFailedEvent,
  AgentRegisteredEvent,
  AgentStatusChangedEvent,
  AgentRemovedEvent,
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  DecisionsAgendaCreatedEvent,
  DecisionsAgendaStartedEvent,
  DecisionsOpinionSubmittedEvent,
  DecisionsVotingStartedEvent,
  DecisionsVoteSubmittedEvent,
  DecisionsVotingEndedEvent,
  DecisionsConsensusReachedEvent,
  DecisionsAgendaResolvedEvent,
  AgendaSubmittedEvent,
  AgendaStatusChangedEvent,
  OpinionSubmittedEvent,
  VoteRequestedEvent,
  ConsensusReachedEvent,
  FactAddedEvent,
  InferenceAddedEvent,
  KnowledgePatternLearnedEvent,
  SystemSnapshotCreatedEvent,
  SystemSnapshotRestoredEvent,
  SystemErrorEvent,
  VersionConflictEvent,
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
} from './types';

/**
 * 이벤트 생성 옵션
 */
export interface CreateEventOptions {
  /** 상관 ID */
  correlationId?: string;
  /** 소스 (기본: 'system') */
  source?: AgentId | 'system';
}

/**
 * 이벤트 팩토리
 * @description 타입 안전한 이벤트 생성
 */
export class EventFactory {
  constructor(private idGenerator: () => string) {}

  // === State Events ===

  createPhaseChanged(
    previousPhase: BoardPhase,
    newPhase: BoardPhase,
    options?: CreateEventOptions
  ): PhaseChangedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.phase.changed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { previousPhase, newPhase },
    };
  }

  createContextUpdated(
    key: string,
    previousValue: unknown,
    newValue: unknown,
    options?: CreateEventOptions
  ): ContextUpdatedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.context.updated',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { key, previousValue, newValue },
    };
  }

  createStateAgentRegistered(
    agent: AgentStatus,
    options?: CreateEventOptions
  ): StateAgentRegisteredEvent {
    return {
      id: this.idGenerator(),
      type: 'state.agent.registered',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agent },
    };
  }

  createStateAgentUpdated(
    agentId: AgentId,
    previousStatus: AgentStatus,
    newStatus: AgentStatus,
    options?: CreateEventOptions
  ): StateAgentUpdatedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.agent.updated',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agentId, previousStatus, newStatus },
    };
  }

  createStateTaskCreated(task: Task, options?: CreateEventOptions): StateTaskCreatedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.task.created',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { task },
    };
  }

  createStateTaskAssigned(
    taskId: TaskId,
    assignedTo: AgentId,
    options?: CreateEventOptions
  ): StateTaskAssignedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.task.assigned',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, assignedTo },
    };
  }

  createStateTaskCompleted(
    taskId: TaskId,
    result: unknown,
    duration: number,
    options?: CreateEventOptions
  ): StateTaskCompletedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.task.completed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, result, duration },
    };
  }

  createStateTaskFailed(
    taskId: TaskId,
    error: TaskError,
    retryable: boolean,
    options?: CreateEventOptions
  ): StateTaskFailedEvent {
    return {
      id: this.idGenerator(),
      type: 'state.task.failed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, error, retryable },
    };
  }

  // === Agent Events ===

  createAgentRegistered(agent: AgentStatus, options?: CreateEventOptions): AgentRegisteredEvent {
    return {
      id: this.idGenerator(),
      type: 'agent.registered',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agent },
    };
  }

  createAgentStatusChanged(
    agentId: AgentId,
    previousStatus: AgentStatus,
    newStatus: AgentStatus,
    options?: CreateEventOptions
  ): AgentStatusChangedEvent {
    return {
      id: this.idGenerator(),
      type: 'agent.status.changed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agentId, previousStatus, newStatus },
    };
  }

  createAgentRemoved(agentId: AgentId, reason: string, options?: CreateEventOptions): AgentRemovedEvent {
    return {
      id: this.idGenerator(),
      type: 'agent.removed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agentId, reason },
    };
  }

  // === Task Events ===

  createTaskCreated(task: Task, options?: CreateEventOptions): TaskCreatedEvent {
    return {
      id: this.idGenerator(),
      type: 'task.created',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { task },
    };
  }

  createTaskAssigned(taskId: TaskId, assignedTo: AgentId, options?: CreateEventOptions): TaskAssignedEvent {
    return {
      id: this.idGenerator(),
      type: 'task.assigned',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, assignedTo },
    };
  }

  createTaskStatusChanged(
    taskId: TaskId,
    previousStatus: TaskStatus,
    newStatus: TaskStatus,
    options?: CreateEventOptions
  ): TaskStatusChangedEvent {
    return {
      id: this.idGenerator(),
      type: 'task.status.changed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, previousStatus, newStatus },
    };
  }

  createTaskCompleted(
    taskId: TaskId,
    result: unknown,
    duration: number,
    options?: CreateEventOptions
  ): TaskCompletedEvent {
    return {
      id: this.idGenerator(),
      type: 'task.completed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, result, duration },
    };
  }

  createTaskFailed(
    taskId: TaskId,
    error: TaskError,
    retryable: boolean,
    options?: CreateEventOptions
  ): TaskFailedEvent {
    return {
      id: this.idGenerator(),
      type: 'task.failed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { taskId, error, retryable },
    };
  }

  // === Decision Events (Spec 호환) ===

  createDecisionsAgendaCreated(agenda: Agenda, options?: CreateEventOptions): DecisionsAgendaCreatedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.agenda.created',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agenda },
    };
  }

  createDecisionsAgendaStarted(agendaId: AgendaId, options?: CreateEventOptions): DecisionsAgendaStartedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.agenda.started',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId },
    };
  }

  createDecisionsOpinionSubmitted(opinion: Opinion, options?: CreateEventOptions): DecisionsOpinionSubmittedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.opinion.submitted',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { opinion },
    };
  }

  createDecisionsVotingStarted(
    agendaId: AgendaId,
    deadline: Date,
    options?: CreateEventOptions
  ): DecisionsVotingStartedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.voting.started',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, deadline },
    };
  }

  createDecisionsVoteSubmitted(
    agendaId: AgendaId,
    agentId: AgentId,
    vote: 'approve' | 'reject' | 'abstain',
    options?: CreateEventOptions
  ): DecisionsVoteSubmittedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.vote.submitted',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, agentId, vote },
    };
  }

  createDecisionsVotingEnded(
    agendaId: AgendaId,
    result: Resolution,
    options?: CreateEventOptions
  ): DecisionsVotingEndedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.voting.ended',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, result },
    };
  }

  createDecisionsConsensusReached(resolution: Resolution, options?: CreateEventOptions): DecisionsConsensusReachedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.consensus.reached',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { resolution },
    };
  }

  createDecisionsAgendaResolved(
    agendaId: AgendaId,
    resolution: Resolution,
    options?: CreateEventOptions
  ): DecisionsAgendaResolvedEvent {
    return {
      id: this.idGenerator(),
      type: 'decisions.agenda.resolved',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, resolution },
    };
  }

  // === Decision Events (기존 호환성) ===

  createAgendaSubmitted(agenda: Agenda, options?: CreateEventOptions): AgendaSubmittedEvent {
    return {
      id: this.idGenerator(),
      type: 'decision.agenda.submitted',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agenda },
    };
  }

  createAgendaStatusChanged(
    agendaId: AgendaId,
    previousStatus: AgendaStatus,
    newStatus: AgendaStatus,
    options?: CreateEventOptions
  ): AgendaStatusChangedEvent {
    return {
      id: this.idGenerator(),
      type: 'decision.agenda.status.changed',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, previousStatus, newStatus },
    };
  }

  createOpinionSubmitted(opinion: Opinion, options?: CreateEventOptions): OpinionSubmittedEvent {
    return {
      id: this.idGenerator(),
      type: 'decision.opinion.submitted',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { opinion },
    };
  }

  createVoteRequested(
    agendaId: AgendaId,
    deadline: Date,
    requiredVoters: AgentId[],
    options?: CreateEventOptions
  ): VoteRequestedEvent {
    return {
      id: this.idGenerator(),
      type: 'decision.vote.requested',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { agendaId, deadline, requiredVoters },
    };
  }

  createConsensusReached(resolution: Resolution, options?: CreateEventOptions): ConsensusReachedEvent {
    return {
      id: this.idGenerator(),
      type: 'decision.consensus.reached',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { resolution },
    };
  }

  // === Knowledge Events ===

  createFactAdded(fact: Fact, options?: CreateEventOptions): FactAddedEvent {
    return {
      id: this.idGenerator(),
      type: 'knowledge.fact.added',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { fact },
    };
  }

  createInferenceAdded(inference: Inference, options?: CreateEventOptions): InferenceAddedEvent {
    return {
      id: this.idGenerator(),
      type: 'knowledge.inference.added',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { inference },
    };
  }

  createKnowledgePatternLearned(pattern: Pattern, options?: CreateEventOptions): KnowledgePatternLearnedEvent {
    return {
      id: this.idGenerator(),
      type: 'knowledge.pattern.learned',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { pattern },
    };
  }

  // === System Events ===

  createSystemSnapshotCreated(
    snapshotId: string,
    timestamp: Date,
    options?: CreateEventOptions
  ): SystemSnapshotCreatedEvent {
    return {
      id: this.idGenerator(),
      type: 'system.snapshot.created',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { snapshotId, timestamp },
    };
  }

  createSystemSnapshotRestored(
    snapshotId: string,
    timestamp: Date,
    options?: CreateEventOptions
  ): SystemSnapshotRestoredEvent {
    return {
      id: this.idGenerator(),
      type: 'system.snapshot.restored',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { snapshotId, timestamp },
    };
  }

  createSystemError(
    code: string,
    message: string,
    details?: unknown,
    options?: CreateEventOptions
  ): SystemErrorEvent {
    return {
      id: this.idGenerator(),
      type: 'system.error',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { code, message, details },
    };
  }

  createVersionConflict(
    path: string,
    expectedVersion: number,
    actualVersion: number,
    options?: CreateEventOptions
  ): VersionConflictEvent {
    return {
      id: this.idGenerator(),
      type: 'system.version.conflict',
      timestamp: new Date(),
      source: options?.source ?? 'system',
      correlationId: options?.correlationId,
      payload: { path, expectedVersion, actualVersion },
    };
  }
}

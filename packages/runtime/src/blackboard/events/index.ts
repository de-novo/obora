/**
 * @module events/index
 * @description 이벤트 모듈 exports
 */

// Type exports
export type {
  // 카테고리
  EventCategory,
  // 기본 타입
  BaseEvent,
  // 이벤트 타입
  EventType,
  EventByType,
  Event,
} from './types';

// 호환성을 위해 BlackboardEvent를 별칭으로 export
// (types/blackboard.ts의 BlackboardEvent와 이름 충돌 방지를 위해 Event로 재명명)
export type { Event as BusEvent } from './types';

// State Events
export type {
  PhaseChangedEvent,
  ContextUpdatedEvent,
  StateAgentRegisteredEvent,
  StateAgentUpdatedEvent,
  StateTaskCreatedEvent,
  StateTaskAssignedEvent,
  StateTaskCompletedEvent,
  StateTaskFailedEvent,
} from './types';

// Agent Events
export type {
  AgentRegisteredEvent,
  AgentStatusChangedEvent,
  AgentRemovedEvent,
} from './types';

// Task Events
export type {
  TaskCreatedEvent,
  TaskAssignedEvent,
  TaskStatusChangedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
} from './types';

// Decision Events
export type {
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
} from './types';

// Agenda Domain Events
export type {
  AgendaCreatedDomainEvent,
  AgendaUpdatedDomainEvent,
  AgendaStatusChangedDomainEvent,
  AgendaDeletedDomainEvent,
} from './types';

// Knowledge Events
export type {
  FactAddedEvent,
  InferenceAddedEvent,
  KnowledgePatternLearnedEvent,
} from './types';

// System Events
export type {
  SystemSnapshotCreatedEvent,
  SystemSnapshotRestoredEvent,
  SystemErrorEvent,
  VersionConflictEvent,
} from './types';

// Event Bus exports
export { EventBus, EventTimeoutError } from './event-bus';
export type {
  EventHandler,
  Unsubscribe,
  EventFilter,
  EventBusOptions,
  EventBusStats,
} from './event-bus';

// Event Factory exports
export { EventFactory } from './event-factory';
export type { CreateEventOptions } from './event-factory';

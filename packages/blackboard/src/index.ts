/**
 * @obora-kit/blackboard
 *
 * Blackboard pattern implementation for AI agent coordination.
 *
 * @packageDocumentation
 */

// === Types ===
export type {
  // Base types
  AgentId,
  TaskId,
  AgendaId,
  SessionId,
  FactId,
  InferenceId,
  PatternId,
  Timestamped,
  Versioned,
  Identifiable,

  // Agent types
  AgentRole,
  AgentStatus,

  // Task types
  Task,
  TaskError,

  // Decision types
  Agenda,
  Opinion,
  Stance,
  Resolution,
  DecisionType,
  VoteSummary,
  VotingMethod,

  // Knowledge types
  Fact,
  Inference,
  Pattern,

  // Message types
  Message,

  // Blackboard types
  BlackboardState,
  BlackboardMeta,
  StateSection,
  KnowledgeSection,
  DecisionsSection,
  BoardPhase,
  BlackboardEvent,
  BlackboardEventType,
  BlackboardStats,
  StateUpdateRequest,
  StateUpdateResult,
  NodeId,
  EdgeId,
  TemporalNode,
  TemporalEdge,
  GraphQuery,
  QueryResult,
  MergeResult,
  PromotionMeta,
  PromotionResult,
  ValidationResult,
  IProductionPromotionPort,
} from './types';

// Enum exports (export as values, not just types)
export {
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  MessageType,
  createNodeId,
  createEdgeId,
} from './types';

// ID creator functions (from types)
export {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  createFactId,
  createInferenceId,
  createPatternId,
} from './types';

// === Core ===
export {
  Blackboard,
  EventAwareBlackboard,
  VersionConflictError,
  PathNotFoundError,
} from './core';

export type {
  BlackboardOptions,
  QueryOptions,
  WriteResult,
  TemporalKnowledgeGraph,
  StagingTKG,
  ProductionTKG,
  PromotableProductionTKG,
  IReflector,
} from './core';

// === Events ===
export {
  EventBus,
  EventFactory,
} from './events';

// === Domains ===
export {
  AgendaStore,
  AgendaValidationError,
  AgendaNotFoundError,
  AgendaTransitionError,
  AGENDA_STATUS_TRANSITIONS,
  createAgendaEventMeta,
} from './domains/agenda';

export type {
  AgendaStoreOptions,
  AgendaDomainEvent,
  AgendaCreatedEvent as AgendaDomainCreatedEvent,
  AgendaUpdatedEvent as AgendaDomainUpdatedEvent,
  AgendaStatusChangedEvent as AgendaDomainStatusChangedEvent,
  AgendaDeletedEvent as AgendaDomainDeletedEvent,
  AgendaStatus as DomainAgendaStatus,
  CreateAgendaInput,
  UpdateAgendaInput,
} from './domains/agenda';

export { VOTING_SESSION_STATUSES, VotingSessionStore } from './domains/voting';

export type {
  VotingSessionId,
  VotingSessionStatus,
  VotingPolicy,
  VotingSession,
  Vote,
  TallyResult,
} from './domains/voting';

export { evaluateConsensus, CONSENSUS_STATUSES, isConsensusResult } from './domains/consensus';

export type {
  ConsensusMethod,
  EvaluateConsensusOptions,
  ConsensusStatus,
  VotingSessionSnapshot,
  ConsensusCondition,
  ConsensusEscalation,
  ConsensusResult,
} from './domains/consensus';

export {
  InMemoryStagingTKG,
  InMemoryProductionTKG,
  TKGObserver,
  TKGReflector,
  JsonFileReflectorStateStore,
} from './domains/tkg';

export type {
  ObserverOptions,
  ReflectorOptions,
  ReflectorOperationalMetrics,
  ReflectorOperationalReport,
  ManualReviewItem,
  ReflectorPersistedState,
  ReflectorStateStore,
} from './domains/tkg';

export { MeetingStateMachine } from './workflow';

export type {
  MeetingState,
  MeetingEventType,
  MeetingEvent,
  TransitionLog,
  MeetingStateSnapshot,
  MeetingStateMachineOptions,
} from './workflow';

export type {
  Event,
  EventType,
  EventHandler,
  Unsubscribe,
  EventFilter,
  EventBusOptions,
  EventBusStats,
} from './events';

// === Snapshot ===
export {
  SnapshotManager,
  StateSerializer,
  SnapshotRestoreError,
  SNAPSHOT_FORMAT_VERSION,
} from './snapshot';

export type {
  Snapshot,
  SnapshotMeta,
  CreateSnapshotOptions,
  RestoreSnapshotOptions,
  SnapshotValidationResult,
} from './snapshot';

// === Utilities ===
export {
  DefaultIdGenerator,
  SequentialIdGenerator,
} from './core/id-generator';

export {
  deepClone,
  deepFreeze,
} from './core/immutable';

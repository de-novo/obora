/**
 * @obora-kit/blackboard (promoted from _legacy)
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
  ValidationResult as BlackboardValidationResult,
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
  EventBus as BlackboardEventBus,
  EventFactory,
} from './events';

export type {
  Event as BlackboardEvent_,
  EventType as BlackboardEventType_,
  EventHandler as BlackboardEventHandler,
  Unsubscribe as BlackboardUnsubscribe,
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

// === Observer & Reflector ===
export {
  TKGObserver,
  TKGReflector,
} from './observer-reflector';

export type {
  ObserverOptions,
  ReflectorOptions,
  ReflectorOperationalMetrics,
  ReflectorOperationalReport,
  ManualReviewItem,
  ReflectorPersistedState,
  ReflectorStateStore,
} from './observer-reflector';

// === Utilities ===
export {
  DefaultIdGenerator,
  SequentialIdGenerator,
} from './core/id-generator';

export {
  deepClone,
  deepFreeze,
} from './core/immutable';

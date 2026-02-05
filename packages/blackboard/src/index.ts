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
  Timestamped,
  Versioned,
  Identifiable,

  // Agent types
  AgentRole,
  AgentStatus,
  AgentStatusEnum,

  // Task types
  Task,
  TaskStatus,
  TaskPriority,
  TaskError,

  // Decision types
  Agenda,
  AgendaStatus,
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
  MessageType,

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
} from './types';

// ID creator functions (from types)
export {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
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
} from './core';

// === Events ===
export {
  EventBus,
  EventFactory,
} from './events';

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

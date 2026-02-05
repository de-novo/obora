/**
 * @module index
 * @description 메인 export - 모든 타입의 진입점
 */

// Base types
export * from './base';
export type {
  AgentId,
  TaskId,
  AgendaId,
  SessionId,
  Timestamped,
  Versioned,
  Identifiable,
} from './base';

// Domain types
export * from './agent';
export type {
  AgentStatusEnum,
  AgentRole,
  AgentStatus,
  AgentStatusUpdate,
  AgentStats,
} from './agent';

export * from './task';
export type {
  TaskStatus,
  TaskPriority,
  Task,
  TaskError,
  TaskCreateInput,
  TaskUpdateInput,
  TaskProgress,
} from './task';

export * from './decision';
export type {
  VotingMethod,
  AgendaStatus,
  Stance,
  DecisionType,
  Attachment,
  Agenda,
  Opinion,
  VoteSummary,
  NextAction,
  Resolution,
  AgendaCreateInput,
  OpinionCreateInput,
} from './decision';

export * from './knowledge';
export type {
  InferenceMethod,
  Fact,
  Inference,
  Pattern,
  FactCreateInput,
  InferenceCreateInput,
  PatternCreateInput,
  KnowledgeQuery,
} from './knowledge';

export * from './message';
export type {
  MessageType,
  Message,
  StateReadPayload,
  StateWritePayload,
  ErrorPayload,
  HeartbeatPayload,
  MessageSendOptions,
  MessageHandler,
  MessageFilter,
} from './message';

// Blackboard types
export * from './blackboard';

// Re-export commonly used types for convenience
export { AgentId as ID } from './base';

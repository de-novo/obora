/**
 * @packageDocumentation
 * @module @obora-kit/blackboard
 * @description Blackboard 시스템 - 이사회 협업 패턴 구현
 *
 * 이 패키지는 AI 에이전트들의 이사회 협업 패턴을 구현하는 Blackboard 시스템을 제공합니다.
 *
 * @example
 * ```typescript
 * import {
 *   Blackboard,
 *   createSessionId,
 *   createAgentId,
 *   AgentStatusEnum,
 *   AgendaStatus,
 * } from '@obora-kit/blackboard';
 *
 * // Blackboard 생성
 * const board = new Blackboard({
 *   sessionId: createSessionId('session-001'),
 * });
 *
 * // 에이전트 등록
 * board.state.registerAgent({
 *   id: createAgentId('ceo'),
 *   role: 'director',
 *   status: AgentStatusEnum.ACTIVE,
 *   currentTask: null,
 *   lastHeartbeat: new Date(),
 *   metadata: { model: 'gpt-4' },
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 * });
 *
 * // 이벤트 수신
 * board.on('agent_joined', (data) => {
 *   console.log(`Agent ${data.agentId} joined`);
 * });
 * ```
 */

// Core exports
export * from './core';

// Events exports
export * from './events';

// All types
export * from './types';

// Re-export commonly used types
export {
  BlackboardState,
  BlackboardMeta,
  StateSection,
  KnowledgeSection,
  DecisionsSection,
  BoardPhase,
} from './types';

export {
  AgentStatusEnum,
  AgentRole,
  AgentStatus,
} from './types';

export {
  TaskStatus,
  TaskPriority,
  Task,
} from './types';

export {
  AgendaStatus,
  Agenda,
  Opinion,
  Resolution,
  Stance,
  DecisionType,
} from './types';

export {
  Fact,
  Inference,
  Pattern,
} from './types';

export {
  AgentId,
  TaskId,
  AgendaId,
  SessionId,
  Timestamped,
  Versioned,
  Identifiable,
} from './types';

export {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
} from './types';

/**
 * @packageDocumentation
 * @module @obora-kit/blackboard
 * @description Blackboard 시스템의 TypeScript 타입 정의
 *
 * 이 패키지는 Blackboard 시스템의 핵심 타입 정의를 제공합니다.
 *
 * @example
 * ```typescript
 * import {
 *   BlackboardState,
 *   AgentStatus,
 *   Task,
 *   Agenda,
 *   Opinion,
 *   Resolution,
 *   createAgentId,
 *   createTaskId,
 *   createAgendaId,
 * } from '@obora-kit/blackboard';
 *
 * // 새 에이전트 상태 생성
 * const agentStatus: AgentStatus = {
 *   id: createAgentId('agent-001'),
 *   role: 'analyst',
 *   status: AgentStatusEnum.IDLE,
 *   currentTask: null,
 *   lastHeartbeat: new Date(),
 *   createdAt: new Date(),
 *   updatedAt: new Date(),
 *   metadata: {},
 * };
 * ```
 */

// 모든 타입을 내보냅니다
export * from './types';

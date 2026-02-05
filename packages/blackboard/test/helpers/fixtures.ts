import {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  type AgentStatus,
  type Task,
  type Agenda,
  type BlackboardState,
} from '../../src';

/**
 * 기본 에이전트 상태 픽스처
 */
export const defaultAgentStatus: AgentStatus = {
  id: createAgentId('agent-001'),
  role: 'analyst',
  status: AgentStatusEnum.IDLE,
  currentTask: null,
  lastHeartbeat: new Date('2026-02-06T12:00:00Z'),
  metadata: {},
  createdAt: new Date('2026-02-06T10:00:00Z'),
  updatedAt: new Date('2026-02-06T12:00:00Z'),
};

/**
 * 기본 작업 픽스처
 */
export const defaultTask: Task = {
  id: createTaskId('task-001'),
  name: 'Test Task',
  description: 'A test task',
  assignedTo: null,
  status: TaskStatus.PENDING,
  priority: TaskPriority.NORMAL,
  inputs: {},
  outputs: null,
  dependsOn: [],
  error: null,
  startedAt: null,
  completedAt: null,
  timeout: null,
  version: 1,
  createdAt: new Date('2026-02-06T10:00:00Z'),
  updatedAt: new Date('2026-02-06T10:00:00Z'),
};

/**
 * 기본 안건 픽스처
 */
export const defaultAgenda: Agenda = {
  id: createAgendaId('agenda-001'),
  title: 'Test Agenda',
  description: 'A test agenda for unit testing',
  proposer: createAgentId('agent-001'),
  status: AgendaStatus.SUBMITTED,
  deadline: new Date('2026-02-10T12:00:00Z'),
  requiredQuorum: 3,
  votingMethod: 'majority',
  priority: 5,
  tags: ['test'],
  attachments: [],
  version: 1,
  createdAt: new Date('2026-02-06T10:00:00Z'),
  updatedAt: new Date('2026-02-06T10:00:00Z'),
};

/**
 * 초기 Blackboard 상태 픽스처
 */
export function createInitialState(sessionId?: string): BlackboardState {
  return {
    meta: {
      version: 1,
      lastUpdated: new Date('2026-02-06T12:00:00Z'),
      sessionId: sessionId ?? createSessionId('session-001'),
      createdAt: new Date('2026-02-06T10:00:00Z'),
    },
    state: {
      phase: 'idle',
      context: {},
      agents: new Map(),
      tasks: new Map(),
    },
    knowledge: {
      facts: [],
      inferences: [],
      patterns: [],
    },
    decisions: {
      current: null,
      pending: [],
      opinions: new Map(),
      history: [],
    },
  };
}

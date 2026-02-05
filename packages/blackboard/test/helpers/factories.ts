import { 
  createAgentId, 
  createTaskId, 
  createAgendaId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  type AgentStatus,
  type Task,
  type Agenda,
} from '../../src';

let counter = 0;

/**
 * 에이전트 팩토리
 */
export function createTestAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  counter++;
  return {
    id: createAgentId(`agent-${counter}`),
    role: 'analyst',
    status: AgentStatusEnum.IDLE,
    currentTask: null,
    lastHeartbeat: new Date('2026-02-06T12:00:00Z'),
    metadata: {},
    createdAt: new Date('2026-02-06T10:00:00Z'),
    updatedAt: new Date('2026-02-06T12:00:00Z'),
    ...overrides,
  };
}

/**
 * 작업 팩토리
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  counter++;
  return {
    id: createTaskId(`task-${counter}`),
    name: `Task ${counter}`,
    description: 'Test task',
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
    ...overrides,
  };
}

/**
 * 안건 팩토리
 */
export function createTestAgenda(overrides: Partial<Agenda> = {}): Agenda {
  counter++;
  return {
    id: createAgendaId(`agenda-${counter}`),
    title: `Test Agenda ${counter}`,
    description: 'Test agenda',
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
    ...overrides,
  };
}

/**
 * 카운터 리셋
 */
export function resetFactories(): void {
  counter = 0;
}

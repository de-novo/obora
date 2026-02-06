import { vi } from 'vitest';
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

// 내부 카운터 (테스트 간 격리를 위해 resetFactories로 초기화)
let idCounter = 0;

// 각 팩토리 함수에서 독립적인 ID 생성 (병렬 테스트 안전)
// timestamp + counter suffix로 중복 방지 및 테스트 예측 가능성 확보
function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}

/**
 * 에이전트 팩토리
 */
export function createTestAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
  const id = overrides.id ?? createAgentId(generateId('agent'));
  const timestamp = Date.now();
  return {
    id,
    role: 'analyst',
    status: AgentStatusEnum.IDLE,
    currentTask: null,
    lastHeartbeat: new Date('2026-02-04T12:00:00Z'),
    metadata: {},
    createdAt: new Date('2026-02-04T10:00:00Z'),
    updatedAt: new Date('2026-02-04T12:00:00Z'),
    ...overrides,
  };
}

/**
 * 작업 팩토리
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id ?? createTaskId(generateId('task'));
  const name = overrides.name ?? `Task-${Date.now()}`;
  return {
    id,
    name,
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
    createdAt: new Date('2026-02-04T10:00:00Z'),
    updatedAt: new Date('2026-02-04T10:00:00Z'),
    ...overrides,
  };
}

/**
 * 안건 팩토리
 */
export function createTestAgenda(overrides: Partial<Agenda> = {}): Agenda {
  const id = overrides.id ?? createAgendaId(generateId('agenda'));
  const title = overrides.title ?? `Test Agenda-${Date.now()}`;
  return {
    id,
    title,
    description: 'Test agenda',
    proposer: createAgentId('agent-001'),
    status: AgendaStatus.SUBMITTED,
    deadline: new Date('2026-02-08T12:00:00Z'),
    requiredQuorum: 3,
    votingMethod: 'majority',
    priority: 5,
    tags: ['test'],
    attachments: [],
    version: 1,
    createdAt: new Date('2026-02-04T10:00:00Z'),
    updatedAt: new Date('2026-02-04T10:00:00Z'),
    ...overrides,
  };
}

/**
 * 팩토리 상태 초기화 함수
 *
 * 테스트 시작 전(beforeEach 등)에 호출하여 내부 카운터와 상태를 초기화합니다.
 * 이를 통해 각 테스트가 독립적인 환경에서 실행되도록 보장합니다.
 */
export function resetFactories(): void {
  idCounter = 0;
}

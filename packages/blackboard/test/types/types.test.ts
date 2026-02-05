import { describe, it, expect } from 'vitest';
import {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
  AgendaStatus,
  type AgentId,
  type TaskId,
  type AgendaId,
  type SessionId,
  type AgentStatus,
  type Task,
  type Agenda,
  type Fact,
  type Inference,
  type Pattern,
  type Opinion,
} from '../../src';

describe('ID Types', () => {
  describe('createAgentId', () => {
    it('should create AgentId from string', () => {
      const id = createAgentId('agent-001');
      expect(id).toBe('agent-001');
    });

    it('should preserve the string value', () => {
      const value = 'my-agent-123';
      const id = createAgentId(value);
      expect(id).toBe(value);
    });
  });

  describe('createTaskId', () => {
    it('should create TaskId from string', () => {
      const id = createTaskId('task-001');
      expect(id).toBe('task-001');
    });

    it('should preserve the string value', () => {
      const value = 'my-task-456';
      const id = createTaskId(value);
      expect(id).toBe(value);
    });
  });

  describe('createAgendaId', () => {
    it('should create AgendaId from string', () => {
      const id = createAgendaId('agenda-001');
      expect(id).toBe('agenda-001');
    });

    it('should preserve the string value', () => {
      const value = 'my-agenda-789';
      const id = createAgendaId(value);
      expect(id).toBe(value);
    });
  });

  describe('createSessionId', () => {
    it('should create SessionId from string', () => {
      const id = createSessionId('session-001');
      expect(id).toBe('session-001');
    });

    it('should preserve the string value', () => {
      const value = 'my-session-abc';
      const id = createSessionId(value);
      expect(id).toBe(value);
    });
  });
});

describe('Enums', () => {
  describe('AgentStatusEnum', () => {
    it('should have IDLE status', () => {
      expect(AgentStatusEnum.IDLE).toBe('idle');
    });

    it('should have BUSY status', () => {
      expect(AgentStatusEnum.BUSY).toBe('busy');
    });

    it('should have ERROR status', () => {
      expect(AgentStatusEnum.ERROR).toBe('error');
    });

    it('should have STOPPED status', () => {
      expect(AgentStatusEnum.STOPPED).toBe('stopped');
    });
  });

  describe('TaskStatus', () => {
    it('should have PENDING status', () => {
      expect(TaskStatus.PENDING).toBe('pending');
    });

    it('should have RUNNING status', () => {
      expect(TaskStatus.RUNNING).toBe('running');
    });

    it('should have COMPLETED status', () => {
      expect(TaskStatus.COMPLETED).toBe('completed');
    });

    it('should have FAILED status', () => {
      expect(TaskStatus.FAILED).toBe('failed');
    });

    it('should have CANCELLED status', () => {
      expect(TaskStatus.CANCELLED).toBe('cancelled');
    });
  });

  describe('TaskPriority', () => {
    it('should have LOW priority (0)', () => {
      expect(TaskPriority.LOW).toBe(0);
    });

    it('should have NORMAL priority (1)', () => {
      expect(TaskPriority.NORMAL).toBe(1);
    });

    it('should have HIGH priority (2)', () => {
      expect(TaskPriority.HIGH).toBe(2);
    });

    it('should have CRITICAL priority (3)', () => {
      expect(TaskPriority.CRITICAL).toBe(3);
    });
  });

  describe('AgendaStatus', () => {
    it('should have all defined statuses', () => {
      expect(AgendaStatus).toBeDefined();
    });
  });
});

describe('Interface Structures', () => {
  describe('AgentStatus', () => {
    it('should accept valid AgentStatus object', () => {
      const agent: AgentStatus = {
        id: createAgentId('agent-001'),
        role: 'analyst',
        status: AgentStatusEnum.IDLE,
        currentTask: null,
        lastHeartbeat: new Date(),
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(agent.id).toBe('agent-001');
      expect(agent.role).toBe('analyst');
      expect(agent.status).toBe(AgentStatusEnum.IDLE);
    });

    it('should allow currentTask to be TaskId', () => {
      const agent: AgentStatus = {
        id: createAgentId('agent-001'),
        role: 'executor',
        status: AgentStatusEnum.BUSY,
        currentTask: createTaskId('task-001'),
        lastHeartbeat: new Date(),
        metadata: { model: 'gpt-4' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(agent.currentTask).toBe('task-001');
    });
  });

  describe('Task', () => {
    it('should accept valid Task object', () => {
      const task: Task = {
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
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(task.id).toBe('task-001');
      expect(task.status).toBe(TaskStatus.PENDING);
    });

    it('should allow assignedTo to be AgentId', () => {
      const task: Task = {
        id: createTaskId('task-002'),
        name: 'Assigned Task',
        description: 'Task assigned to an agent',
        assignedTo: createAgentId('agent-001'),
        status: TaskStatus.RUNNING,
        priority: TaskPriority.HIGH,
        inputs: { data: 'test' },
        outputs: null,
        dependsOn: [createTaskId('task-001')],
        error: null,
        startedAt: new Date(),
        completedAt: null,
        timeout: 60000,
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(task.assignedTo).toBe('agent-001');
      expect(task.dependsOn).toHaveLength(1);
    });
  });
});

describe('Type Safety', () => {
  it('should create branded types that are still strings', () => {
    const agentId: AgentId = createAgentId('agent-123');
    const taskId: TaskId = createTaskId('task-456');
    const agendaId: AgendaId = createAgendaId('agenda-789');
    const sessionId: SessionId = createSessionId('session-abc');

    // All branded types should still behave as strings
    expect(typeof agentId).toBe('string');
    expect(typeof taskId).toBe('string');
    expect(typeof agendaId).toBe('string');
    expect(typeof sessionId).toBe('string');

    // String methods should work
    expect(agentId.startsWith('agent')).toBe(true);
    expect(taskId.includes('456')).toBe(true);
    expect(agendaId.length).toBeGreaterThan(0);
    expect(sessionId.toUpperCase()).toBe('SESSION-ABC');
  });

  it('should allow using IDs in Maps', () => {
    const agentMap = new Map<AgentId, string>();
    const agentId = createAgentId('agent-001');
    
    agentMap.set(agentId, 'test value');
    expect(agentMap.get(agentId)).toBe('test value');
    expect(agentMap.has(agentId)).toBe(true);
  });

  it('should allow using IDs in Sets', () => {
    const taskSet = new Set<TaskId>();
    const taskId1 = createTaskId('task-001');
    const taskId2 = createTaskId('task-002');
    
    taskSet.add(taskId1);
    taskSet.add(taskId2);
    
    expect(taskSet.has(taskId1)).toBe(true);
    expect(taskSet.has(taskId2)).toBe(true);
    expect(taskSet.size).toBe(2);
  });
});

import { describe, it, expect } from 'vitest';
import {
  createAgentId,
  createTaskId,
  createAgendaId,
  createSessionId,
  isAgentId,
  isTaskId,
  isAgendaId,
  isSessionId,
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
} from '../../src/types';

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

describe('Type Guards', () => {
  describe('isAgentId', () => {
    it('should return true for valid AgentId', () => {
      const id = createAgentId('agent-001');
      expect(isAgentId(id)).toBe(true);
    });

    it('should return true for non-empty string', () => {
      expect(isAgentId('agent-001')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isAgentId('')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isAgentId(123)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAgentId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAgentId(undefined)).toBe(false);
    });

    it('should return false for object', () => {
      expect(isAgentId({})).toBe(false);
    });

    it('should narrow type correctly', () => {
      const value: unknown = 'agent-001';
      if (isAgentId(value)) {
        // TypeScript should know value is AgentId
        expect(value.toUpperCase()).toBe('AGENT-001');
      }
    });
  });

  describe('isTaskId', () => {
    it('should return true for valid TaskId', () => {
      const id = createTaskId('task-001');
      expect(isTaskId(id)).toBe(true);
    });

    it('should return true for non-empty string', () => {
      expect(isTaskId('task-001')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isTaskId('')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isTaskId(123)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isTaskId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isTaskId(undefined)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const value: unknown = 'task-001';
      if (isTaskId(value)) {
        expect(value.startsWith('task')).toBe(true);
      }
    });
  });

  describe('isAgendaId', () => {
    it('should return true for valid AgendaId', () => {
      const id = createAgendaId('agenda-001');
      expect(isAgendaId(id)).toBe(true);
    });

    it('should return true for non-empty string', () => {
      expect(isAgendaId('agenda-001')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isAgendaId('')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isAgendaId(123)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isAgendaId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isAgendaId(undefined)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const value: unknown = 'agenda-001';
      if (isAgendaId(value)) {
        expect(value.startsWith('agenda')).toBe(true);
      }
    });
  });

  describe('isSessionId', () => {
    it('should return true for valid SessionId', () => {
      const id = createSessionId('session-001');
      expect(isSessionId(id)).toBe(true);
    });

    it('should return true for non-empty string', () => {
      expect(isSessionId('session-001')).toBe(true);
    });

    it('should return false for empty string', () => {
      expect(isSessionId('')).toBe(false);
    });

    it('should return false for number', () => {
      expect(isSessionId(123)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isSessionId(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSessionId(undefined)).toBe(false);
    });

    it('should narrow type correctly', () => {
      const value: unknown = 'session-001';
      if (isSessionId(value)) {
        expect(value.startsWith('session')).toBe(true);
      }
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

    it('should accept all agent roles', () => {
      const roles: Array<AgentStatus['role']> = ['analyst', 'executor', 'verifier', 'director'];
      roles.forEach(role => {
        const agent: AgentStatus = {
          id: createAgentId(`agent-${role}`),
          role,
          status: AgentStatusEnum.IDLE,
          currentTask: null,
          lastHeartbeat: new Date(),
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(agent.role).toBe(role);
      });
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

    it('should accept task error', () => {
      const task: Task = {
        id: createTaskId('task-003'),
        name: 'Failed Task',
        description: 'A task that failed',
        assignedTo: null,
        status: TaskStatus.FAILED,
        priority: TaskPriority.NORMAL,
        inputs: {},
        outputs: null,
        dependsOn: [],
        error: {
          code: 'TIMEOUT',
          message: 'Task timed out',
          stack: 'Error: Task timed out',
          retryable: true,
        },
        startedAt: new Date(),
        completedAt: new Date(),
        timeout: 60000,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(task.error?.code).toBe('TIMEOUT');
      expect(task.error?.retryable).toBe(true);
    });
  });

  describe('Agenda', () => {
    it('should accept valid Agenda object', () => {
      const agenda: Agenda = {
        id: createAgendaId('agenda-001'),
        title: 'Test Agenda',
        description: 'A test agenda',
        proposer: createAgentId('agent-001'),
        status: AgendaStatus.SUBMITTED,
        deadline: new Date('2026-02-10'),
        requiredQuorum: 3,
        votingMethod: 'majority',
        priority: 5,
        tags: ['test'],
        attachments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      expect(agenda.id).toBe('agenda-001');
      expect(agenda.status).toBe(AgendaStatus.SUBMITTED);
      expect(agenda.votingMethod).toBe('majority');
    });

    it('should accept all voting methods', () => {
      const methods: Array<Agenda['votingMethod']> = [
        'majority',
        'unanimous',
        'weighted',
        'supermajority',
      ];
      methods.forEach(method => {
        const agenda: Agenda = {
          id: createAgendaId(`agenda-${method}`),
          title: 'Test Agenda',
          description: 'A test agenda',
          proposer: createAgentId('agent-001'),
          status: AgendaStatus.SUBMITTED,
          deadline: null,
          requiredQuorum: 3,
          votingMethod: method,
          priority: 5,
          tags: [],
          attachments: [],
          createdAt: new Date(),
          updatedAt: new Date(),
          version: 1,
        };
        expect(agenda.votingMethod).toBe(method);
      });
    });
  });

  describe('Fact', () => {
    it('should accept valid Fact object', () => {
      const fact: Fact = {
        id: 'fact-001',
        content: 'Test fact',
        source: createAgentId('agent-001'),
        confidence: 0.9,
        category: 'test',
        tags: [],
        expiresAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(fact.content).toBe('Test fact');
      expect(fact.confidence).toBe(0.9);
    });

    it('should accept fact with expiration', () => {
      const expiresAt = new Date('2026-12-31');
      const fact: Fact = {
        id: 'fact-002',
        content: 'Temporary fact',
        source: createAgentId('agent-001'),
        confidence: 0.8,
        category: 'test',
        tags: [],
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(fact.expiresAt).toBe(expiresAt);
    });
  });

  describe('Inference', () => {
    it('should accept valid Inference object', () => {
      const inference: Inference = {
        id: 'inference-001',
        conclusion: 'Test conclusion',
        premises: ['fact-001', 'fact-002'],
        derivedBy: createAgentId('agent-001'),
        method: 'deduction',
        confidence: 0.85,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(inference.conclusion).toBe('Test conclusion');
      expect(inference.method).toBe('deduction');
      expect(inference.premises).toHaveLength(2);
    });

    it('should accept all inference methods', () => {
      const methods: Array<Inference['method']> = ['deduction', 'induction', 'abduction'];
      methods.forEach(method => {
        const inference: Inference = {
          id: `inference-${method}`,
          conclusion: 'Test conclusion',
          premises: [],
          derivedBy: createAgentId('agent-001'),
          method,
          confidence: 0.8,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(inference.method).toBe(method);
      });
    });
  });

  describe('Pattern', () => {
    it('should accept valid Pattern object', () => {
      const pattern: Pattern = {
        id: 'pattern-001',
        name: 'Test Pattern',
        description: 'A test pattern',
        discoveredBy: createAgentId('agent-001'),
        usageCount: 10,
        successRate: 0.9,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(pattern.name).toBe('Test Pattern');
      expect(pattern.usageCount).toBe(10);
      expect(pattern.successRate).toBe(0.9);
    });
  });

  describe('Opinion', () => {
    it('should accept valid Opinion object', () => {
      const opinion: Opinion = {
        agentId: createAgentId('agent-001'),
        agendaId: createAgendaId('agenda-001'),
        stance: 'approve',
        reason: 'Good proposal',
        conditions: [],
        confidence: 0.9,
        references: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(opinion.stance).toBe('approve');
      expect(opinion.confidence).toBe(0.9);
    });

    it('should accept all stances', () => {
      const stances: Array<Opinion['stance']> = [
        'approve',
        'reject',
        'conditional',
        'abstain',
      ];
      stances.forEach(stance => {
        const opinion: Opinion = {
          agentId: createAgentId('agent-001'),
          agendaId: createAgendaId('agenda-001'),
          stance,
          reason: 'Test reason',
          conditions: [],
          confidence: 0.8,
          references: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        expect(opinion.stance).toBe(stance);
      });
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

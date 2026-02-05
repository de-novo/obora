import { describe, it, expect, beforeEach } from 'vitest';
import { EventFactory } from '../../src/events/event-factory';
import {
  createAgentId,
  createTaskId,
  createAgendaId,
  createFactId,
  AgentStatusEnum,
  TaskStatus,
} from '../../src';

describe('EventFactory', () => {
  let factory: EventFactory;
  let idCounter = 0;

  beforeEach(() => {
    idCounter = 0;
    factory = new EventFactory(() => `evt_${++idCounter}`);
  });

  describe('constructor', () => {
    it('should create with custom ID generator', () => {
      const customFactory = new EventFactory(() => 'custom-id');
      const event = customFactory.createPhaseChanged('idle', 'discussion');
      expect(event.id).toBe('custom-id');
    });

    it('should create with default ID generator', () => {
      const defaultFactory = new EventFactory();
      const event = defaultFactory.createPhaseChanged('idle', 'discussion');
      expect(event.id).toBeDefined();
    });
  });

  describe('State Events', () => {
    describe('createPhaseChanged', () => {
      it('should create phase changed event', () => {
        const event = factory.createPhaseChanged('idle', 'discussion');

        expect(event.type).toBe('state.phase.changed');
        expect(event.payload.previousPhase).toBe('idle');
        expect(event.payload.newPhase).toBe('discussion');
        expect(event.timestamp).toBeInstanceOf(Date);
      });
    });

    describe('createAgentRegistered', () => {
      it('should create agent registered event', () => {
        const agentId = createAgentId('agent-1');
        const event = factory.createAgentRegistered({
          id: agentId,
          role: 'analyst',
          status: AgentStatusEnum.IDLE,
          currentTask: null,
          lastHeartbeat: new Date(),
          metadata: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        expect(event.type).toBe('state.agent.registered');
        expect(event.payload.agent.id).toBe(agentId);
        expect(event.payload.agent.role).toBe('analyst');
      });
    });

    describe('createAgentUpdated', () => {
      it('should create agent updated event', () => {
        const agentId = createAgentId('agent-1');
        const event = factory.createAgentUpdated(
          agentId,
          { status: AgentStatusEnum.BUSY },
          { status: AgentStatusEnum.IDLE }
        );

        expect(event.type).toBe('state.agent.updated');
        expect(event.payload.agentId).toBe(agentId);
        expect(event.payload.changes.status).toBe(AgentStatusEnum.BUSY);
        expect(event.payload.previousValues.status).toBe(AgentStatusEnum.IDLE);
      });
    });

    describe('createAgentRemoved', () => {
      it('should create agent removed event', () => {
        const agentId = createAgentId('agent-1');
        const event = factory.createAgentRemoved(agentId, 'manual');

        expect(event.type).toBe('state.agent.removed');
        expect(event.payload.agentId).toBe(agentId);
        expect(event.payload.reason).toBe('manual');
      });
    });
  });

  describe('Task Events', () => {
    describe('createTaskCreated', () => {
      it('should create task created event', () => {
        const taskId = createTaskId('task-1');
        const event = factory.createTaskCreated({
          id: taskId,
          name: 'Test Task',
          description: 'Description',
          assignedTo: null,
          status: TaskStatus.PENDING,
          priority: 5,
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
        });

        expect(event.type).toBe('task.created');
        expect(event.payload.task.id).toBe(taskId);
        expect(event.payload.task.name).toBe('Test Task');
      });
    });

    describe('createTaskAssigned', () => {
      it('should create task assigned event', () => {
        const taskId = createTaskId('task-1');
        const agentId = createAgentId('agent-1');
        const event = factory.createTaskAssigned(taskId, agentId);

        expect(event.type).toBe('task.assigned');
        expect(event.payload.taskId).toBe(taskId);
        expect(event.payload.agentId).toBe(agentId);
      });
    });

    describe('createTaskStarted', () => {
      it('should create task started event', () => {
        const taskId = createTaskId('task-1');
        const agentId = createAgentId('agent-1');
        const event = factory.createTaskStarted(taskId, agentId);

        expect(event.type).toBe('task.started');
        expect(event.payload.taskId).toBe(taskId);
        expect(event.payload.agentId).toBe(agentId);
        expect(event.payload.startedAt).toBeInstanceOf(Date);
      });
    });

    describe('createTaskCompleted', () => {
      it('should create task completed event', () => {
        const taskId = createTaskId('task-1');
        const outputs = { result: 'success' };
        const event = factory.createTaskCompleted(taskId, outputs, 1500);

        expect(event.type).toBe('task.completed');
        expect(event.payload.taskId).toBe(taskId);
        expect(event.payload.outputs).toEqual(outputs);
        expect(event.payload.duration).toBe(1500);
      });
    });

    describe('createTaskFailed', () => {
      it('should create task failed event', () => {
        const taskId = createTaskId('task-1');
        const error = 'Something went wrong';
        const event = factory.createTaskFailed(taskId, error, 500);

        expect(event.type).toBe('task.failed');
        expect(event.payload.taskId).toBe(taskId);
        expect(event.payload.error).toBe(error);
        expect(event.payload.duration).toBe(500);
      });
    });

    describe('createTaskCancelled', () => {
      it('should create task cancelled event', () => {
        const taskId = createTaskId('task-1');
        const event = factory.createTaskCancelled(taskId, 'User requested');

        expect(event.type).toBe('task.cancelled');
        expect(event.payload.taskId).toBe(taskId);
        expect(event.payload.reason).toBe('User requested');
      });
    });
  });

  describe('Knowledge Events', () => {
    describe('createFactAdded', () => {
      it('should create fact added event', () => {
        const factId = createFactId('fact-1');
        const event = factory.createFactAdded({
          id: factId,
          content: 'Test fact',
          source: createAgentId('agent-1'),
          confidence: 0.9,
          category: 'test',
          tags: [],
          expiresAt: null,
          createdAt: new Date(),
        });

        expect(event.type).toBe('knowledge.fact.added');
        expect(event.payload.fact.id).toBe(factId);
        expect(event.payload.fact.content).toBe('Test fact');
      });
    });

    describe('createFactUpdated', () => {
      it('should create fact updated event', () => {
        const factId = createFactId('fact-1');
        const event = factory.createFactUpdated(
          factId,
          { confidence: 0.95 },
          { confidence: 0.9 }
        );

        expect(event.type).toBe('knowledge.fact.updated');
        expect(event.payload.factId).toBe(factId);
        expect(event.payload.changes.confidence).toBe(0.95);
      });
    });

    describe('createFactRemoved', () => {
      it('should create fact removed event', () => {
        const factId = createFactId('fact-1');
        const event = factory.createFactRemoved(factId, 'expired');

        expect(event.type).toBe('knowledge.fact.removed');
        expect(event.payload.factId).toBe(factId);
        expect(event.payload.reason).toBe('expired');
      });
    });

    describe('createInferenceAdded', () => {
      it('should create inference added event', () => {
        const event = factory.createInferenceAdded({
          id: 'inf_1',
          conclusion: 'Test conclusion',
          premises: ['premise1'],
          confidence: 0.8,
          source: createAgentId('agent-1'),
          tags: [],
          createdAt: new Date(),
        });

        expect(event.type).toBe('knowledge.inference.added');
        expect(event.payload.inference.conclusion).toBe('Test conclusion');
      });
    });

    describe('createPatternAdded', () => {
      it('should create pattern added event', () => {
        const event = factory.createPatternAdded({
          id: 'pat_1',
          name: 'Test Pattern',
          description: 'Description',
          conditions: [],
          consequences: [],
          confidence: 0.7,
          tags: [],
          createdAt: new Date(),
        });

        expect(event.type).toBe('knowledge.pattern.added');
        expect(event.payload.pattern.name).toBe('Test Pattern');
      });
    });
  });

  describe('Decision Events', () => {
    describe('createAgendaSubmitted', () => {
      it('should create agenda submitted event', () => {
        const agendaId = createAgendaId('agenda-1');
        const event = factory.createAgendaSubmitted({
          id: agendaId,
          title: 'Test Agenda',
          description: 'Description',
          proposer: createAgentId('agent-1'),
          status: 'submitted',
          deadline: null,
          requiredQuorum: 3,
          votingMethod: 'majority',
          priority: 5,
          tags: [],
          attachments: [],
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        expect(event.type).toBe('decision.agenda.submitted');
        expect(event.payload.agenda.id).toBe(agendaId);
        expect(event.payload.agenda.title).toBe('Test Agenda');
      });
    });

    describe('createAgendaStatusChanged', () => {
      it('should create agenda status changed event', () => {
        const agendaId = createAgendaId('agenda-1');
        const event = factory.createAgendaStatusChanged(
          agendaId,
          'submitted',
          'open'
        );

        expect(event.type).toBe('decision.agenda.status_changed');
        expect(event.payload.agendaId).toBe(agendaId);
        expect(event.payload.previousStatus).toBe('submitted');
        expect(event.payload.newStatus).toBe('open');
      });
    });

    describe('createOpinionSubmitted', () => {
      it('should create opinion submitted event', () => {
        const agendaId = createAgendaId('agenda-1');
        const agentId = createAgentId('agent-1');
        const event = factory.createOpinionSubmitted({
          id: 'opn_1',
          agentId,
          agendaId,
          stance: 'approve',
          reason: 'Good proposal',
          conditions: [],
          confidence: 0.9,
          references: [],
          createdAt: new Date(),
        });

        expect(event.type).toBe('decision.opinion.submitted');
        expect(event.payload.opinion.stance).toBe('approve');
        expect(event.payload.opinion.agentId).toBe(agentId);
      });
    });

    describe('createVotingCompleted', () => {
      it('should create voting completed event', () => {
        const agendaId = createAgendaId('agenda-1');
        const event = factory.createVotingCompleted(agendaId, {
          passed: true,
          method: 'majority',
          summary: {
            total: 5,
            approve: 3,
            reject: 1,
            abstain: 1,
            approvalRate: 0.6,
            quorumReached: true,
          },
        });

        expect(event.type).toBe('decision.voting.completed');
        expect(event.payload.agendaId).toBe(agendaId);
        expect(event.payload.result.passed).toBe(true);
        expect(event.payload.result.summary.approve).toBe(3);
      });
    });
  });

  describe('System Events', () => {
    describe('createStateInitialized', () => {
      it('should create state initialized event', () => {
        const sessionId = 'sess_test';
        const event = factory.createStateInitialized(sessionId);

        expect(event.type).toBe('state.initialized');
        expect(event.payload.sessionId).toBe(sessionId);
        expect(event.source).toBe('system');
      });
    });

    describe('createSnapshotCreated', () => {
      it('should create snapshot created event', () => {
        const snapshotId = 'snap_1';
        const event = factory.createSnapshotCreated(snapshotId, 5);

        expect(event.type).toBe('snapshot.created');
        expect(event.payload.snapshotId).toBe(snapshotId);
        expect(event.payload.version).toBe(5);
      });
    });

    describe('createSnapshotRestored', () => {
      it('should create snapshot restored event', () => {
        const snapshotId = 'snap_1';
        const event = factory.createSnapshotRestored(snapshotId, 3, 5);

        expect(event.type).toBe('snapshot.restored');
        expect(event.payload.snapshotId).toBe(snapshotId);
        expect(event.payload.previousVersion).toBe(3);
        expect(event.payload.restoredVersion).toBe(5);
      });
    });
  });

  describe('Event metadata', () => {
    it('should include timestamp', () => {
      const event = factory.createPhaseChanged('idle', 'discussion');
      expect(event.timestamp).toBeInstanceOf(Date);
    });

    it('should include unique ID', () => {
      const event1 = factory.createPhaseChanged('idle', 'discussion');
      const event2 = factory.createPhaseChanged('discussion', 'voting');

      expect(event1.id).not.toBe(event2.id);
    });

    it('should support custom source', () => {
      const agentId = createAgentId('agent-1');
      const event = factory.createPhaseChanged('idle', 'discussion', agentId);

      expect(event.source).toBe(agentId);
    });

    it('should default to system source', () => {
      const event = factory.createPhaseChanged('idle', 'discussion');
      expect(event.source).toBe('system');
    });
  });
});

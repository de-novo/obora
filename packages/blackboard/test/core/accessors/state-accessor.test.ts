import { describe, it, expect, beforeEach } from 'vitest';
import {
  Blackboard,
  createAgentId,
  createTaskId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
} from '../../../src';
import { createTestAgent, createTestTask, resetFactories } from '../../helpers/factories';

describe('StateAccessor', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard();
  });

  describe('phase', () => {
    it('should get current phase', () => {
      expect(board.state.phase).toBe('idle');
    });

    it('should set phase', () => {
      board.state.phase = 'discussion';
      expect(board.state.phase).toBe('discussion');
    });

    it('should emit event on phase change', () => {
      const events: string[] = [];
      board.on('state.phase.changed', (e) => events.push(e.type));
      
      board.state.phase = 'discussion';
      
      expect(events).toContain('state.phase.changed');
    });

    it('should not emit event if phase unchanged', () => {
      const events: string[] = [];
      board.on('state.phase.changed', (e) => events.push(e.type));
      
      board.state.phase = 'idle'; // Same as current
      
      expect(events).toHaveLength(0);
    });
  });

  describe('context', () => {
    it('should get context', () => {
      expect(board.state.context).toEqual({});
    });

    it('should set context value', () => {
      board.state.setContext('key1', 'value1');
      expect(board.state.getContext('key1')).toBe('value1');
    });

    it('should get context value with default', () => {
      expect(board.state.getContext('nonexistent', 'default')).toBe('default');
    });

    it('should delete context value', () => {
      board.state.setContext('key1', 'value1');
      board.state.deleteContext('key1');
      expect(board.state.getContext('key1')).toBeUndefined();
    });

    it('should merge context', () => {
      board.state.setContext('key1', 'value1');
      board.state.mergeContext({ key2: 'value2', key3: 'value3' });
      
      expect(board.state.getContext('key1')).toBe('value1');
      expect(board.state.getContext('key2')).toBe('value2');
      expect(board.state.getContext('key3')).toBe('value3');
    });

    it('should clear context', () => {
      board.state.setContext('key1', 'value1');
      board.state.setContext('key2', 'value2');
      board.state.clearContext();
      
      expect(board.state.context).toEqual({});
    });
  });

  describe('agents', () => {
    it('should register agent', () => {
      const agent = createTestAgent({ role: 'analyst' });
      board.state.registerAgent(agent);
      
      const retrieved = board.state.getAgent(agent.id);
      expect(retrieved).toEqual(agent);
    });

    it('should throw on duplicate agent registration', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      expect(() => board.state.registerAgent(agent)).toThrow();
    });

    it('should update agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      board.state.updateAgent(agent.id, {
        status: AgentStatusEnum.BUSY,
        currentTask: createTaskId('task-1'),
      });
      
      const updated = board.state.getAgent(agent.id);
      expect(updated?.status).toBe(AgentStatusEnum.BUSY);
      expect(updated?.currentTask).toBe('tsk_task-1');
    });

    it('should throw on updating non-existent agent', () => {
      expect(() => 
        board.state.updateAgent(createAgentId('nonexistent'), { status: AgentStatusEnum.BUSY })
      ).toThrow();
    });

    it('should remove agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      board.state.removeAgent(agent.id);
      
      expect(board.state.getAgent(agent.id)).toBeUndefined();
    });

    it('should throw on removing non-existent agent', () => {
      expect(() => board.state.removeAgent(createAgentId('nonexistent'))).toThrow();
    });

    it('should get all agents', () => {
      board.state.registerAgent(createTestAgent());
      board.state.registerAgent(createTestAgent());
      board.state.registerAgent(createTestAgent());
      
      expect(board.state.getAgents()).toHaveLength(3);
    });

    it('should filter agents by role', () => {
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      board.state.registerAgent(createTestAgent({ role: 'executor' }));
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      
      const analysts = board.state.getAgents({ role: 'analyst' });
      expect(analysts).toHaveLength(2);
      expect(analysts.every(a => a.role === 'analyst')).toBe(true);
    });

    it('should filter agents by status', () => {
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.BUSY }));
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.IDLE }));
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.BUSY }));
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.BUSY }));
      
      const active = board.state.getAgents({ status: AgentStatusEnum.BUSY });
      expect(active).toHaveLength(2);
    });

    it('should filter agents by multiple criteria', () => {
      board.state.registerAgent(createTestAgent({ role: 'analyst', status: AgentStatusEnum.BUSY }));
      board.state.registerAgent(createTestAgent({ role: 'analyst', status: AgentStatusEnum.IDLE }));
      board.state.registerAgent(createTestAgent({ role: 'executor', status: AgentStatusEnum.BUSY }));
      
      const activeAnalysts = board.state.getAgents({ role: 'analyst', status: AgentStatusEnum.BUSY });
      expect(activeAnalysts).toHaveLength(1);
    });

    it('should count agents', () => {
      board.state.registerAgent(createTestAgent());
      board.state.registerAgent(createTestAgent());
      
      expect(board.state.agentCount).toBe(2);
    });

    it('should check if agent exists', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      expect(board.state.hasAgent(agent.id)).toBe(true);
      expect(board.state.hasAgent(createAgentId('nonexistent'))).toBe(false);
    });

    it('should update agent heartbeat', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      const newHeartbeat = new Date();
      board.state.updateAgentHeartbeat(agent.id, newHeartbeat);
      
      const updated = board.state.getAgent(agent.id);
      expect(updated?.lastHeartbeat).toEqual(newHeartbeat);
    });
  });

  describe('tasks', () => {
    it('should add task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      
      expect(board.state.getTask(task.id)).toEqual(task);
    });

    it('should throw on duplicate task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      
      expect(() => board.state.addTask(task)).toThrow();
    });

    it('should update task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      
      board.state.updateTask(task.id, {
        status: TaskStatus.RUNNING,
        startedAt: new Date(),
      });
      
      const updated = board.state.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.RUNNING);
      expect(updated?.startedAt).toBeInstanceOf(Date);
    });

    it('should throw on updating non-existent task', () => {
      expect(() => 
        board.state.updateTask(createTaskId('nonexistent'), { status: TaskStatus.RUNNING })
      ).toThrow();
    });

    it('should remove task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      board.state.removeTask(task.id);
      
      expect(board.state.getTask(task.id)).toBeUndefined();
    });

    it('should get all tasks', () => {
      board.state.addTask(createTestTask());
      board.state.addTask(createTestTask());
      
      expect(board.state.getTasks()).toHaveLength(2);
    });

    it('should filter tasks by status', () => {
      board.state.addTask(createTestTask({ status: TaskStatus.PENDING }));
      board.state.addTask(createTestTask({ status: TaskStatus.RUNNING }));
      board.state.addTask(createTestTask({ status: TaskStatus.PENDING }));
      
      const pending = board.state.getTasks({ status: TaskStatus.PENDING });
      expect(pending).toHaveLength(2);
    });

    it('should filter tasks by priority', () => {
      board.state.addTask(createTestTask({ priority: TaskPriority.HIGH }));
      board.state.addTask(createTestTask({ priority: TaskPriority.LOW }));
      board.state.addTask(createTestTask({ priority: TaskPriority.HIGH }));
      
      const highPriority = board.state.getTasks({ priority: TaskPriority.HIGH });
      expect(highPriority).toHaveLength(2);
    });

    it('should filter tasks by assignedTo', () => {
      const agentId = createAgentId('agent-1');
      board.state.addTask(createTestTask({ assignedTo: agentId }));
      board.state.addTask(createTestTask({ assignedTo: null }));
      board.state.addTask(createTestTask({ assignedTo: agentId }));
      
      const assigned = board.state.getTasks({ assignedTo: agentId });
      expect(assigned).toHaveLength(2);
    });

    it('should count tasks', () => {
      board.state.addTask(createTestTask());
      board.state.addTask(createTestTask());
      board.state.addTask(createTestTask());
      
      expect(board.state.taskCount).toBe(3);
    });

    it('should check if task exists', () => {
      const task = createTestTask();
      board.state.addTask(task);
      
      expect(board.state.hasTask(task.id)).toBe(true);
      expect(board.state.hasTask(createTaskId('nonexistent'))).toBe(false);
    });

    it('should assign task to agent', () => {
      const task = createTestTask();
      const agent = createTestAgent();
      
      board.state.addTask(task);
      board.state.registerAgent(agent);
      board.state.assignTask(task.id, agent.id);
      
      const updated = board.state.getTask(task.id);
      expect(updated?.assignedTo).toBe(agent.id);
    });

    it('should unassign task', () => {
      const task = createTestTask({ assignedTo: createAgentId('agent-1') });
      board.state.addTask(task);
      
      board.state.unassignTask(task.id);
      
      const updated = board.state.getTask(task.id);
      expect(updated?.assignedTo).toBeNull();
    });

    it('should complete task', () => {
      const task = createTestTask({ status: TaskStatus.RUNNING });
      board.state.addTask(task);
      
      board.state.completeTask(task.id, { result: 'success' });
      
      const updated = board.state.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.COMPLETED);
      expect(updated?.outputs).toEqual({ result: 'success' });
      expect(updated?.completedAt).toBeInstanceOf(Date);
    });

    it('should fail task', () => {
      const task = createTestTask({ status: TaskStatus.RUNNING });
      board.state.addTask(task);
      
      board.state.failTask(task.id, 'Something went wrong');
      
      const updated = board.state.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.FAILED);
      expect(updated?.error).toBe('Something went wrong');
    });
  });
});

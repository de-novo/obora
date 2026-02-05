import { describe, it, expect, beforeEach } from 'vitest';
import {
  Blackboard,
  VersionConflictError,
  PathNotFoundError,
  createSessionId,
  createAgentId,
  createTaskId,
  AgentStatusEnum,
  TaskStatus,
  TaskPriority,
} from '../../src';
import { createInitialState } from '../helpers/fixtures';
import { createTestAgent, createTestTask, resetFactories } from '../helpers/factories';

describe('Blackboard', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard({
      sessionId: createSessionId('test-session'),
    });
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const b = new Blackboard();
      expect(b.version).toBe(1);
      expect(b.meta.sessionId).toBeDefined();
    });

    it('should create with custom session ID', () => {
      const sessionId = createSessionId('custom-session');
      const b = new Blackboard({ sessionId });
      expect(b.meta.sessionId).toBe(sessionId);
    });

    it('should create with initial state', () => {
      const initialState = createInitialState();
      initialState.state.phase = 'discussion';
      const b = new Blackboard({ initialState });
      expect(b.state.phase).toBe('discussion');
    });

    it('should emit state.initialized event', () => {
      const events: string[] = [];
      const b = new Blackboard({
        onEvent: (event) => events.push(event.type),
      });
      expect(events).toContain('state.initialized');
    });
  });

  describe('version', () => {
    it('should start at version 1', () => {
      expect(board.version).toBe(1);
    });

    it('should increment on write', () => {
      board.write('state.phase', 'discussion');
      expect(board.version).toBe(2);
    });

    it('should increment on delete', () => {
      board.write('state.context.key1', 'value1');
      const versionBeforeDelete = board.version;
      board.delete('state.context.key1');
      expect(board.version).toBe(versionBeforeDelete + 1);
    });
  });

  describe('meta', () => {
    it('should return metadata', () => {
      const meta = board.meta;
      expect(meta.sessionId).toBeDefined();
      expect(meta.version).toBeDefined();
      expect(meta.createdAt).toBeInstanceOf(Date);
      expect(meta.lastUpdated).toBeInstanceOf(Date);
    });

    it('should update lastUpdated on write', () => {
      const before = board.meta.lastUpdated;
      board.write('state.phase', 'discussion');
      const after = board.meta.lastUpdated;
      expect(after.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });
  });

  describe('read()', () => {
    it('should read top-level section', () => {
      const state = board.read('state');
      expect(state).toBeDefined();
      expect(state.phase).toBe('idle');
    });

    it('should read nested path', () => {
      const phase = board.read('state.phase');
      expect(phase).toBe('idle');
    });

    it('should return deep copy by default', () => {
      const context1 = board.read<Record<string, unknown>>('state.context');
      const context2 = board.read<Record<string, unknown>>('state.context');
      expect(context1).not.toBe(context2);
      expect(context1).toEqual(context2);
    });

    it('should throw PathNotFoundError for invalid path', () => {
      expect(() => board.read('invalid.path')).toThrow(PathNotFoundError);
    });

    it('should return undefined for non-strict mode', () => {
      const value = board.read('state.nonexistent', { strict: false });
      expect(value).toBeUndefined();
    });

    it('should read deeply nested paths', () => {
      board.write('state.context.deep.nested.value', 42);
      expect(board.read('state.context.deep.nested.value')).toBe(42);
    });
  });

  describe('write()', () => {
    it('should write value and increment version', () => {
      const initialVersion = board.version;
      const result = board.write('state.phase', 'discussion');
      
      expect(result.success).toBe(true);
      expect(result.version).toBe(initialVersion + 1);
      expect(board.read('state.phase')).toBe('discussion');
    });

    it('should return previous value', () => {
      const result = board.write('state.phase', 'discussion');
      expect(result.previousValue).toBe('idle');
    });

    it('should succeed with matching expected version', () => {
      const result = board.write('state.phase', 'discussion', {
        expectedVersion: board.version,
      });
      expect(result.success).toBe(true);
    });

    it('should throw VersionConflictError on version mismatch', () => {
      expect(() =>
        board.write('state.phase', 'discussion', { expectedVersion: 999 })
      ).toThrow(VersionConflictError);
    });

    it('should create nested paths', () => {
      board.write('state.context.new.nested.path', 'value');
      expect(board.read('state.context.new.nested.path')).toBe('value');
    });

    it('should emit state.updated event', () => {
      const events: string[] = [];
      board.on('state.updated', (event) => events.push(event.type));
      board.write('state.phase', 'discussion');
      expect(events).toContain('state.updated');
    });
  });

  describe('delete()', () => {
    it('should delete value at path', () => {
      board.write('state.context.key1', 'value1');
      const result = board.delete('state.context.key1');
      
      expect(result.success).toBe(true);
      expect(board.exists('state.context.key1')).toBe(false);
    });

    it('should return deleted value', () => {
      board.write('state.context.key1', 'value1');
      const result = board.delete('state.context.key1');
      expect(result.previousValue).toBe('value1');
    });

    it('should throw for non-existent path in strict mode', () => {
      expect(() => board.delete('state.context.nonexistent')).toThrow();
    });

    it('should return success: false for non-existent path in non-strict mode', () => {
      const result = board.delete('state.context.nonexistent', { strict: false });
      expect(result.success).toBe(false);
    });
  });

  describe('exists()', () => {
    it('should return true for existing path', () => {
      expect(board.exists('state.phase')).toBe(true);
    });

    it('should return false for non-existing path', () => {
      expect(board.exists('state.context.nonexistent')).toBe(false);
    });

    it('should return true for null value', () => {
      board.write('state.context.nullValue', null);
      expect(board.exists('state.context.nullValue')).toBe(true);
    });

    it('should return false for undefined value', () => {
      expect(board.exists('state.context.undefinedValue')).toBe(false);
    });
  });

  describe('transaction()', () => {
    it('should execute multiple operations atomically', () => {
      const results = board.transaction([
        { type: 'write', path: 'state.context.a', value: 1 },
        { type: 'write', path: 'state.context.b', value: 2 },
      ]);

      expect(results).toHaveLength(2);
      expect(results.every(r => r.success)).toBe(true);
      expect(board.read('state.context.a')).toBe(1);
      expect(board.read('state.context.b')).toBe(2);
    });

    it('should increment version once for all operations', () => {
      const initialVersion = board.version;
      board.transaction([
        { type: 'write', path: 'state.context.a', value: 1 },
        { type: 'write', path: 'state.context.b', value: 2 },
        { type: 'write', path: 'state.context.c', value: 3 },
      ]);

      expect(board.version).toBe(initialVersion + 1);
    });

    it('should rollback on failure', () => {
      board.write('state.context.initial', 'value');
      const initialValue = board.read('state.context.initial');
      
      try {
        board.transaction([
          { type: 'write', path: 'state.context.initial', value: 'modified' },
          { type: 'write', path: 'state.context.new', value: 'new', expectedVersion: 999 },
        ]);
      } catch {
        // Expected to fail
      }

      // Should rollback
      expect(board.read('state.context.initial')).toBe(initialValue);
    });

    it('should support delete operations', () => {
      board.write('state.context.toDelete', 'value');
      
      board.transaction([
        { type: 'delete', path: 'state.context.toDelete' },
        { type: 'write', path: 'state.context.new', value: 'value' },
      ]);

      expect(board.exists('state.context.toDelete')).toBe(false);
      expect(board.read('state.context.new')).toBe('value');
    });
  });

  describe('getState()', () => {
    it('should return complete state', () => {
      const state = board.getState();

      expect(state).toHaveProperty('meta');
      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('knowledge');
      expect(state).toHaveProperty('decisions');
    });

    it('should return deep copy', () => {
      const state1 = board.getState();
      const state2 = board.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });
  });

  describe('on() / off()', () => {
    it('should subscribe to events', () => {
      const events: string[] = [];
      const handler = (event: any) => events.push(event.type);
      
      board.on('state.updated', handler);
      board.write('state.phase', 'discussion');

      expect(events).toContain('state.updated');
    });

    it('should unsubscribe from events', () => {
      const events: string[] = [];
      const handler = (event: any) => events.push(event.type);
      
      board.on('state.updated', handler);
      board.off('state.updated', handler);
      board.write('state.phase', 'discussion');

      expect(events).not.toContain('state.updated');
    });

    it('should support wildcard subscriptions', () => {
      const events: string[] = [];
      board.on('state.*', (event) => events.push(event.type));
      
      board.write('state.phase', 'discussion');
      board.write('state.context.key', 'value');

      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe('once()', () => {
    it('should fire only once', () => {
      let count = 0;
      board.once('state.updated', () => count++);
      
      board.write('state.phase', 'discussion');
      board.write('state.phase', 'voting');

      expect(count).toBe(1);
    });
  });
});

describe('Blackboard State Accessors', () => {
  let board: Blackboard;

  beforeEach(() => {
    resetFactories();
    board = new Blackboard();
  });

  describe('state accessor', () => {
    it('should get/set phase', () => {
      board.state.phase = 'discussion';
      expect(board.state.phase).toBe('discussion');
    });

    it('should register agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      expect(board.state.getAgent(agent.id)).toEqual(agent);
    });

    it('should update agent status', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      
      board.state.updateAgent(agent.id, { status: AgentStatusEnum.BUSY });
      
      const updated = board.state.getAgent(agent.id);
      expect(updated?.status).toBe(AgentStatusEnum.BUSY);
    });

    it('should remove agent', () => {
      const agent = createTestAgent();
      board.state.registerAgent(agent);
      board.state.removeAgent(agent.id);
      
      expect(board.state.getAgent(agent.id)).toBeUndefined();
    });

    it('should filter agents by role', () => {
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      board.state.registerAgent(createTestAgent({ role: 'executor' }));
      board.state.registerAgent(createTestAgent({ role: 'analyst' }));
      
      const analysts = board.state.getAgents({ role: 'analyst' });
      expect(analysts).toHaveLength(2);
    });

    it('should filter agents by status', () => {
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.BUSY }));
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.IDLE }));
      board.state.registerAgent(createTestAgent({ status: AgentStatusEnum.BUSY }));
      
      const active = board.state.getAgents({ status: AgentStatusEnum.BUSY });
      expect(active).toHaveLength(2);
    });

    it('should add and get tasks', () => {
      const task = createTestTask();
      board.state.addTask(task);
      
      expect(board.state.getTask(task.id)).toEqual(task);
    });

    it('should update task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      board.state.updateTask(task.id, { status: TaskStatus.RUNNING });
      
      const updated = board.state.getTask(task.id);
      expect(updated?.status).toBe(TaskStatus.RUNNING);
    });

    it('should remove task', () => {
      const task = createTestTask();
      board.state.addTask(task);
      board.state.removeTask(task.id);
      
      expect(board.state.getTask(task.id)).toBeUndefined();
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
      board.state.addTask(createTestTask({ priority: TaskPriority.NORMAL }));
      board.state.addTask(createTestTask({ priority: TaskPriority.HIGH }));
      
      const highPriority = board.state.getTasks({ priority: TaskPriority.HIGH });
      expect(highPriority).toHaveLength(2);
    });

    it('should get all agents', () => {
      board.state.registerAgent(createTestAgent());
      board.state.registerAgent(createTestAgent());
      board.state.registerAgent(createTestAgent());
      
      const allAgents = board.state.getAgents();
      expect(allAgents).toHaveLength(3);
    });

    it('should get all tasks', () => {
      board.state.addTask(createTestTask());
      board.state.addTask(createTestTask());
      
      const allTasks = board.state.getTasks();
      expect(allTasks).toHaveLength(2);
    });
  });
});

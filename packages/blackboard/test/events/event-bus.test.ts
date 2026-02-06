import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventBus } from '../../src/events/event-bus';
import { EventFactory } from '../../src/events/event-factory';
import { createAgentId, createTaskId } from '../../src';

describe('EventBus', () => {
  let bus: EventBus;
  let factory: EventFactory;

  beforeEach(() => {
    bus = new EventBus({ historySize: 100 });
    factory = new EventFactory(() => `event-${Date.now()}-${Math.random()}`);
  });

  describe('constructor', () => {
    it('should create with default options', () => {
      const b = new EventBus();
      expect(b).toBeDefined();
    });

    it('should create with custom history size', () => {
      const b = new EventBus({ historySize: 50 });
      expect(b).toBeDefined();
    });
  });

  describe('subscribe()', () => {
    it('should subscribe to specific event type', () => {
      const handler = vi.fn();
      bus.subscribe('task.completed', handler);

      const event = factory.createTaskCompleted(
        createTaskId('task-1'),
        { result: 'success' },
        1000
      );
      bus.emit(event);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should support wildcard subscription (*)', () => {
      const handler = vi.fn();
      bus.subscribe('task.*', handler);

      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support global wildcard (*)', () => {
      const handler = vi.fn();
      bus.subscribe('*', handler);

      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createPhaseChanged('idle', 'discussion'));

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = bus.subscribe('task.completed', handler);

      unsub();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      bus.subscribe('task.completed', handler1);
      bus.subscribe('task.completed', handler2);

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call unsubscribed handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      const unsub1 = bus.subscribe('task.completed', handler1);
      bus.subscribe('task.completed', handler2);

      unsub1();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeWithFilter()', () => {
    it('should filter by source', () => {
      const handler = vi.fn();
      const agentId = createAgentId('ceo');
      
      bus.subscribeWithFilter(
        'decision.*',
        { source: agentId },
        handler
      );

      // Event from CEO
      bus.emit({
        id: 'e1',
        type: 'decision.agenda.submitted',
        timestamp: new Date(),
        source: agentId,
        payload: {},
      } as any);

      // Event from other agent
      bus.emit({
        id: 'e2',
        type: 'decision.agenda.submitted',
        timestamp: new Date(),
        source: createAgentId('cfo'),
        payload: {},
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should filter with custom predicate', () => {
      const handler = vi.fn();
      
      bus.subscribeWithFilter(
        'task.completed',
        { predicate: (e) => (e.payload as any).duration > 5000 },
        handler
      );

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 3000));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 8000));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should combine multiple filters', () => {
      const handler = vi.fn();
      const agentId = createAgentId('agent-1');
      
      bus.subscribeWithFilter(
        'task.*',
        { 
          source: agentId,
          predicate: (e) => e.type === 'task.completed',
        },
        handler
      );

      bus.emit({
        id: 'e1',
        type: 'task.completed',
        timestamp: new Date(),
        source: agentId,
        payload: {},
      } as any);

      bus.emit({
        id: 'e2',
        type: 'task.created',
        timestamp: new Date(),
        source: agentId,
        payload: {},
      } as any);

      bus.emit({
        id: 'e3',
        type: 'task.completed',
        timestamp: new Date(),
        source: createAgentId('agent-2'),
        payload: {},
      } as any);

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeOnce()', () => {
    it('should only fire once', () => {
      const handler = vi.fn();
      bus.subscribeOnce('task.completed', handler);

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return unsubscribe function', () => {
      const handler = vi.fn();
      const unsub = bus.subscribeOnce('task.completed', handler);

      unsub();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('emit()', () => {
    it('should emit event to subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('task.completed', handler);

      const event = factory.createTaskCompleted(createTaskId('t1'), {}, 100);
      bus.emit(event);

      expect(handler).toHaveBeenCalledWith(event);
    });

    it('should add event to history', () => {
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const history = bus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should respect history size limit', () => {
      const b = new EventBus({ historySize: 2 });

      b.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      b.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));
      b.emit(factory.createTaskCompleted(createTaskId('t3'), {}, 100));

      const history = b.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      bus.subscribe('task.completed', errorHandler);
      bus.subscribe('task.completed', normalHandler);

      expect(() => 
        bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100))
      ).not.toThrow();

      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('emitAsync()', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should wait for async handlers', async () => {
      const results: number[] = [];

      bus.subscribe('task.completed', async () => {
        await new Promise(r => setTimeout(r, 10));
        results.push(1);
      });
      bus.subscribe('task.completed', async () => {
        await new Promise(r => setTimeout(r, 5));
        results.push(2);
      });

      await bus.emitAsync(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(results).toContain(1);
      expect(results).toContain(2);
    });

    it('should handle async errors', async () => {
      bus.subscribe('task.completed', async () => {
        throw new Error('Async error');
      });

      await expect(
        bus.emitAsync(factory.createTaskCompleted(createTaskId('t1'), {}, 100))
      ).resolves.not.toThrow();
    });
  });

  describe('getHistory()', () => {
    it('should return event history', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const history = bus.getHistory();
      expect(history).toHaveLength(2);
    });

    it('should filter history by type', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const history = bus.getHistory({ type: 'task.completed' });
      expect(history).toHaveLength(1);
    });

    it('should filter history by wildcard type', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));
      bus.emit(factory.createPhaseChanged('idle', 'discussion'));

      const history = bus.getHistory({ type: 'task.*' });
      expect(history).toHaveLength(2);
    });

    it('should filter history by time range', () => {
      vi.useRealTimers();
      
      const now = new Date();
      const hourAgo = new Date(now.getTime() - 3600000);

      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      const history = bus.getHistory({ since: hourAgo });
      expect(history.length).toBeGreaterThan(0);
    });

    it('should limit history results', () => {
      for (let i = 0; i < 10; i++) {
        bus.emit(factory.createTaskCompleted(createTaskId(`t${i}`), {}, 100));
      }

      const history = bus.getHistory({ limit: 5 });
      expect(history).toHaveLength(5);
    });
  });

  describe('waitFor()', () => {
    beforeEach(() => {
      vi.useRealTimers();
    });

    it('should resolve when event occurs', async () => {
      const promise = bus.waitFor('task.completed', 1000);

      setTimeout(() => {
        bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      }, 10);

      const event = await promise;
      expect(event.type).toBe('task.completed');
    });

    it('should reject on timeout', async () => {
      await expect(bus.waitFor('task.completed', 10)).rejects.toThrow();
    });

    it('should support filter predicate', async () => {
      const promise = bus.waitFor(
        'task.completed',
        1000,
        (e) => (e.payload as any).taskId === 'tsk_target'
      );

      setTimeout(() => {
        bus.emit({
          id: 'e1',
          type: 'task.completed',
          timestamp: new Date(),
          source: 'system',
          payload: { taskId: 'tsk_other' },
        } as any);
        bus.emit({
          id: 'e2',
          type: 'task.completed',
          timestamp: new Date(),
          source: 'system',
          payload: { taskId: 'tsk_target' },
        } as any);
      }, 10);

      const event = await promise;
      expect((event.payload as any).taskId).toBe('tsk_target');
    });
  });

  describe('getStats()', () => {
    it('should return correct statistics', () => {
      bus.subscribe('task.*', () => {});
      bus.subscribe('task.completed', () => {});
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      const stats = bus.getStats();
      expect(stats.totalEmitted).toBe(2);
      expect(stats.subscriberCount).toBeGreaterThan(0);
    });

    it('should track emitted event types', () => {
      bus.emit(factory.createTaskCreated({ id: createTaskId('t1') } as any));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t3'), {}, 100));

      const stats = bus.getStats();
      expect(stats.eventsByType['task.completed']).toBe(2);
      expect(stats.eventsByType['task.created']).toBe(1);
    });
  });

  describe('clear()', () => {
    it('should clear history', () => {
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCompleted(createTaskId('t2'), {}, 100));

      bus.clear();

      expect(bus.getHistory()).toHaveLength(0);
    });

    it('should not affect subscribers', () => {
      const handler = vi.fn();
      bus.subscribe('task.completed', handler);

      bus.clear();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('unsubscribeAll()', () => {
    it('should remove all subscribers', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('task.completed', handler1);
      bus.subscribe('task.created', handler2);

      bus.unsubscribeAll();
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCreated({ id: createTaskId('t2') } as any));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove subscribers for specific type', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.subscribe('task.completed', handler1);
      bus.subscribe('task.created', handler2);

      bus.unsubscribeAll('task.completed');
      bus.emit(factory.createTaskCompleted(createTaskId('t1'), {}, 100));
      bus.emit(factory.createTaskCreated({ id: createTaskId('t2') } as any));

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });
});

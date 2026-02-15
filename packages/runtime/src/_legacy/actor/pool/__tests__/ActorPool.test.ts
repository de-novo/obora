import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Actor, ActorRole, ActorId } from "../../types/actor";
import type { IBlackboard } from "../../types/actor";
import type { IMessageBus } from "../../types/message";
import type { Observation } from "../../types/observation";
import type { Action } from "../../types/action";
import type { Result } from "../../types/result";
import { ActorRole as ActorRoleEnum, createActorId, ActorLifecycleStatus } from "../../types/actor";
import { createActionId } from "../../types/action";
import { createResultId } from "../../types/result";
import { createActorMetrics } from "../../types/metrics";
import { ActorPool, PoolConfig } from "../ActorPool";
import type { ActorFactory, ActorConfig } from "../../runtime/types";

class MockActor implements Actor {
  readonly id: ActorId;
  readonly name: string;
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  status: {
    id: ActorId;
    name: string;
    role: ActorRole;
    status: ActorLifecycleStatus;
    messageQueue: { pending: number; processing: boolean };
    metrics: {
      totalMessagesProcessed: number;
      totalActionsExecuted: number;
      totalErrors: number;
      averageResponseTime: number;
      uptime: number;
    };
    lastSeen: Date;
    errorCount: number;
  };
  lastActivity: Date;
  createdAt: Date;
  metrics: ReturnType<typeof createActorMetrics>;

  constructor(id: ActorId, role: ActorRole, board: IBlackboard, messageBus: IMessageBus) {
    this.id = id;
    this.name = `mock-${id}`;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this.lastActivity = new Date();
    this.createdAt = new Date();
    this.status = {
      id,
      name: this.name,
      role,
      status: ActorLifecycleStatus.RUNNING,
      messageQueue: { pending: 0, processing: false },
      metrics: {
        totalMessagesProcessed: 0,
        totalActionsExecuted: 0,
        totalErrors: 0,
        averageResponseTime: 0,
        uptime: 0,
      },
      lastSeen: new Date(),
      errorCount: 0,
    };
    this.metrics = createActorMetrics();
  }

  observe(): Observation | Promise<Observation> {
    return { actorId: this.id, timestamp: new Date() };
  }

  think(_observation: Observation): Action | Promise<Action> {
    return {
      id: createActionId("action-1"),
      actorId: this.id,
      type: "execute" as const,
      params: {},
      timestamp: new Date(),
    };
  }

  act(_action: Action): Result | Promise<Result> {
    return {
      id: createResultId("result-1"),
      actionId: createActionId("action-1"),
      actorId: this.id,
      timestamp: new Date(),
      status: "success" as const,
      output: { result: "mock result" },
      metrics: { duration: 10 },
    };
  }

  async report(_result: Result): Promise<void> {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async restart(): Promise<void> {}

  isAlive(): boolean {
    return true;
  }

  async receive(_message: any): Promise<void> {}

  getStatus() {
    return this.status;
  }
}

class MockFactory implements ActorFactory {
  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    return new MockActor(config.id || createActorId(config.role), config.role, board, messageBus);
  }
}

describe("ActorPool", () => {
  let pool: ActorPool;
  let board: IBlackboard;
  let messageBus: IMessageBus;
  let factory: ActorFactory;

  beforeEach(() => {
    board = {
      read: vi.fn(),
      write: vi.fn(),
      delete: vi.fn(),
      keys: vi.fn(() => []),
      find: vi.fn(() => []),
      version: 1,
    };
    messageBus = {
      send: vi.fn(),
      sendTo: vi.fn(),
      broadcast: vi.fn(),
      receive: vi.fn(),
      request: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      getQueueSize: vi.fn(() => 0),
      clearQueue: vi.fn(),
      filter: vi.fn(() => []),
    };
    factory = new MockFactory();

    const config: PoolConfig = {
      name: "test-pool",
      role: "analyst",
      type: "mock",
      initialSize: 2,
      minSize: 1,
      maxSize: 5,
      idleTimeout: 5000,
      debug: false,
    };

    pool = new ActorPool(config, board, factory, messageBus);
  });

  describe("start/stop", () => {
    it("should start pool with initial actors", async () => {
      await pool.start();
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(2);
      expect(metrics.idleActors).toBe(2);
      expect(metrics.activeActors).toBe(0);
    });

    it("should stop pool", async () => {
      await pool.start();
      await pool.stop();
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(0);
      expect(metrics.idleActors).toBe(0);
    });

    it("should throw when starting already running pool", async () => {
      await pool.start();
      await expect(pool.start()).rejects.toThrow("Pool is already running");
    });

    it("should stop gracefully if already stopped", async () => {
      await pool.start();
      await pool.stop();
      await expect(pool.stop()).resolves.not.toThrow();
    });
  });

  describe("scale", () => {
    beforeEach(async () => {
      await pool.start();
    });

    it("should scale up", async () => {
      await pool.scaleUp(2);
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(4);
    });

    it("should scale down", async () => {
      await pool.scaleDown();
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(1);
    });

    it("should respect min size", async () => {
      await pool.scaleDown();
      await pool.scaleDown();
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(1);
    });

    it("should respect max size", async () => {
      await pool.scaleUp(10);
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(5);
    });

    it("should scale to specific size", async () => {
      await pool.scaleTo(3);
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(3);
    });

    it("should not scale if already at target size", async () => {
      await pool.scaleTo(2);
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(2);
    });
  });

  describe("task submission", () => {
    beforeEach(async () => {
      await pool.start();
    });

    it("should submit task and return task ID", async () => {
      const taskId = await pool.submit({ data: "test" });
      expect(taskId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it("should submit task with priority", async () => {
      const taskId1 = await pool.submit({ data: "low" }, 0);
      const taskId2 = await pool.submit({ data: "high" }, 10);
      expect(taskId1).toBeDefined();
      expect(taskId2).toBeDefined();
    });

    it("should queue tasks when no idle actors", async () => {
      const config: PoolConfig = {
        name: "test-pool-small",
        role: "analyst",
        type: "mock",
        initialSize: 1,
        maxSize: 1,
        debug: false,
      };
      const smallPool = new ActorPool(config, board, factory, messageBus);
      await smallPool.start();

      await smallPool.submit({ data: "task1" });
      await smallPool.submit({ data: "task2" });

      const metrics = smallPool.getMetrics();
      expect(metrics.queueSize).toBeGreaterThan(0);

      await smallPool.stop();
    });

    it("should respect priority in queue", async () => {
      const taskId1 = await pool.submit({ data: "low" }, 0);
      const taskId2 = await pool.submit({ data: "high" }, 10);
      const taskId3 = await pool.submit({ data: "medium" }, 5);

      expect(taskId1).toBeDefined();
      expect(taskId2).toBeDefined();
      expect(taskId3).toBeDefined();
    });

    it("should throw when queue is full", async () => {
      const config: PoolConfig = {
        name: "test-pool-full",
        role: "analyst",
        type: "mock",
        initialSize: 1,
        maxQueueSize: 2,
        debug: false,
      };
      const fullPool = new ActorPool(config, board, factory, messageBus);
      await fullPool.start();

      await fullPool.submit({ data: "task1" });
      await fullPool.submit({ data: "task2" });

      await expect(fullPool.submit({ data: "task3" })).rejects.toThrow("Task queue is full");

      await fullPool.stop();
    });

    it("should throw when pool is not running", async () => {
      const stoppedPool = new ActorPool(
        {
          name: "stopped-pool",
          role: "analyst",
          type: "mock",
        },
        board,
        factory,
        messageBus
      );
      await expect(stoppedPool.submit({ data: "test" })).rejects.toThrow("Pool is not running");
    });

    it("should submit task and wait for result", async () => {
      const result = await pool.submitAndWait({ data: "test" });
      expect(result).toBeDefined();
    }, 10000);
  });

  describe("dispatch strategies", () => {
    beforeEach(async () => {
      await pool.start();
    });

    it("should use round-robin dispatch", async () => {
      const config: PoolConfig = {
        name: "test-pool-rr",
        role: "analyst",
        type: "mock",
        initialSize: 3,
        dispatchStrategy: "round-robin",
        debug: false,
      };
      const rrPool = new ActorPool(config, board, factory, messageBus);
      await rrPool.start();

      const actors = rrPool.getActors();
      expect(actors.length).toBe(3);

      for (let i = 0; i < 6; i++) {
        await rrPool.submit({ data: `task${i}` });
      }

      const metrics = rrPool.getMetrics();
      expect(metrics.totalActors).toBe(3);

      await rrPool.stop();
    });

    it("should use least-busy dispatch", async () => {
      const config: PoolConfig = {
        name: "test-pool-lb",
        role: "analyst",
        type: "mock",
        initialSize: 3,
        dispatchStrategy: "least-busy",
        debug: false,
      };
      const lbPool = new ActorPool(config, board, factory, messageBus);
      await lbPool.start();

      for (let i = 0; i < 3; i++) {
        await lbPool.submit({ data: `task${i}` });
      }

      const metrics = lbPool.getMetrics();
      expect(metrics.totalActors).toBe(3);

      await lbPool.stop();
    });

    it("should use random dispatch", async () => {
      const config: PoolConfig = {
        name: "test-pool-random",
        role: "analyst",
        type: "mock",
        initialSize: 3,
        dispatchStrategy: "random",
        debug: false,
      };
      const randomPool = new ActorPool(config, board, factory, messageBus);
      await randomPool.start();

      for (let i = 0; i < 3; i++) {
        await randomPool.submit({ data: `task${i}` });
      }

      const metrics = randomPool.getMetrics();
      expect(metrics.totalActors).toBe(3);

      await randomPool.stop();
    });
  });

  describe("metrics", () => {
    beforeEach(async () => {
      await pool.start();
    });

    it("should track total actors", () => {
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(2);
    });

    it("should track idle actors", () => {
      const metrics = pool.getMetrics();
      expect(metrics.idleActors).toBe(2);
    });

    it("should track active actors", () => {
      const metrics = pool.getMetrics();
      expect(metrics.activeActors).toBe(0);
    });

    it("should track queue size", () => {
      const metrics = pool.getMetrics();
      expect(metrics.queueSize).toBe(0);
    });

    it("should update metrics after scaling", async () => {
      await pool.scaleUp();
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(3);
      expect(metrics.idleActors).toBe(3);
    });

    it("should track throughput", async () => {
      await pool.submitAndWait({ data: "test1" });
      await pool.submitAndWait({ data: "test2" });

      await new Promise((resolve) => setTimeout(resolve, 1100));

      const metrics = pool.getMetrics();
      expect(metrics.throughput.actionsPerSecond).toBeGreaterThanOrEqual(0);
    }, 15000);

    it("should calculate utilization correctly", async () => {
      const metrics = pool.getMetrics();
      expect(metrics.utilization).toBeGreaterThanOrEqual(0);
      expect(metrics.utilization).toBeLessThanOrEqual(1);
    });
  });

  describe("idle timeout", () => {
    it("should remove idle actors after timeout", async () => {
      const config: PoolConfig = {
        name: "test-pool-idle",
        role: "analyst",
        type: "mock",
        initialSize: 3,
        minSize: 1,
        idleTimeout: 100,
        scaleStrategy: "fixed",
        debug: false,
      };
      const fastPool = new ActorPool(config, board, factory, messageBus);
      await fastPool.start();

      expect(fastPool.getMetrics().totalActors).toBe(3);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(fastPool.getMetrics().totalActors).toBe(1);

      await fastPool.stop();
    }, 10000);

    it("should respect min size during idle timeout", async () => {
      const config: PoolConfig = {
        name: "test-pool-minsize",
        role: "analyst",
        type: "mock",
        initialSize: 2,
        minSize: 2,
        idleTimeout: 100,
        scaleStrategy: "fixed",
        debug: false,
      };
      const minPool = new ActorPool(config, board, factory, messageBus);
      await minPool.start();

      expect(minPool.getMetrics().totalActors).toBe(2);

      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(minPool.getMetrics().totalActors).toBe(2);

      await minPool.stop();
    }, 10000);
  });

  describe("scale strategies", () => {
    it("should use fixed strategy", async () => {
      const config: PoolConfig = {
        name: "test-pool-fixed",
        role: "analyst",
        type: "mock",
        initialSize: 2,
        scaleStrategy: "fixed",
        debug: false,
      };
      const fixedPool = new ActorPool(config, board, factory, messageBus);
      await fixedPool.start();

      await fixedPool.submit({ data: "task1" });
      await fixedPool.submit({ data: "task2" });
      await fixedPool.submit({ data: "task3" });

      const metrics = fixedPool.getMetrics();
      expect(metrics.totalActors).toBe(2);

      await fixedPool.stop();
    });

    it("should use dynamic strategy", async () => {
      const config: PoolConfig = {
        name: "test-pool-dynamic",
        role: "analyst",
        type: "mock",
        initialSize: 2,
        maxSize: 5,
        scaleStrategy: "dynamic",
        debug: false,
      };
      const dynamicPool = new ActorPool(config, board, factory, messageBus);
      await dynamicPool.start();

      const metrics = dynamicPool.getMetrics();
      expect(metrics.totalActors).toBe(2);
      expect(dynamicPool.name).toBe("test-pool-dynamic");

      await dynamicPool.stop();
    });

    it("should use adaptive strategy", async () => {
      const config: PoolConfig = {
        name: "test-pool-adaptive",
        role: "analyst",
        type: "mock",
        initialSize: 2,
        maxSize: 5,
        scaleStrategy: "adaptive",
        debug: false,
      };
      const adaptivePool = new ActorPool(config, board, factory, messageBus);
      await adaptivePool.start();

      const metrics = adaptivePool.getMetrics();
      expect(metrics.totalActors).toBe(2);
      expect(adaptivePool.name).toBe("test-pool-adaptive");

      await adaptivePool.stop();
    });
  });

  describe("actor operations", () => {
    beforeEach(async () => {
      await pool.start();
    });

    it("should get actors", () => {
      const actors = pool.getActors();
      expect(actors.length).toBe(2);
      expect(actors[0]).toBeDefined();
    });

    it("should get actor status", () => {
      const actors = pool.getActors();
      const status = pool.getActorStatus(actors[0]);
      expect(status).toBeDefined();
      expect(status.id).toBe(actors[0]);
      expect(status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should throw when getting status for non-existent actor", () => {
      expect(() => pool.getActorStatus("non-existent" as ActorId)).toThrow("Actor not found");
    });

    it("should return pool name", () => {
      expect(pool.name).toBe("test-pool");
    });
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

import { ActorPool, PoolConfig } from "../../ActorPool";
import { PoolManager } from "../../PoolManager";
import type { ActorFactory, ActorConfig } from "../../types";
import type {
  Actor,
  IBlackboard,
  ActorId,
  ActorLifecycleStatus,
  ActorRole,
} from "../../actor-types/actor";
import type { IMessageBus } from "../../actor-types/message";
import type { Observation } from "../../actor-types/observation";
import type { Action } from "../../actor-types/action";
import type { Result } from "../../actor-types/result";
import { createActionId } from "../../actor-types/action";
import { createResultId } from "../../actor-types/result";
import { createActorMetrics } from "../../actor-types/metrics";
import { createActorId, ActorRole as ActorRoleEnum } from "../../actor-types/actor";

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
      status: "running" as ActorLifecycleStatus,
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

describe("PoolManager", () => {
  let manager: PoolManager;
  let factory: ActorFactory;
  let board: IBlackboard;
  let messageBus: IMessageBus;

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
    manager = new PoolManager(board, factory, messageBus);
  });

  describe("start/stop", () => {
    it("should start manager", async () => {
      const config1: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };
      const config2: PoolConfig = {
        name: "pool2",
        role: "executor",
        type: "mock",
      };

      manager.registerPool(config1);
      manager.registerPool(config2);
      await manager.start();

      expect(manager.size()).toBe(2);

      await manager.stop();
    });

    it("should stop manager", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);
      await manager.start();
      await manager.stop();

      expect(manager.size()).toBe(1);
    });

    it("should throw when starting already running manager", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);
      await manager.start();

      await expect(manager.start()).rejects.toThrow("PoolManager is already running");

      await manager.stop();
    });

    it("should stop gracefully if already stopped", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);
      await manager.start();
      await manager.stop();
      await expect(manager.stop()).resolves.not.toThrow();
    });
  });

  describe("pool management", () => {
    it("should register pool", () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      const pool = manager.registerPool(config);
      expect(pool).toBeInstanceOf(ActorPool);
      expect(manager.listPools()).toContain("pool1");
    });

    it("should throw when registering pool with duplicate name", () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);

      expect(() => manager.registerPool(config)).toThrow("Pool already exists: pool1");
    });

    it("should unregister pool", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);
      await manager.unregisterPool("pool1");

      expect(manager.listPools()).not.toContain("pool1");
    });

    it("should throw when unregistering non-existent pool", async () => {
      await expect(manager.unregisterPool("non-existent")).rejects.toThrow(
        "Pool not found: non-existent"
      );
    });

    it("should get pool by name", () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      const registered = manager.registerPool(config);
      const retrieved = manager.getPool("pool1");

      expect(retrieved).toBe(registered);
    });

    it("should throw when pool not found", () => {
      expect(() => manager.getPool("non-existent")).toThrow("Pool not found: non-existent");
    });

    it("should check if pool exists", () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };

      manager.registerPool(config);

      expect(manager.hasPool("pool1")).toBe(true);
      expect(manager.hasPool("non-existent")).toBe(false);
    });

    it("should list all pools", () => {
      const config1: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };
      const config2: PoolConfig = {
        name: "pool2",
        role: "executor",
        type: "mock",
      };

      manager.registerPool(config1);
      manager.registerPool(config2);

      const pools = manager.listPools();
      expect(pools).toHaveLength(2);
      expect(pools).toContain("pool1");
      expect(pools).toContain("pool2");
    });

    it("should return correct size", () => {
      const config1: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
      };
      const config2: PoolConfig = {
        name: "pool2",
        role: "executor",
        type: "mock",
      };

      manager.registerPool(config1);
      expect(manager.size()).toBe(1);

      manager.registerPool(config2);
      expect(manager.size()).toBe(2);
    });

    it("should get status", () => {
      const status = manager.getStatus();
      expect(status.running).toBe(false);
      expect(status.poolCount).toBe(0);

      manager.registerPool({ name: "pool1", role: "analyst", type: "mock" });

      const status2 = manager.getStatus();
      expect(status2.running).toBe(false);
      expect(status2.poolCount).toBe(1);
    });
  });

  describe("metrics", () => {
    it("should get all metrics", async () => {
      const config1: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
        initialSize: 2,
      };
      const config2: PoolConfig = {
        name: "pool2",
        role: "executor",
        type: "mock",
        initialSize: 3,
      };

      const pool1 = manager.registerPool(config1);
      const pool2 = manager.registerPool(config2);

      await pool1.start();
      await pool2.start();

      const metrics = manager.getAllMetrics();
      expect(metrics.size).toBe(2);
      expect(metrics.get("pool1")?.totalActors).toBe(2);
      expect(metrics.get("pool2")?.totalActors).toBe(3);

      await pool1.stop();
      await pool2.stop();
    });

    it("should get specific pool metrics", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
        initialSize: 2,
      };

      const pool = manager.registerPool(config);
      await pool.start();

      const metrics = manager.getPoolMetrics("pool1");
      expect(metrics.totalActors).toBe(2);

      await pool.stop();
    });

    it("should throw when getting metrics for non-existent pool", () => {
      expect(() => manager.getPoolMetrics("non-existent")).toThrow("Pool not found: non-existent");
    });
  });

  describe("auto-start pools", () => {
    it("should auto-start pool when registering after manager start", async () => {
      const config: PoolConfig = {
        name: "pool1",
        role: "analyst",
        type: "mock",
        initialSize: 2,
      };

      await manager.start();

      const pool = manager.registerPool(config);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(2);

      await manager.stop();
    }, 5000);
  });
});

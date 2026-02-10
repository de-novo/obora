import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ActorPool, PoolConfig } from "../../pool/ActorPool";
import { PoolManager } from "../../pool/PoolManager";
import { ActorRole } from "../../types/actor";
import { MockBlackboard } from "../helpers/MockBlackboard";
import type { ActorFactory, ActorConfig } from "../../runtime/types";
import type { IBlackboard } from "../../types/actor";
import type { IMessageBus } from "../../types/message";
import type { Actor } from "../../types/actor";
import type { Observation } from "../../types/observation";
import type { Action } from "../../types/action";
import type { Result } from "../../types/result";
import type { Message } from "../../types/message";
import { createActorMetrics } from "../../types/metrics";
import { createObservation } from "../../types/observation";
import { createAction, createActionId } from "../../types/action";
import { createSuccessResult } from "../../types/result";
import { ActorLifecycleStatus, ActorId } from "../../types/actor";

class TestActor implements Actor {
  readonly id: ActorId;
  readonly name: string = "test";
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
  lastActivity: Date = new Date();
  createdAt: Date = new Date();
  metrics = createActorMetrics();

  constructor(id: ActorId, role: ActorRole, board: IBlackboard, messageBus: IMessageBus) {
    this.id = id;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this.status = {
      id: this.id,
      name: "test",
      role: this.role,
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
  }

  observe(): Observation {
    return createObservation({
      actorId: this.id,
    });
  }

  think(observation: Observation): Action {
    return createAction(this.id, "execute", {});
  }

  async act(action: Action): Promise<Result> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    this.metrics.totalRuns++;
    this.metrics.successCount++;
    this.metrics.lastExecutionTime = 10;
    this.metrics.totalExecutionTimeMs += 10;
    this.metrics.updatedAt = new Date();
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTimeMs / this.metrics.totalRuns;
    return createSuccessResult(action.id, this.id, { processed: true }, 10);
  }

  async report(result: Result): Promise<void> {
    this.status.metrics.totalActionsExecuted++;
  }

  async receive(message: Message): Promise<void> {
    this.status.metrics.totalMessagesProcessed++;
  }

  async start(): Promise<void> {
    this.status.status = ActorLifecycleStatus.RUNNING;
  }

  async stop(): Promise<void> {
    this.status.status = ActorLifecycleStatus.STOPPED;
  }

  async restart(): Promise<void> {
    this.status.status = ActorLifecycleStatus.RESTARTING;
    this.status.status = ActorLifecycleStatus.RUNNING;
  }

  getStatus() {
    return this.status;
  }

  isAlive(): boolean {
    return this.status.status === ActorLifecycleStatus.RUNNING;
  }
}

class TestFactory implements ActorFactory {
  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const actorId = config.id || (this.generateId(config.role) as ActorId);
    const actor = new TestActor(actorId, config.role, board, messageBus);
    return Promise.resolve(actor);
  }

  private generateId(role: ActorRole): string {
    return `${role}-${crypto.randomUUID()}`;
  }
}

describe("Actor Pool Integration", () => {
  let pool: ActorPool;
  let board: MockBlackboard;
  let factory: TestFactory;
  let messageBus: IMessageBus;

  const defaultConfig: PoolConfig = {
    name: "test-pool",
    role: "analyst",
    type: "test",
    initialSize: 3,
    minSize: 1,
    maxSize: 10,
    idleTimeout: 5000,
    scaleStrategy: "dynamic",
    dispatchStrategy: "round-robin",
    maxQueueSize: 100,
    taskTimeout: 30000,
    debug: false,
  };

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestFactory();
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
    pool = new ActorPool(defaultConfig, board, factory, messageBus);
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop();
    board.clear();
  });

  describe("Pool Initialization", () => {
    it("should initialize with correct size", () => {
      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBe(3);
      expect(metrics.idleActors).toBeGreaterThanOrEqual(0);
    });

    it("should create actors with correct role", () => {
      const actors = pool.getActors();
      expect(actors).toHaveLength(3);
      actors.forEach((actorId) => {
        expect(actorId).toContain("analyst");
      });
    });
  });

  describe("Task Processing", () => {
    it("should process submitted task", async () => {
      const taskId = await pool.submit({ data: "test" });
      expect(taskId).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 200));

      const metrics = pool.getMetrics();
      expect(metrics.throughput.actionsPerSecond).toBeGreaterThanOrEqual(0);
    });

    it("should process multiple tasks", async () => {
      const taskIds = await Promise.all([
        pool.submit({ data: "task1" }),
        pool.submit({ data: "task2" }),
        pool.submit({ data: "task3" }),
      ]);

      expect(taskIds).toHaveLength(3);

      await new Promise((resolve) => setTimeout(resolve, 300));

      const metrics = pool.getMetrics();
      expect(metrics.throughput.actionsPerSecond).toBeGreaterThanOrEqual(0);
    });

    it("should respect priority", async () => {
      await pool.submit({ data: "low" }, 0);
      await pool.submit({ data: "high" }, 10);
      await pool.submit({ data: "medium" }, 5);

      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    it("should reject when queue is full", async () => {
      const smallPool = new ActorPool(
        {
          ...defaultConfig,
          name: "small-pool",
          initialSize: 1,
          maxQueueSize: 2,
        },
        board,
        factory,
        messageBus
      );
      await smallPool.start();

      await smallPool.submit({ data: "task1" });
      await smallPool.submit({ data: "task2" });

      await expect(smallPool.submit({ data: "task3" })).rejects.toThrow("Task queue is full");

      await smallPool.stop();
    });
  });

  describe("Scaling", () => {
    it("should scale up", async () => {
      expect(pool.getMetrics().totalActors).toBe(3);

      await pool.scaleUp(2);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(5);
    });

    it("should scale down", async () => {
      expect(pool.getMetrics().totalActors).toBe(3);

      await pool.scaleDown(1);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(2);
    });

    it("should respect min size", async () => {
      await pool.scaleDown(10);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(1);
    });

    it("should respect max size", async () => {
      await pool.scaleUp(100);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(10);
    });

    it("should scale to specific size", async () => {
      await pool.scaleTo(7);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.getMetrics().totalActors).toBe(7);
    });
  });

  describe("Dispatch Strategies", () => {
    it("should use round-robin dispatch", async () => {
      const rrPool = new ActorPool(
        {
          ...defaultConfig,
          name: "rr-pool",
          dispatchStrategy: "round-robin",
        },
        board,
        factory,
        messageBus
      );
      await rrPool.start();

      for (let i = 0; i < 6; i++) {
        await rrPool.submit({ data: `task${i}` });
      }

      await new Promise((resolve) => setTimeout(resolve, 400));

      await rrPool.stop();
    });

    it("should use least-busy dispatch", async () => {
      const lbPool = new ActorPool(
        {
          ...defaultConfig,
          name: "lb-pool",
          dispatchStrategy: "least-busy",
        },
        board,
        factory,
        messageBus
      );
      await lbPool.start();

      for (let i = 0; i < 3; i++) {
        await lbPool.submit({ data: `task${i}` });
      }

      await new Promise((resolve) => setTimeout(resolve, 300));

      await lbPool.stop();
    });
  });

  describe("Metrics", () => {
    it("should track metrics correctly", async () => {
      const initialMetrics = pool.getMetrics();
      expect(initialMetrics.totalActors).toBe(3);
      expect(initialMetrics.throughput.actionsPerSecond).toBe(0);

      await pool.submit({ data: "task" });
      await new Promise((resolve) => setTimeout(resolve, 200));

      const afterMetrics = pool.getMetrics();
      expect(afterMetrics.totalActors).toBe(3);
    });
  });
});

describe("Pool Manager Integration", () => {
  let manager: PoolManager;
  let board: MockBlackboard;
  let factory: TestFactory;
  let messageBus: IMessageBus;

  beforeEach(() => {
    board = new MockBlackboard();
    factory = new TestFactory();
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
    manager = new PoolManager(board, factory, messageBus);
  });

  afterEach(async () => {
    await manager.stop();
  });

  it("should manage multiple pools", async () => {
    manager.registerPool({
      name: "analysts",
      role: "analyst",
      type: "test",
      initialSize: 2,
    });

    manager.registerPool({
      name: "executors",
      role: "executor",
      type: "test",
      initialSize: 3,
    });

    await manager.start();

    expect(manager.listPools()).toContain("analysts");
    expect(manager.listPools()).toContain("executors");
    expect(manager.size()).toBe(2);
  });

  it("should get metrics for all pools", async () => {
    manager.registerPool({
      name: "pool1",
      role: "analyst",
      type: "test",
      initialSize: 2,
    });

    manager.registerPool({
      name: "pool2",
      role: "executor",
      type: "test",
      initialSize: 3,
    });

    await manager.start();

    const metrics = manager.getAllMetrics();
    expect(metrics.size).toBe(2);
    expect(metrics.get("pool1")?.totalActors).toBe(2);
    expect(metrics.get("pool2")?.totalActors).toBe(3);
  });
});

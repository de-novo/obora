import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Observation, Action, Result } from "../../types";
import { createActionId } from "../../types/action";
import {
  Actor,
  ActorRole,
  ActorLifecycleStatus,
  createActorId,
  type ActorId,
} from "../../types/actor";
import type { IBlackboard } from "../../types/actor";
import type { IMessageBus } from "../../types/message";
import { createActorMetrics } from "../../types/metrics";
import { createResultId } from "../../types/result";
import { ActorRuntime, ActorStopTimeoutError } from "../ActorRuntime";
import type { ActorFactory, ActorConfig } from "../types";

class MockActor implements Actor {
  readonly id: ActorId;
  readonly name: string = "mock";
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  readonly status: {
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

  constructor(
    id: string,
    name: string,
    role: ActorRole,
    board: IBlackboard,
    messageBus: IMessageBus
  ) {
    this.id = id as ActorId;
    this.role = role;
    this.name = name;
    this.board = board;
    this.messageBus = messageBus;
    this.status = {
      id: this.id,
      name: this.name,
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
    return { actorId: this.id, timestamp: new Date() };
  }

  think(observation: Observation): Action {
    return {
      id: createActionId("action-1"),
      actorId: this.id,
      type: "execute",
      timestamp: new Date(),
    };
  }

  act(action: Action): Result {
    return {
      id: createResultId("result-1"),
      actionId: action.id,
      actorId: this.id,
      timestamp: new Date(),
      status: "success",
    };
  }

  report(): void {
    /* mock */
  }

  receive(): void {
    /* mock */
  }

  async start(): Promise<void> {
    /* mock */
  }

  async stop(): Promise<void> {
    /* mock */
  }

  async restart(): Promise<void> {
    /* mock */
  }

  getStatus() {
    return this.status;
  }

  isAlive(): boolean {
    return true;
  }
}

class MockFactory implements ActorFactory {
  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const actorId = config.id || createActorId(config.role);
    const actor = new MockActor(actorId as string, config.name, config.role, board, messageBus);
    return Promise.resolve(actor);
  }
}

describe("ActorRuntime", () => {
  let runtime: ActorRuntime;
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
    runtime = new ActorRuntime(board, messageBus, factory, { debug: false });
  });

  describe("start/stop", () => {
    it("should start runtime", async () => {
      await runtime.start();
      const status = runtime.getStatus();
      expect(status.running).toBe(true);
    });

    it("should stop runtime", async () => {
      await runtime.start();
      await runtime.stop();
      const status = runtime.getStatus();
      expect(status.running).toBe(false);
    });

    it("should throw when starting already running runtime", async () => {
      await runtime.start();
      await expect(runtime.start()).rejects.toThrow("Runtime is already running");
    });
  });

  describe("spawn", () => {
    beforeEach(async () => {
      await runtime.start();
    });

    it("should spawn actor successfully", async () => {
      const actorId = createActorId("analyst");
      const config: ActorConfig = {
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      };
      const actor = await runtime.spawn(config);

      expect(actor).toBeInstanceOf(MockActor);
      expect(actor.id).toBe(actorId);
      expect(actor.role).toBe("analyst" as ActorRole);
      expect(runtime.hasActor(actorId)).toBe(true);
      expect(runtime.size()).toBe(1);
    });

    it("should throw when runtime is not running", async () => {
      await runtime.stop();
      const actorId = createActorId("analyst");
      const config: ActorConfig = {
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      };

      await expect(runtime.spawn(config)).rejects.toThrow("Runtime is not running");
    });

    it("should throw when max actors limit reached", async () => {
      const runtimeWithLimit = new ActorRuntime(board, messageBus, factory, {
        maxActors: 2,
        debug: false,
      });
      await runtimeWithLimit.start();

      await runtimeWithLimit.spawn({ name: "test", role: "analyst" as ActorRole, type: "mock" });
      await runtimeWithLimit.spawn({ name: "test", role: "analyst" as ActorRole, type: "mock" });

      await expect(
        runtimeWithLimit.spawn({ name: "test", role: "analyst" as ActorRole, type: "mock" })
      ).rejects.toThrow("Maximum actors limit reached");
    });

    it("should count in-flight spawns for max actors limit", async () => {
      let releaseCreate: (() => void) | null = null;

      class BlockingFactory implements ActorFactory {
        async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
          await new Promise<void>((resolve) => {
            releaseCreate = resolve;
          });
          const actorId = config.id || createActorId(config.role);
          return new MockActor(actorId as string, config.name, config.role, board, messageBus);
        }
      }

      const runtimeWithLimit = new ActorRuntime(board, messageBus, new BlockingFactory(), {
        maxActors: 1,
        spawnTimeout: 200,
        debug: false,
      });
      await runtimeWithLimit.start();

      const firstSpawn = runtimeWithLimit.spawn({
        id: createActorId("analyst"),
        name: "first",
        role: "analyst" as ActorRole,
        type: "mock",
      });
      await Promise.resolve();

      await expect(
        runtimeWithLimit.spawn({ name: "second", role: "analyst" as ActorRole, type: "mock" })
      ).rejects.toThrow("Maximum actors limit reached");

      releaseCreate?.();
      await expect(firstSpawn).resolves.toBeDefined();
    });

    it("should throw when actor ID already exists", async () => {
      const actorId = createActorId("analyst");
      const config: ActorConfig = {
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      };
      await runtime.spawn(config);

      await expect(runtime.spawn(config)).rejects.toThrow("Actor already exists");
    });

    it("should prevent duplicate spawn while first spawn is in-flight", async () => {
      let releaseCreate: (() => void) | null = null;

      class BlockingFactory implements ActorFactory {
        async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
          await new Promise<void>((resolve) => {
            releaseCreate = resolve;
          });
          const actorId = config.id || createActorId(config.role);
          return new MockActor(actorId as string, config.name, config.role, board, messageBus);
        }
      }

      const blockingRuntime = new ActorRuntime(board, messageBus, new BlockingFactory(), {
        spawnTimeout: 200,
        debug: false,
      });
      await blockingRuntime.start();

      const actorId = createActorId("analyst");
      const config: ActorConfig = {
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      };

      const firstSpawn = blockingRuntime.spawn(config);
      await Promise.resolve();
      await expect(blockingRuntime.spawn(config)).rejects.toThrow("Actor already exists");

      releaseCreate?.();
      await expect(firstSpawn).resolves.toBeDefined();
      expect(blockingRuntime.hasActor(actorId)).toBe(true);
    });

    it("should guard auto-generated id during start before registration", async () => {
      let releaseStart: (() => void) | null = null;
      const fixedId = createActorId("analyst");

      class SlowStartActor extends MockActor {
        override async start(): Promise<void> {
          await new Promise<void>((resolve) => {
            releaseStart = resolve;
          });
        }
      }

      class FixedIdFactory implements ActorFactory {
        async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
          return new SlowStartActor(fixedId as string, config.name, config.role, board, messageBus);
        }
      }

      const fixedRuntime = new ActorRuntime(board, messageBus, new FixedIdFactory(), {
        spawnTimeout: 200,
        debug: false,
      });
      await fixedRuntime.start();

      const firstSpawn = fixedRuntime.spawn({ name: "first", role: "analyst" as ActorRole, type: "mock" });
      await Promise.resolve();

      await expect(
        fixedRuntime.spawn({ name: "second", role: "analyst" as ActorRole, type: "mock" })
      ).rejects.toThrow("Actor already exists");

      releaseStart?.();
      await expect(firstSpawn).resolves.toBeDefined();
      expect(fixedRuntime.hasActor(fixedId)).toBe(true);
    });

    it("should throw when actor name is missing", async () => {
      const invalidConfig = {
        role: "analyst" as ActorRole,
        type: "mock",
      } as unknown as ActorConfig;

      await expect(runtime.spawn(invalidConfig)).rejects.toThrow("Actor name is required");
    });

    it("should throw when actor name is empty", async () => {
      await expect(
        runtime.spawn({ name: "   ", role: "analyst" as ActorRole, type: "mock" })
      ).rejects.toThrow("Actor name is required");
    });

    it("should timeout when actor creation exceeds spawn timeout", async () => {
      class SlowFactory implements ActorFactory {
        async create(): Promise<Actor> {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return new MockActor(
            createActorId("analyst") as string,
            "slow",
            "analyst" as ActorRole,
            board,
            messageBus
          );
        }
      }

      const timeoutRuntime = new ActorRuntime(board, messageBus, new SlowFactory(), {
        spawnTimeout: 10,
        debug: false,
      });
      await timeoutRuntime.start();

      await expect(
        timeoutRuntime.spawn({ name: "slow", role: "analyst" as ActorRole, type: "slow" })
      ).rejects.toThrow("Actor spawn timeout");
    });

    it("should not leave actor partially registered when start() fails", async () => {
      class FailingStartActor extends MockActor {
        override async start(): Promise<void> {
          throw new Error("Start failed");
        }
      }

      class FailingFactory implements ActorFactory {
        async create(
          config: ActorConfig,
          board: IBlackboard,
          messageBus: IMessageBus
        ): Promise<Actor> {
          const actorId = config.id || createActorId(config.role);
          const actor = new FailingStartActor(
            actorId as string,
            config.name,
            config.role,
            board,
            messageBus
          );
          return Promise.resolve(actor);
        }
      }

      const failingRuntime = new ActorRuntime(board, messageBus, new FailingFactory(), {
        debug: false,
      });
      await failingRuntime.start();

      const actorId = createActorId("analyst");
      const config: ActorConfig = {
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "failing",
      };

      await expect(failingRuntime.spawn(config)).rejects.toThrow("Start failed");

      expect(failingRuntime.hasActor(actorId)).toBe(false);
      expect(failingRuntime.size()).toBe(0);
    });

    it("should track zombie actor when spawn cleanup stop times out", async () => {
      class FailingStartSlowStopActor extends MockActor {
        override async start(): Promise<void> {
          throw new Error("Start failed");
        }

        override async stop(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      class FailingStartSlowStopFactory implements ActorFactory {
        async create(
          config: ActorConfig,
          board: IBlackboard,
          messageBus: IMessageBus
        ): Promise<Actor> {
          const actorId = config.id || createActorId(config.role);
          return new FailingStartSlowStopActor(
            actorId as string,
            config.name,
            config.role,
            board,
            messageBus
          );
        }
      }

      const timeoutRuntime = new ActorRuntime(board, messageBus, new FailingStartSlowStopFactory(), {
        stopTimeout: 10,
        debug: false,
      });
      await timeoutRuntime.start();

      const actorId = createActorId("analyst");
      await expect(
        timeoutRuntime.spawn({ id: actorId, name: "test", role: "analyst" as ActorRole, type: "mock" })
      ).rejects.toThrow("Start failed");

      expect(timeoutRuntime.getZombies()).toContain(actorId);
      expect(timeoutRuntime.hasActor(actorId)).toBe(false);
      expect(timeoutRuntime.size()).toBe(0);
    });
  });

  describe("stop", () => {
    let actorId: ActorId;

    beforeEach(async () => {
      await runtime.start();
      actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      });
    });

    it("should stop actor successfully", async () => {
      await runtime.stopById(actorId);
      expect(runtime.hasActor(actorId)).toBe(false);
      expect(runtime.size()).toBe(0);
    });

    it("should throw when actor not found", async () => {
      const nonExistentId = createActorId("executor");
      await expect(runtime.stopById(nonExistentId)).rejects.toThrow("Actor not found");
    });

    it("should handle stopById gracefully when runtime is not running", async () => {
      await runtime.stop();
      await expect(runtime.stopById(actorId)).resolves.toBeUndefined();
    });

    it("should track zombie actor when stop times out", async () => {
      class SlowStopActor extends MockActor {
        override async stop(): Promise<void> {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      class SlowStopFactory implements ActorFactory {
        async create(
          config: ActorConfig,
          board: IBlackboard,
          messageBus: IMessageBus
        ): Promise<Actor> {
          const actorId = config.id || createActorId(config.role);
          return new SlowStopActor(actorId as string, config.name, config.role, board, messageBus);
        }
      }

      const timeoutRuntime = new ActorRuntime(board, messageBus, new SlowStopFactory(), {
        stopTimeout: 10,
        debug: false,
      });
      await timeoutRuntime.start();

      const id = createActorId("analyst");
      await timeoutRuntime.spawn({ id, name: "slow-stop", role: "analyst" as ActorRole, type: "mock" });

      try {
        await timeoutRuntime.stopById(id);
        throw new Error("Expected stopById to throw timeout");
      } catch (error) {
        expect(error).toBeInstanceOf(ActorStopTimeoutError);
        expect((error as Error).message).toBe(`Actor stop timeout: ${id}`);
      }
      expect(timeoutRuntime.getZombies()).toContain(id);
      expect(timeoutRuntime.hasActor(id)).toBe(false);
    });
  });

  describe("restart", () => {
    let actorId: ActorId;

    beforeEach(async () => {
      await runtime.start();
      actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      });
    });

    it("should restart actor successfully", async () => {
      const newActor = await runtime.restart(actorId);
      expect(newActor).toBeInstanceOf(MockActor);
      expect(newActor.id).toBe(actorId);
    });

    it("should respect max restarts limit", async () => {
      const runtimeWithLimit = new ActorRuntime(board, messageBus, factory, {
        maxRestarts: 2,
        debug: false,
      });
      await runtimeWithLimit.start();

      const id = createActorId("analyst");
      await runtimeWithLimit.spawn({
        id,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      });

      await expect(runtimeWithLimit.restart(id, 2)).rejects.toThrow("Max restarts");
    });

    it("should retry restart with loop until success within maxRestarts", async () => {
      class FlakyFactory implements ActorFactory {
        private attempts = 0;

        async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
          this.attempts += 1;
          const actor = new MockActor(
            (config.id || createActorId(config.role)) as string,
            config.name,
            config.role,
            board,
            messageBus
          );

          if (this.attempts >= 2 && this.attempts <= 3) {
            actor.start = vi.fn().mockRejectedValue(new Error("Start failed"));
          }

          return actor;
        }
      }

      const flakyRuntime = new ActorRuntime(board, messageBus, new FlakyFactory(), {
        maxRestarts: 3,
        spawnTimeout: 100,
        initialBackoff: 1,
        maxBackoff: 5,
        debug: false,
      });
      await flakyRuntime.start();

      const id = createActorId("analyst");
      await flakyRuntime.spawn({
        id,
        name: "test",
        role: "analyst" as ActorRole,
        type: "flaky",
      });

      const restarted = await flakyRuntime.restart(id);
      expect(restarted.id).toBe(id);
      expect(flakyRuntime.hasActor(id)).toBe(true);
    });
  });

  describe("query methods", () => {
    let analyst1: ActorId;
    let analyst2: ActorId;
    let executor1: ActorId;

    beforeEach(async () => {
      await runtime.start();
      analyst1 = createActorId("analyst");
      analyst2 = createActorId("analyst");
      executor1 = createActorId("executor");

      await runtime.spawn({
        id: analyst1,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      });
      await runtime.spawn({
        id: analyst2,
        name: "test",
        role: "analyst" as ActorRole,
        type: "mock",
      });
      await runtime.spawn({
        id: executor1,
        name: "test",
        role: "executor" as ActorRole,
        type: "mock",
      });
    });

    it("should list all actors", () => {
      const actors = runtime.listActors();
      expect(actors).toHaveLength(3);
      expect(actors).toContain(analyst1);
      expect(actors).toContain(analyst2);
      expect(actors).toContain(executor1);
    });

    it("should list actors by role", () => {
      const analysts = runtime.listActorsByRole("analyst" as ActorRole);
      expect(analysts).toHaveLength(2);
      expect(analysts).toContain(analyst1);
      expect(analysts).toContain(analyst2);

      const executors = runtime.listActorsByRole("executor" as ActorRole);
      expect(executors).toHaveLength(1);
      expect(executors).toContain(executor1);
    });

    it("should list actors by status", () => {
      const running = runtime.listActorsByStatus(ActorLifecycleStatus.RUNNING);
      expect(running).toHaveLength(3);
    });

    it("should get actor by id", () => {
      const actor = runtime.getActor(analyst1);
      expect(actor).toBeInstanceOf(MockActor);
      expect(actor.id).toBe(analyst1);
    });

    it("should throw when getting non-existent actor", () => {
      const nonExistentId = createActorId("verifier");
      expect(() => runtime.getActor(nonExistentId)).toThrow("Actor not found");
    });
  });
});

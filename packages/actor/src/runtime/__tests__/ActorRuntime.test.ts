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
import { ActorRuntime } from "../ActorRuntime";
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
      await runtime.stop(actorId);
      expect(runtime.hasActor(actorId)).toBe(false);
      expect(runtime.size()).toBe(0);
    });

    it("should throw when actor not found", async () => {
      const nonExistentId = createActorId("executor");
      await expect(runtime.stop(nonExistentId)).rejects.toThrow("Actor not found");
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

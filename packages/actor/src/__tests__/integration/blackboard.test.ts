import { describe, it, expect, beforeEach, vi } from "vitest";
import { ActorRuntime } from "../../runtime/ActorRuntime";
import { ActorPool } from "../../pool/ActorPool";
import { ActorRole } from "../../types/actor";
import { MockBlackboard } from "../helpers/MockBlackboard";
import { createActorId, type ActorId } from "../../types/actor";
import type { Observation } from "../../types/observation";
import type { ActorFactory, ActorConfig } from "../../runtime/types";
import type { IBlackboard } from "../../types/blackboard";
import type { IMessageBus } from "../../types/message";
import type { Actor } from "../../types/actor";
import type { Action, ActionType } from "../../types/action";
import type { Result } from "../../types/result";
import { createAction } from "../../types/action";
import { createSuccessResult } from "../../types/result";

class MockActor implements Actor {
  readonly id: string;
  readonly name: string = "mock";
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  status: {
    id: string;
    name: string;
    role: ActorRole;
    status: string;
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
  metrics = {
    totalRuns: 0,
    successCount: 0,
    failureCount: 0,
    averageExecutionTime: 0,
    lastExecutionTime: 0,
  };

  constructor(id: string, role: ActorRole, board: IBlackboard, messageBus: IMessageBus) {
    this.id = id;
    this.role = role;
    this.board = board;
    this.messageBus = messageBus;
    this.status = {
      id: this.id,
      name: "mock",
      role: this.role,
      status: "running",
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

  async observe() {
    const data = this.board.read("state");
    return {
      actorId: this.id as ActorId,
      timestamp: new Date(),
      data,
      source: "read",
      latency: 5,
    };
  }

  think(obs: Observation): Action {
    return createAction(this.id as ActorId, "analyze" as ActionType, {
      section: "results",
      data: { processed: obs.state?.context },
    });
  }

  async act(action: Action): Promise<Result> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const params = action.params as Record<string, unknown>;
    if (params?.section && params?.data) {
      this.board.write(params.section as string, params.data);
    }
    return createSuccessResult(action.id, this.id as ActorId, { written: true }, 10);
  }

  async report(): Promise<void> {}

  async receive(): Promise<void> {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async restart(): Promise<void> {}

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
    const actor = new MockActor(actorId as string, config.role, board, messageBus);
    return Promise.resolve(actor);
  }
}

describe("Blackboard Integration", () => {
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: MockFactory;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new MockFactory();
    const messageBus = {
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
    runtime = new ActorRuntime(board, messageBus, factory);
    await runtime.start();
  });

  afterEach(async () => {
    await runtime.stop();
    board.clear();
  });

  describe("Actor-Blackboard Communication", () => {
    it("should read state from blackboard", async () => {
      board.setData("state", {
        context: { task: "analyze" },
        agents: [],
      });

      const actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "test",
        role: "analyst",
        type: "mock",
      });

      const actor = runtime.getActor(actorId) as MockActor;
      const observation = await actor.observe();
      expect(observation.data).toEqual({
        context: { task: "analyze" },
        agents: [],
      });
    });

    it("should write results to blackboard", async () => {
      const actorId = createActorId("executor");
      await runtime.spawn({
        id: actorId,
        name: "test",
        role: "executor",
        type: "mock",
      });

      const actor = runtime.getActor(actorId) as MockActor;
      const obs = await actor.observe();
      const action = actor.think(obs);
      await actor.act(action);

      const results = board.getData("results");
      expect(results).toBeDefined();
    });

    it("should handle concurrent writes", async () => {
      const actorId1 = createActorId("analyst-1");
      const actorId2 = createActorId("analyst-2");
      const actorId3 = createActorId("analyst-3");

      await runtime.spawn({
        id: actorId1,
        name: "test",
        role: "analyst",
        type: "mock",
      });
      await runtime.spawn({
        id: actorId2,
        name: "test",
        role: "analyst",
        type: "mock",
      });
      await runtime.spawn({
        id: actorId3,
        name: "test",
        role: "analyst",
        type: "mock",
      });

      const actor1 = runtime.getActor(actorId1) as MockActor;
      const actor2 = runtime.getActor(actorId2) as MockActor;
      const actor3 = runtime.getActor(actorId3) as MockActor;

      await Promise.all([
        actor1.observe().then((obs) => actor1.act(actor1.think(obs))),
        actor2.observe().then((obs) => actor2.act(actor2.think(obs))),
        actor3.observe().then((obs) => actor3.act(actor3.think(obs))),
      ]);

      expect(board.getData("results")).toBeDefined();
    });
  });

  describe("Blackboard Operations", () => {
    it("should write and read data from blackboard", () => {
      board.write("state", { updated: true });
      expect(board.read("state")).toEqual({ updated: true });
    });

    it("should delete data from blackboard", () => {
      board.write("state", { data: "test" });
      board.delete("state");
      expect(board.read("state")).toBeUndefined();
    });

    it("should list keys", () => {
      board.write("state", { data: "test" });
      board.write("results", { data: "test" });
      expect(board.keys()).toEqual(expect.arrayContaining(["state", "results"]));
    });
  });

  describe("Event Subscription", () => {
    it("should receive blackboard events", async () => {
      const eventHandler = vi.fn();
      board.subscribe("state.updated", eventHandler);

      board.write("state", { updated: true });

      expect(eventHandler).toHaveBeenCalledWith({ updated: true });
    });

    it("should unsubscribe from events", async () => {
      const eventHandler = vi.fn();
      const unsubscribe = board.subscribe("state.updated", eventHandler);

      board.write("state", { first: true });
      expect(eventHandler).toHaveBeenCalledTimes(1);

      unsubscribe();

      board.write("state", { second: true });
      expect(eventHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe("Pool-Blackboard Integration", () => {
    it("should process tasks using blackboard data", async () => {
      board.setData("state", { input: "process-me" });

      const messageBus = {
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

      const pool = new ActorPool(
        {
          name: "processors",
          role: "executor",
          type: "mock",
          initialSize: 2,
          minSize: 1,
          maxSize: 10,
          idleTimeout: 5000,
          scaleStrategy: "dynamic",
          dispatchStrategy: "round-robin",
          maxQueueSize: 100,
          taskTimeout: 30000,
          debug: false,
        },
        board,
        factory,
        messageBus
      );

      await pool.start();
      await pool.submit({ data: "task" });

      await new Promise((resolve) => setTimeout(resolve, 100));

      const metrics = pool.getMetrics();
      expect(metrics.totalActors).toBeGreaterThan(0);

      await pool.stop();
    });
  });
});

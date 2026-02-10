import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ActorRuntime } from "../../runtime/ActorRuntime";
import { ActorRole, ActorLifecycleStatus, ActorStatus, ActorId } from "../../types/actor";
import { createActorMetrics } from "../../types/metrics";
import { createObservation } from "../../types/observation";
import { createAction, createActionId } from "../../types/action";
import { createSuccessResult } from "../../types/result";
import { MockBlackboard } from "../helpers/MockBlackboard";
import { createActorId } from "../../types/actor";
import type { ActorFactory, ActorConfig } from "../../runtime/types";
import type { IBlackboard } from "../../types/actor";
import type { IMessageBus } from "../../types/message";
import type { Actor } from "../../types/actor";
import type { Observation } from "../../types/observation";
import type { Action } from "../../types/action";
import type { Result } from "../../types/result";
import type { Message } from "../../types/message";

class TestActor implements Actor {
  readonly id: ActorId;
  readonly name: string = "test";
  readonly role: ActorRole;
  board: IBlackboard;
  messageBus: IMessageBus;
  status: ActorStatus;
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
      status: ActorLifecycleStatus.CREATED,
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
    const stateData = this.board.read("state") as Record<string, unknown>;
    return createObservation({
      actorId: this.id,
      state: stateData ? { context: stateData, agents: [], tasks: [] } : undefined,
    });
  }

  think(observation: Observation): Action {
    return createAction(this.id, "execute", {
      section: "results",
      data: { processed: observation.state?.context },
    });
  }

  async act(action: Action): Promise<Result> {
    await new Promise((resolve) => setTimeout(resolve, 10));
    const params = action.params as Record<string, unknown>;
    if (params.section && params.data) {
      this.board.write(params.section as string, params.data);
    }
    this.metrics.totalRuns++;
    this.metrics.successCount++;
    this.metrics.lastExecutionTime = 10;
    this.metrics.totalExecutionTimeMs += 10;
    this.metrics.updatedAt = new Date();
    this.metrics.averageExecutionTime = this.metrics.totalExecutionTimeMs / this.metrics.totalRuns;
    return createSuccessResult(action.id, this.id, { written: true }, 10);
  }

  async report(result: Result): Promise<void> {
    this.status.metrics.totalActionsExecuted++;
    if (result.toRecord) {
      this.board.write(result.toRecord.section, result.toRecord.data);
    }
  }

  async receive(message: Message): Promise<void> {
    this.status.metrics.totalMessagesProcessed++;
    this.lastActivity = new Date();
  }

  async start(): Promise<void> {
    this.status.status = ActorLifecycleStatus.RUNNING;
  }

  async stop(): Promise<void> {
    this.status.status = ActorLifecycleStatus.STOPPED;
  }

  async restart(): Promise<void> {
    this.status.status = ActorLifecycleStatus.RESTARTING;
    const oldMetrics = { ...this.metrics };
    this.metrics = createActorMetrics();
    this.metrics.updatedAt = new Date();
    this.status.errorCount = 0;
    this.status.status = ActorLifecycleStatus.RUNNING;
  }

  getStatus(): ActorStatus {
    return this.status;
  }

  isAlive(): boolean {
    return this.status.status === ActorLifecycleStatus.RUNNING;
  }
}

class TestFactory implements ActorFactory {
  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const actorId = config.id || createActorId(config.role);
    const actor = new TestActor(actorId, config.role, board, messageBus);
    return Promise.resolve(actor);
  }
}

describe("Actor Lifecycle Integration", () => {
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: TestFactory;
  let messageBus: IMessageBus;

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
    runtime = new ActorRuntime(board, messageBus, factory, {
      maxActors: 10,
      spawnTimeout: 5000,
      stopTimeout: 5000,
      maxRestarts: 3,
      debug: false,
    });
    await runtime.start();
  });

  afterEach(async () => {
    await runtime.stop();
    board.clear();
  });

  describe("Actor Creation", () => {
    it("should spawn actor with correct properties", async () => {
      const actorId = createActorId("analyst");
      const actor = await runtime.spawn({
        id: actorId,
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      expect(actor.id).toBe(actorId);
      expect(actor.role).toBe("analyst");
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
      expect(runtime.hasActor(actorId)).toBe(true);
    });

    it("should spawn multiple actors", async () => {
      await runtime.spawn({ name: "test1", role: "analyst", type: "test" });
      await runtime.spawn({ name: "test2", role: "executor", type: "test" });
      await runtime.spawn({ name: "test3", role: "verifier", type: "test" });

      expect(runtime.size()).toBe(3);
      expect(runtime.listActorsByRole("analyst")).toHaveLength(1);
      expect(runtime.listActorsByRole("executor")).toHaveLength(1);
      expect(runtime.listActorsByRole("verifier")).toHaveLength(1);
    });

    it("should enforce max actors limit", async () => {
      const limitedRuntime = new ActorRuntime(board, messageBus, factory, {
        maxActors: 2,
      });
      await limitedRuntime.start();

      await limitedRuntime.spawn({ name: "test1", role: "analyst", type: "test" });
      await limitedRuntime.spawn({ name: "test2", role: "analyst", type: "test" });

      await expect(
        limitedRuntime.spawn({ name: "test3", role: "analyst", type: "test" })
      ).rejects.toThrow("Maximum actors limit reached");

      await limitedRuntime.stop();
    });
  });

  describe("Actor Execution Cycle", () => {
    it("should complete observe-think-act-report cycle", async () => {
      board.setData("state", { input: "test-data" });

      const actor = await runtime.spawn({
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      const obs = await actor.observe();
      expect(obs.state?.context).toEqual({ input: "test-data" });

      const action = await actor.think(obs);
      expect(action.type).toBe("execute");

      const result = await actor.act(action);
      expect(result.status).toBe("success");

      await actor.report(result);

      const resultData = board.getData("results");
      expect(resultData).toBeDefined();
    });

    it("should update actor metrics after execution", async () => {
      const actor = await runtime.spawn({
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      const result = await actor.act(action);
      await actor.report(result);

      expect(actor.metrics.totalRuns).toBe(1);
      expect(actor.metrics.successCount).toBe(1);
      expect(actor.metrics.lastExecutionTime).toBeGreaterThan(0);
    });
  });

  describe("Actor Termination", () => {
    it("should stop actor gracefully", async () => {
      const actorId = createActorId("analyst");
      const actor = await runtime.spawn({
        id: actorId,
        name: "actor-to-stop",
        role: "analyst",
        type: "test",
      });

      expect(runtime.hasActor(actorId)).toBe(true);
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);

      await runtime.stop(actorId);

      expect(runtime.hasActor(actorId)).toBe(false);
    });

    it("should stop all actors on runtime shutdown", async () => {
      await runtime.spawn({ name: "test1", role: "analyst", type: "test" });
      await runtime.spawn({ name: "test2", role: "executor", type: "test" });

      expect(runtime.size()).toBe(2);

      await runtime.stop();

      expect(runtime.size()).toBe(0);
    });
  });

  describe("Actor Restart", () => {
    it("should restart actor successfully", async () => {
      const actorId = createActorId("analyst");
      const actor = await runtime.spawn({
        id: actorId,
        name: "actor-to-restart",
        role: "analyst",
        type: "test",
      });

      const originalMetrics = { ...actor.metrics };

      const restartedActor = await runtime.restart(actorId);

      expect(restartedActor.id).toBe(actorId);
      expect(restartedActor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should restart multiple times successfully", async () => {
      const actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "multi-restart",
        role: "analyst",
        type: "test",
      });

      const actor1 = await runtime.restart(actorId);
      expect(actor1.id).toBe(actorId);

      const actor2 = await runtime.restart(actorId);
      expect(actor2.id).toBe(actorId);

      const actor3 = await runtime.restart(actorId);
      expect(actor3.id).toBe(actorId);
    });
  });

  describe("Blackboard Integration", () => {
    it("should read from blackboard during observe", async () => {
      board.setData("state", { key: "value" });

      const actor = await runtime.spawn({
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      const observation = await actor.observe();
      expect(observation.state?.context).toEqual({ key: "value" });
    });

    it("should write to blackboard during act", async () => {
      const actor = await runtime.spawn({
        name: "test-actor",
        role: "executor",
        type: "test",
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      await actor.act(action);

      expect(board.getData("results")).toBeDefined();
    });
  });

  describe("Actor Status Transitions", () => {
    it("should track status transitions", async () => {
      const actorId = createActorId("analyst");
      const actor = await runtime.spawn({
        id: actorId,
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);

      await actor.stop();

      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });

    it("should update metrics after execution", async () => {
      const actorId = createActorId("analyst");
      const actor = await runtime.spawn({
        id: actorId,
        name: "test-actor",
        role: "analyst",
        type: "test",
      });

      const obs = await actor.observe();
      const action = await actor.think(obs);
      const result = await actor.act(action);
      await actor.report(result);

      expect(actor.metrics.totalRuns).toBe(1);
      expect(actor.metrics.successCount).toBe(1);
      expect(actor.metrics.lastExecutionTime).toBeGreaterThan(0);
    });
  });
});

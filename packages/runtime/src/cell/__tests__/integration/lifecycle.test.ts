import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ActorRuntime } from "../../CellManager";
import { ActorRole, ActorLifecycleStatus, ActorId } from "../../actor-types/actor";
import { createActorId } from "../../actor-types/actor";
import { MockBlackboard } from "../helpers/MockBlackboard";
import { TestActorFactory } from "../helpers/TestActorFactory";
import type { IMessageBus } from "../../actor-types/message";

describe("Actor Lifecycle Integration", () => {
  let runtime: ActorRuntime;
  let board: MockBlackboard;
  let factory: TestActorFactory;
  let messageBus: IMessageBus;

  beforeEach(async () => {
    board = new MockBlackboard();
    factory = new TestActorFactory();
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
      expect(action.type).toBe("analyze");

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

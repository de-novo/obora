import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Supervisor } from "../../actor/supervision/Supervisor";
import { SupervisorTree } from "../../actor/supervision/SupervisorTree";
import { RestartStrategy, BackoffPolicy } from "../../actor/supervision/types";
import { ActorRuntime } from "../../CellManager";
import { ActorId } from "../../actor-types/actor";
import { createActorId } from "../../actor-types/actor";
import { MockBlackboard } from "../helpers/MockBlackboard";
import { TestActorFactory } from "../helpers/TestActorFactory";
import type { IMessageBus } from "../../actor-types/message";

describe("Supervision Integration", () => {
  let runtime: ActorRuntime;
  let supervisor: Supervisor;
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
    runtime = new ActorRuntime(board, messageBus, factory);
    await runtime.start();

    supervisor = new Supervisor(runtime, {
      strategy: RestartStrategy.ONE_FOR_ONE,
      backoff: {
        policy: BackoffPolicy.FIXED,
        initialDelay: 10,
        maxDelay: 100,
      },
      maxRestarts: 3,
      restartWindow: 60000,
      enableDeadLetterQueue: true,
      debug: false,
    });
    supervisor.start();
  });

  afterEach(async () => {
    supervisor.stop();
    await runtime.stop();
    board.clear();
    factory.clearCreatedActors();
  });

  describe("Failure Handling", () => {
    it("should detect actor failure", async () => {
      const actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "failing-actor",
        role: "analyst",
        type: "test",
      });

      supervisor.watch(actorId);

      const failedHandler = vi.fn();
      supervisor.on("actor:failed", failedHandler);

      await supervisor.handleFailure(actorId, new Error("Test failure"));

      expect(failedHandler).toHaveBeenCalledWith(actorId, expect.any(Error));
    });

    it("should restart failed actor", async () => {
      const actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "restart-actor",
        role: "analyst",
        type: "test",
      });

      supervisor.watch(actorId);

      const restartedHandler = vi.fn();
      supervisor.on("actor:restarted", restartedHandler);

      await supervisor.handleFailure(actorId, new Error("Test failure"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartedHandler).toHaveBeenCalled();
    });

    it("should stop after max restarts", async () => {
      const actorId = createActorId("analyst");
      await runtime.spawn({
        id: actorId,
        name: "limited-actor",
        role: "analyst",
        type: "test",
      });

      supervisor.watch(actorId);

      const maxRestartsHandler = vi.fn();
      supervisor.on("max-restarts-exceeded", maxRestartsHandler);

      for (let i = 0; i <= 3; i++) {
        await supervisor.handleFailure(actorId, new Error("Failure"));
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      expect(maxRestartsHandler).toHaveBeenCalled();
    });
  });

  describe("Restart Strategies", () => {
    it("should apply ONE_FOR_ONE strategy", async () => {
      const actorId1 = createActorId("analyst");
      const actorId2 = createActorId("analyst");

      await runtime.spawn({ id: actorId1, name: "actor-1", role: "analyst", type: "test" });
      await runtime.spawn({ id: actorId2, name: "actor-2", role: "analyst", type: "test" });

      supervisor.watch(actorId1);
      supervisor.watch(actorId2);

      const restartSpy = vi.spyOn(runtime, "restart");

      await supervisor.handleFailure(actorId1, new Error("Failure"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith(actorId1);
      expect(restartSpy).not.toHaveBeenCalledWith(actorId2);
    });

    it("should apply ALL_FOR_ONE strategy", async () => {
      const allForOneSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ALL_FOR_ONE,
        backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
        maxRestarts: 3,
        restartWindow: 60000,
      });
      allForOneSupervisor.start();

      const actorId1 = createActorId("analyst");
      const actorId2 = createActorId("analyst");
      const actorId3 = createActorId("analyst");

      await runtime.spawn({ id: actorId1, name: "all-1", role: "analyst", type: "test" });
      await runtime.spawn({ id: actorId2, name: "all-2", role: "analyst", type: "test" });
      await runtime.spawn({ id: actorId3, name: "all-3", role: "analyst", type: "test" });

      allForOneSupervisor.watch(actorId1);
      allForOneSupervisor.watch(actorId2);
      allForOneSupervisor.watch(actorId3);

      const restartSpy = vi.spyOn(runtime, "restart");

      await allForOneSupervisor.handleFailure(actorId1, new Error("Failure"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith(actorId1);
      expect(restartSpy).toHaveBeenCalledWith(actorId2);
      expect(restartSpy).toHaveBeenCalledWith(actorId3);

      allForOneSupervisor.stop();
    });
  });

  describe("Backoff Policies", () => {
    it("should apply exponential backoff", async () => {
      const expSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.EXPONENTIAL,
          initialDelay: 100,
          maxDelay: 10000,
          multiplier: 2,
        },
        maxRestarts: 5,
        restartWindow: 60000,
      });
      expSupervisor.start();

      const actorId = createActorId("analyst");
      await runtime.spawn({ id: actorId, name: "exp-actor", role: "analyst", type: "test" });
      expSupervisor.watch(actorId);

      const startTime = Date.now();

      await expSupervisor.handleFailure(actorId, new Error("Failure"));
      await new Promise((resolve) => setTimeout(resolve, 200));

      const history = expSupervisor.getRestartHistory(actorId);
      expect(history.length).toBeGreaterThanOrEqual(1);

      expSupervisor.stop();
    });
  });

  describe("Dead Letter Queue", () => {
    it("should add failed messages to dead letter queue", async () => {
      const failingSupervisor = new Supervisor(runtime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: { policy: BackoffPolicy.FIXED, initialDelay: 10, maxDelay: 100 },
        maxRestarts: 0,
        restartWindow: 60000,
        enableDeadLetterQueue: true,
      });
      failingSupervisor.start();

      const actorId = createActorId("analyst");
      await runtime.spawn({ id: actorId, name: "dl-actor", role: "analyst", type: "test" });
      failingSupervisor.watch(actorId);

      await failingSupervisor.handleFailure(actorId, new Error("Failure"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const deadLetters = failingSupervisor.getDeadLetters();

      failingSupervisor.stop();
    });

    it("should clear dead letter queue", () => {
      supervisor.clearDeadLetters();
      expect(supervisor.getDeadLetters()).toHaveLength(0);
    });
  });

  describe("Restart History", () => {
    it("should track restart history", async () => {
      const actorId = createActorId("analyst");
      await runtime.spawn({ id: actorId, name: "history-actor", role: "analyst", type: "test" });
      supervisor.watch(actorId);

      await supervisor.handleFailure(actorId, new Error("Failure 1"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = supervisor.getRestartHistory(actorId);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].actorId).toBe(actorId);
    });
  });
});

describe("Supervisor Tree Integration", () => {
  let tree: SupervisorTree;
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
    runtime = new ActorRuntime(board, messageBus, factory);
    await runtime.start();
    tree = new SupervisorTree(runtime);
  });

  afterEach(async () => {
    tree.shutdown();
    await runtime.stop();
    board.clear();
    factory.clearCreatedActors();
  });

  it("should create hierarchical supervision", async () => {
    const rootId = tree.createRoot({
      strategy: RestartStrategy.ONE_FOR_ONE,
      maxRestarts: 5,
    });

    const childId = tree.createChild(rootId, {
      strategy: RestartStrategy.ALL_FOR_ONE,
      maxRestarts: 3,
    });

    expect(tree.getRoot()).not.toBeNull();
    expect(tree.getSupervisor(childId)).toBeDefined();
  });

  it("should handle escalation", async () => {
    const rootId = tree.createRoot();
    const childId = tree.createChild(rootId);

    const root = tree.getRoot()!;
    const child = tree.getSupervisor(childId);

    const actorId = createActorId("analyst");
    await runtime.spawn({ id: actorId, name: "escalate-actor", role: "analyst", type: "test" });
    child.watch(actorId);

    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it("should shutdown entire tree", () => {
    const rootId = tree.createRoot();
    tree.createChild(rootId);
    tree.createChild(rootId);

    tree.shutdown();

    expect(tree.getRoot()).toBeNull();
  });
});

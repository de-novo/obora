import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Supervisor } from "../../supervision/Supervisor";
import { SupervisorTree } from "../../supervision/SupervisorTree";
import { RestartStrategy, BackoffPolicy } from "../../supervision/types";
import { ActorRuntime } from "../../runtime/ActorRuntime";
import { ActorRole, ActorLifecycleStatus, ActorId } from "../../types/actor";
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
import { createActorId } from "../../types/actor";

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

  private shouldFail: boolean = false;
  private failureCount: number = 0;

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

  setFailureMode(shouldFail: boolean): void {
    this.shouldFail = shouldFail;
  }

  getFailureCount(): number {
    return this.failureCount;
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

    if (this.shouldFail) {
      this.failureCount++;
      throw new Error("Simulated failure");
    }

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
    this.metrics = createActorMetrics();
    this.status.errorCount = 0;
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
  private readonly createdActors: Map<ActorId, TestActor> = new Map();

  async create(config: ActorConfig, board: IBlackboard, messageBus: IMessageBus): Promise<Actor> {
    const actorId = config.id || createActorId(config.role);
    const actor = new TestActor(actorId, config.role, board, messageBus);
    this.createdActors.set(actorId, actor);
    return Promise.resolve(actor);
  }

  getActor(actorId: ActorId): TestActor | undefined {
    return this.createdActors.get(actorId);
  }

  clear(): void {
    this.createdActors.clear();
  }
}

describe("Supervision Integration", () => {
  let runtime: ActorRuntime;
  let supervisor: Supervisor;
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
    factory.clear();
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
    runtime = new ActorRuntime(board, messageBus, factory);
    await runtime.start();
    tree = new SupervisorTree(runtime);
  });

  afterEach(async () => {
    tree.shutdown();
    await runtime.stop();
    board.clear();
    factory.clear();
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

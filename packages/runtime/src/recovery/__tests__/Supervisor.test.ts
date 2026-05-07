import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import type { ActorRuntime } from "../../cell/actor/runtime/ActorRuntime";
import { ActorLifecycleStatus } from "../../cell/actor/types/actor";
import { Supervisor } from "../../cell/actor/supervision/Supervisor";
import { RestartStrategy, BackoffPolicy, RestartDirective } from "../../cell/actor/supervision/types";
import { actorId } from "../../cell/__tests__/helpers/ids";

// Mock ActorRuntime
class MockRuntime {
  actors: Map<string, unknown> = new Map();

  getActor(id: string) {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Actor not found: ${id}`);
    return actor;
  }

  async restart(id: string) {
    const actor = this.actors.get(id);
    if (!actor) throw new Error(`Actor not found: ${id}`);
    return actor;
  }

  async stop(id: string) {
    this.actors.delete(id);
  }

  addMockActor(id: string) {
    this.actors.set(id, {
      id: actorId(id),
      role: "analyst",
      status: ActorLifecycleStatus.RUNNING,
    });
  }
}

interface SupervisorHarness {
  restartRest(actorId: ReturnType<typeof actorId>): Promise<void>;
  recordHistory(actorId: ReturnType<typeof actorId>, error: Error, attempt: number, success: boolean): void;
  addDeadLetter(actorId: ReturnType<typeof actorId>, error: Error, retryCount: number): void;
}

describe("Supervisor", () => {
  let supervisor: Supervisor;
  let runtime: MockRuntime;

  beforeEach(() => {
    runtime = new MockRuntime();
    runtime.addMockActor("actor-1");
    runtime.addMockActor("actor-2");
    runtime.addMockActor("actor-3");

    supervisor = new Supervisor(runtime as unknown as ActorRuntime, {
      strategy: RestartStrategy.ONE_FOR_ONE,
      backoff: {
        policy: BackoffPolicy.FIXED,
        initialDelay: 10, // 빠른 테스트를 위해 짧게
        maxDelay: 100,
      },
      maxRestarts: 3,
      restartWindow: 60000,
      debug: false,
    });
  });

  describe("start/stop", () => {
    it("should start supervisor", () => {
      supervisor.start();
      expect(supervisor.getWatchedActors()).toHaveLength(0);
    });

    it("should stop supervisor", () => {
      supervisor.start();
      supervisor.watch(actorId("actor-1"));
      supervisor.stop();
      expect(supervisor.getWatchedActors()).toHaveLength(0);
    });

    it("should emit debug logs when enabled", () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
      const debugSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        debug: true,
      });

      debugSupervisor.start();
      debugSupervisor.stop();

      expect(logSpy).toHaveBeenCalledWith("[Supervisor] Supervisor started");
      expect(logSpy).toHaveBeenCalledWith("[Supervisor] Supervisor stopped");
      logSpy.mockRestore();
    });

    it("should ignore stop and failure handling when not running or unwatched", async () => {
      const failedHandler = vi.fn();
      supervisor.on("actor:failed", failedHandler);

      supervisor.stop();
      await supervisor.handleFailure(actorId("actor-1"), new Error("ignored"));

      supervisor.start();
      await supervisor.handleFailure(actorId("actor-2"), new Error("unwatched"));

      expect(failedHandler).not.toHaveBeenCalled();
      expect(supervisor.getRestartHistory()).toEqual([]);
    });

    it("should throw when starting already running supervisor", () => {
      supervisor.start();
      expect(() => supervisor.start()).toThrow("already running");
    });
  });

  describe("watch/unwatch", () => {
    beforeEach(() => {
      supervisor.start();
    });

    it("should watch actor", () => {
      supervisor.watch(actorId("actor-1"));
      expect(supervisor.getWatchedActors()).toContain(actorId("actor-1"));
    });

    it("should unwatch actor", () => {
      supervisor.watch(actorId("actor-1"));
      supervisor.unwatch(actorId("actor-1"));
      expect(supervisor.getWatchedActors()).not.toContain(actorId("actor-1"));
    });

    it("should throw when watching without starting", () => {
      supervisor.stop();
      expect(() => supervisor.watch(actorId("actor-1"))).toThrow("not running");
    });
  });

  describe("handleFailure", () => {
    beforeEach(() => {
      supervisor.start();
      supervisor.watch(actorId("actor-1"));
    });

    it("should emit actor:failed event", async () => {
      const failedHandler = vi.fn();
      supervisor.on("actor:failed", failedHandler);

      await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));

      expect(failedHandler).toHaveBeenCalledWith(actorId("actor-1"), expect.any(Error));
    });

    it("should restart actor on failure", async () => {
      const restartedHandler = vi.fn();
      supervisor.on("actor:restarted", restartedHandler);

      await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));

      // 백오프 대기 후 재시작
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartedHandler).toHaveBeenCalledWith(actorId("actor-1"), 1);
    });

    it("should record restart history", async () => {
      await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      const history = supervisor.getRestartHistory(actorId("actor-1"));
      expect(history).toHaveLength(1);
      expect(history[0].actorId).toBe(actorId("actor-1"));
      expect(history[0].success).toBe(true);
    });
  });

  describe("max restarts", () => {
    beforeEach(() => {
      supervisor.start();
      supervisor.watch(actorId("actor-1"));
    });

    it("should stop after max restarts", async () => {
      const stoppedHandler = vi.fn();
      const maxRestartsHandler = vi.fn();

      supervisor.on("actor:stopped", stoppedHandler);
      supervisor.on("max-restarts-exceeded", maxRestartsHandler);

      // 최대 재시작 횟수 초과
      for (let i = 0; i <= 3; i++) {
        await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      expect(maxRestartsHandler).toHaveBeenCalled();
    });
  });

  describe("restart strategies", () => {
    it("should no-op rest-for-one when failed actor is not in the watch order", async () => {
      supervisor.start();
      supervisor.watch(actorId("actor-1"));

      await expect(
        (supervisor as unknown as SupervisorHarness).restartRest(actorId("missing"))
      ).resolves.toBeUndefined();
    });

    it("should restart only failed actor with ONE_FOR_ONE", async () => {
      supervisor.start();
      supervisor.watch(actorId("actor-1"));
      supervisor.watch(actorId("actor-2"));

      const restartSpy = vi.spyOn(runtime, "restart");

      await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-1"));
      expect(restartSpy).not.toHaveBeenCalledWith(actorId("actor-2"));
    });

    it("should restart all actors with ALL_FOR_ONE", async () => {
      const allForOneSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ALL_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        debug: false,
      });

      allForOneSupervisor.start();
      allForOneSupervisor.watch(actorId("actor-1"));
      allForOneSupervisor.watch(actorId("actor-2"));
      allForOneSupervisor.watch(actorId("actor-3"));

      const restartSpy = vi.spyOn(runtime, "restart");

      await allForOneSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-1"));
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-2"));
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-3"));
    });

    it("should restart failed and subsequent actors with REST_FOR_ONE", async () => {
      const restForOneSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.REST_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        debug: false,
      });

      restForOneSupervisor.start();
      restForOneSupervisor.watch(actorId("actor-1"));
      restForOneSupervisor.watch(actorId("actor-2"));
      restForOneSupervisor.watch(actorId("actor-3"));

      const restartSpy = vi.spyOn(runtime, "restart");

      await restForOneSupervisor.handleFailure(actorId("actor-2"), new Error("Test"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(restartSpy).not.toHaveBeenCalledWith(actorId("actor-1"));
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-2"));
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-3"));
    });
  });

  describe("backoff policies", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it("should use fixed backoff", async () => {
      const fixedSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 100,
          maxDelay: 1000,
        },
        maxRestarts: 3,
        restartWindow: 60000,
      });

      fixedSupervisor.start();
      fixedSupervisor.watch(actorId("actor-1"));
      const restartSpy = vi.spyOn(runtime, "restart");

      const failure = fixedSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));

      await vi.advanceTimersByTimeAsync(99);
      expect(restartSpy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await failure;
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-1"));
    });

    it("should use exponential backoff", async () => {
      const expSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
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
      expSupervisor.watch(actorId("actor-1"));
      const restartSpy = vi.spyOn(runtime, "restart");

      const firstFailure = expSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));
      await vi.advanceTimersByTimeAsync(100);
      await firstFailure;
      expect(restartSpy).toHaveBeenCalledTimes(1);

      const secondFailure = expSupervisor.handleFailure(actorId("actor-1"), new Error("Test 2"));
      await vi.advanceTimersByTimeAsync(199);
      expect(restartSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await secondFailure;
      expect(restartSpy).toHaveBeenCalledTimes(2);

    });

    it("should use linear backoff", async () => {
      const linearSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.LINEAR,
          initialDelay: 100,
          maxDelay: 10000,
        },
        maxRestarts: 5,
        restartWindow: 60000,
      });

      linearSupervisor.start();
      linearSupervisor.watch(actorId("actor-1"));
      const restartSpy = vi.spyOn(runtime, "restart");

      const firstFailure = linearSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));
      await vi.advanceTimersByTimeAsync(100);
      await firstFailure;
      expect(restartSpy).toHaveBeenCalledTimes(1);

      const secondFailure = linearSupervisor.handleFailure(actorId("actor-1"), new Error("Test 2"));
      await vi.advanceTimersByTimeAsync(199);
      expect(restartSpy).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      await secondFailure;
      expect(restartSpy).toHaveBeenCalledTimes(2);

    });

    it("should use exponential jitter backoff", async () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      const jitterSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.EXPONENTIAL_JITTER,
          initialDelay: 100,
          maxDelay: 10000,
          multiplier: 2,
          jitterFactor: 0.1,
        },
        maxRestarts: 5,
        restartWindow: 60000,
      });

      jitterSupervisor.start();
      jitterSupervisor.watch(actorId("actor-1"));
      const restartSpy = vi.spyOn(runtime, "restart");

      const failure = jitterSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));
      await vi.advanceTimersByTimeAsync(99);
      expect(restartSpy).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await failure;
      expect(restartSpy).toHaveBeenCalledWith(actorId("actor-1"));
    });
  });

  describe("dead letter queue", () => {
    it("should bound dead letter queue size", () => {
      const smallQueueSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        enableDeadLetterQueue: true,
        deadLetterQueueSize: 1,
      });
      const harness = smallQueueSupervisor as unknown as SupervisorHarness;

      harness.addDeadLetter(actorId("actor-1"), new Error("first"), 1);
      harness.addDeadLetter(actorId("actor-2"), new Error("second"), 2);

      expect(smallQueueSupervisor.getDeadLetters()).toHaveLength(1);
      expect(smallQueueSupervisor.getDeadLetters()[0].actorId).toBe(actorId("actor-2"));
    });

    it("should retain only the most recent restart history entries", () => {
      const harness = supervisor as unknown as SupervisorHarness;

      for (let attempt = 1; attempt <= 101; attempt++) {
        harness.recordHistory(actorId("actor-1"), new Error(`attempt-${attempt}`), attempt, false);
      }

      const history = supervisor.getRestartHistory(actorId("actor-1"));
      expect(history).toHaveLength(100);
      expect(history[0].attempt).toBe(2);
    });

    it("should add to dead letter queue on restart failure", async () => {
      // 재시작 실패하도록 설정
      runtime.actors.delete("actor-1");

      supervisor.start();
      supervisor.watch(actorId("actor-1"));

      const deadLetterHandler = vi.fn();
      supervisor.on("dead-letter", deadLetterHandler);

      try {
        await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));
      } catch {
        // 예외 무시
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // Dead letter 추가 확인
      const deadLetters = supervisor.getDeadLetters();
      expect(deadLetters.length).toBeGreaterThanOrEqual(1);

      // dead-letter 이벤트 핸들러 호출 확인
      expect(deadLetterHandler).toHaveBeenCalled();

      // dead letter 객체의 핵심 필드 검증
      const firstLetter = deadLetters[0];
      expect(firstLetter.actorId).toBe(actorId("actor-1"));
      expect(firstLetter.error).toBeInstanceOf(Error);
      expect(firstLetter.timestamp).toBeInstanceOf(Date);
      expect(firstLetter.retryCount).toBeGreaterThanOrEqual(1);
    });

    it("should clear dead letter queue after populating", async () => {
      // 먼저 dead letter를 추가
      runtime.actors.delete("actor-1");

      supervisor.start();
      supervisor.watch(actorId("actor-1"));

      try {
        await supervisor.handleFailure(actorId("actor-1"), new Error("Test error"));
      } catch {
        // 예외 무시
      }

      await new Promise((resolve) => setTimeout(resolve, 100));

      // 큐에 항목이 있는지 확인
      expect(supervisor.getDeadLetters().length).toBeGreaterThanOrEqual(1);

      // 비우기 및 확인
      supervisor.clearDeadLetters();
      expect(supervisor.getDeadLetters()).toHaveLength(0);
    });
  });

  describe("custom decider", () => {
    it("should escalate when custom decider requests escalation", async () => {
      const customSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        decider: () => RestartDirective.ESCALATE,
      });

      customSupervisor.start();
      customSupervisor.watch(actorId("actor-1"));
      const escalateHandler = vi.fn();
      customSupervisor.on("escalate", escalateHandler);

      await customSupervisor.handleFailure(actorId("actor-1"), new Error("escalate"));

      expect(escalateHandler).toHaveBeenCalledWith(actorId("actor-1"), expect.any(Error));
      expect(customSupervisor.getRestartHistory()).toEqual([]);
    });

    it("should use custom decider", async () => {
      const customSupervisor = new Supervisor(runtime as unknown as ActorRuntime, {
        strategy: RestartStrategy.ONE_FOR_ONE,
        backoff: {
          policy: BackoffPolicy.FIXED,
          initialDelay: 10,
          maxDelay: 100,
        },
        maxRestarts: 3,
        restartWindow: 60000,
        decider: (error) => {
          if (error.message.includes("fatal")) {
            return RestartDirective.STOP;
          }
          return RestartDirective.RESTART;
        },
      });

      customSupervisor.start();
      customSupervisor.watch(actorId("actor-1"));

      const stoppedHandler = vi.fn();
      customSupervisor.on("actor:stopped", stoppedHandler);

      await customSupervisor.handleFailure(actorId("actor-1"), new Error("fatal error"));
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(stoppedHandler).toHaveBeenCalled();
    });
  });
});

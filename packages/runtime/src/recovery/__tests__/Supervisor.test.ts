import { describe, it, expect, beforeEach, vi } from "vitest";

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

      const delaySpy = vi.spyOn(fixedSupervisor as any, "delay").mockResolvedValue(undefined);

      fixedSupervisor.start();
      fixedSupervisor.watch(actorId("actor-1"));

      await fixedSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));

      expect(delaySpy).toHaveBeenCalledWith(100);

      delaySpy.mockRestore();
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

      const delaySpy = vi.spyOn(expSupervisor as any, "delay").mockResolvedValue(undefined);

      expSupervisor.start();
      expSupervisor.watch(actorId("actor-1"));

      await expSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));

      expect(delaySpy).toHaveBeenCalledWith(100);

      await expSupervisor.handleFailure(actorId("actor-1"), new Error("Test 2"));
      expect(delaySpy).toHaveBeenCalledWith(200);

      delaySpy.mockRestore();
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

      const delaySpy = vi.spyOn(linearSupervisor as any, "delay").mockResolvedValue(undefined);

      linearSupervisor.start();
      linearSupervisor.watch(actorId("actor-1"));

      await linearSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));

      expect(delaySpy).toHaveBeenCalledWith(100);

      await linearSupervisor.handleFailure(actorId("actor-1"), new Error("Test 2"));
      expect(delaySpy).toHaveBeenCalledWith(200);

      delaySpy.mockRestore();
    });

    it("should use exponential jitter backoff", async () => {
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

      const delaySpy = vi.spyOn(jitterSupervisor as any, "delay").mockResolvedValue(undefined);

      jitterSupervisor.start();
      jitterSupervisor.watch(actorId("actor-1"));

      await jitterSupervisor.handleFailure(actorId("actor-1"), new Error("Test"));

      expect(delaySpy).toHaveBeenCalled();
      const delayValue = delaySpy.mock.calls[0][0];
      expect(delayValue).toBeGreaterThan(90);
      expect(delayValue).toBeLessThan(110);

      delaySpy.mockRestore();
    });
  });

  describe("dead letter queue", () => {
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

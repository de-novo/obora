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
import { ActorRunner } from "../ActorRunner";

class TestActor implements Actor {
  readonly id: ActorId = createActorId("analyst");
  readonly name: string = "test";
  readonly role: ActorRole = "analyst" as ActorRole;
  board: IBlackboard = {
    read: vi.fn(),
    write: vi.fn(),
    delete: vi.fn(),
    keys: vi.fn(() => []),
    find: vi.fn(() => []),
    version: 1,
  };
  messageBus: IMessageBus = {
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
  } = {
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
  lastActivity = new Date();
  createdAt = new Date();
  metrics = createActorMetrics();

  observe = vi.fn().mockResolvedValue({ actorId: this.id, timestamp: new Date() });
  think = vi.fn().mockResolvedValue({
    id: createActionId("action-1"),
    actorId: this.id,
    type: "execute",
    timestamp: new Date(),
  });
  act = vi.fn().mockResolvedValue({
    id: createResultId("result-1"),
    actionId: createActionId("action-1"),
    actorId: this.id,
    timestamp: new Date(),
    status: "success",
  });
  report = vi.fn().mockResolvedValue(undefined);
  receive = vi.fn();
  start = vi.fn().mockResolvedValue(undefined);
  stop = vi.fn().mockResolvedValue(undefined);
  restart = vi.fn().mockResolvedValue(undefined);
  getStatus = vi.fn().mockReturnValue(this.status);
  isAlive = vi.fn().mockReturnValue(true);
}

describe("ActorRunner", () => {
  let runner: ActorRunner;
  let actor: TestActor;

  beforeEach(() => {
    actor = new TestActor();
    runner = new ActorRunner(actor, {
      interval: 10, // 빠른 테스트를 위해 짧게 설정
      maxIterations: 3,
    });
  });

  it("should run cycles", async () => {
    await runner.start();

    expect(actor.observe).toHaveBeenCalledTimes(3);
    expect(actor.think).toHaveBeenCalledTimes(3);
    expect(actor.act).toHaveBeenCalledTimes(3);
    expect(actor.report).toHaveBeenCalledTimes(3);
    expect(runner.getIterationCount()).toBe(3);
  });

  it("should stop after max iterations", async () => {
    await runner.start();
    expect(runner.getIterationCount()).toBe(3);
    expect(runner.running()).toBe(false);
  });

  it("should stop manually", async () => {
    runner.start();
    await new Promise((resolve) => setTimeout(resolve, 20));
    runner.stop();

    const count = runner.getIterationCount();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(runner.getIterationCount()).toBe(count);
  });

  it("should respect stop condition", async () => {
    let shouldStop = false;
    const runnerWithCondition = new ActorRunner(actor, {
      interval: 10,
      stopCondition: () => shouldStop,
    });

    setTimeout(() => {
      shouldStop = true;
    }, 25);
    await runnerWithCondition.start();

    expect(runnerWithCondition.getIterationCount()).toBeLessThan(5);
  });

  it("should throw when starting already running runner", async () => {
    const startPromise = runner.start();
    await expect(runner.start()).rejects.toThrow("Runner is already running");
    await startPromise;
  });

  it("should log errors even when debug mode is disabled", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const error = new Error("Test error");

    const debugRunner = new ActorRunner(actor, {
      interval: 10,
      maxIterations: 1,
      stopOnError: false,
      debug: false,
    });

    actor.act.mockRejectedValueOnce(error);

    await debugRunner.start();

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("Cycle error"), error);
    errorSpy.mockRestore();
  });
});

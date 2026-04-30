import { describe, it, expect, beforeEach, vi } from "vitest";

import type { Action } from "../../actor-types/action";
import { createActionId } from "../../actor-types/action";
import { ActorRole, ActorLifecycleStatus } from "../../actor-types/actor";
import type { IBlackboard } from "../../actor-types/blackboard";
import type { IMessageBus, Message } from "../../actor-types/message";
import { createMessageId, MessageType } from "../../actor-types/message";
import type { Observation } from "../../actor-types/observation";
import { createSuccessResult, createFailureResult } from "../../actor-types/result";
import type { Result } from "../../actor-types/result";
import { BaseActor } from "../../BaseActor";
import { actionId, actorId } from "../helpers/ids";

class TestActor extends BaseActor {
  observe(): Observation {
    return {
      actorId: this.id,
      timestamp: new Date(),
    };
  }

  think(observation: Observation): Action {
    return {
      id: createActionId(`action-${crypto.randomUUID()}`),
      actorId: this.id,
      type: "execute" as const,
      timestamp: new Date(),
    };
  }

  act(action: Action): Result {
    return createSuccessResult(action.id, this.id, { output: "test" }, 100);
  }
}

const mockMessageBus: IMessageBus = {
  send: vi.fn(),
  sendTo: vi.fn(),
  broadcast: vi.fn(),
  receive: vi.fn(),
  request: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  getQueueSize: vi.fn(() => 0),
  clearQueue: vi.fn(),
  filter: vi.fn(),
};

const mockBoard: IBlackboard = {
  version: 1,
  read: vi.fn(() => undefined),
  write: vi.fn(),
  delete: vi.fn(),
  keys: vi.fn(() => []),
  find: vi.fn(() => []),
};

describe("BaseActor", () => {
  let actor: TestActor;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(mockMessageBus.subscribe).mockImplementation(() => () => {});
    actor = new TestActor(
      actorId("analyst-test-id"),
      "TestActor",
      "analyst",
      mockBoard,
      mockMessageBus
    );
  });

  describe("initialization", () => {
    it("should initialize with correct properties", () => {
      expect(actor.id).toBe("analyst-test-id");
      expect(actor.name).toBe("TestActor");
      expect(actor.role).toBe("analyst");
      expect(actor.board).toBe(mockBoard);
      expect(actor.messageBus).toBe(mockMessageBus);
      expect(actor.status.status).toBe(ActorLifecycleStatus.CREATED);
    });

    it("should initialize metrics with zero values", () => {
      expect(actor.metrics.totalRuns).toBe(0);
      expect(actor.metrics.successCount).toBe(0);
      expect(actor.metrics.failureCount).toBe(0);
      expect(actor.metrics.lastError).toBeNull();
      expect(actor.metrics.averageExecutionTime).toBe(0);
      expect(actor.metrics.lastExecutionTime).toBeNull();
    });
  });

  describe("status transitions", () => {
    it("should reject invalid status transitions", () => {
      expect(() => {
        actor["setStatus"](ActorLifecycleStatus.RUNNING);
      }).toThrow("Invalid status transition");
    });

    it("should update lastActivity on status change", async () => {
      const initialActivity = actor.lastActivity;
      await new Promise((resolve) => setTimeout(resolve, 10));
      actor["setStatus"](ActorLifecycleStatus.STARTING);
      expect(actor.lastActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });
  });

  describe("start()", () => {
    it("should start actor from CREATED state", async () => {
      await actor.start();
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should setup message handlers on start", async () => {
      await actor.start();
      expect(mockMessageBus.subscribe).toHaveBeenCalled();
    });

    it("should not start if already alive", async () => {
      await actor.start();
      const subscribeCallCount = vi.mocked(mockMessageBus.subscribe).mock.calls.length;
      await actor.start();
      expect(vi.mocked(mockMessageBus.subscribe).mock.calls.length).toBe(subscribeCallCount);
    });

    it("should transition to ERROR on start failure", async () => {
      vi.mocked(mockMessageBus.subscribe).mockImplementation(() => {
        throw new Error("Subscribe failed");
      });
      try {
        await actor.start();
      } catch (e) {
        // Expected error
      }
      expect(actor.status.status).toBe(ActorLifecycleStatus.ERROR);
    });
  });

  describe("stop()", () => {
    it("should stop actor from RUNNING state", async () => {
      await actor.start();
      await actor.stop();
      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });

    it("should stop actor from IDLE state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.IDLE);
      await actor.stop();
      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });

    it("should stop actor from ERROR state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.ERROR);
      await actor.stop();
      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });

    it("should not stop if already STOPPED", async () => {
      await actor.start();
      await actor.stop();
      await actor.stop();
      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });

    it("should throw error when stopping from CREATED state", async () => {
      await expect(actor.stop()).rejects.toThrow("Cannot stop from created state");
    });

    it("should throw error when stopping from BUSY state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.BUSY);
      await expect(actor.stop()).rejects.toThrow("Cannot stop from busy state");
    });
  });

  describe("restart()", () => {
    it("should restart actor from RUNNING state", async () => {
      await actor.start();
      await actor.restart();
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should restart actor from IDLE state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.IDLE);
      await actor.restart();
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should restart actor from BUSY state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.BUSY);
      await actor.restart();
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should restart actor from ERROR state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.ERROR);
      await actor.restart();
      expect(actor.status.status).toBe(ActorLifecycleStatus.RUNNING);
    });

    it("should throw error when restarting from STOPPED state", async () => {
      await actor.start();
      await actor.stop();
      await expect(actor.restart()).rejects.toThrow("Cannot restart from STOPPED state");
    });
  });

  describe("isAlive()", () => {
    it("should return true for RUNNING state", async () => {
      await actor.start();
      expect(actor.isAlive()).toBe(true);
    });

    it("should return true for IDLE state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.IDLE);
      expect(actor.isAlive()).toBe(true);
    });

    it("should return true for BUSY state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.BUSY);
      expect(actor.isAlive()).toBe(true);
    });

    it("should return false for CREATED state", () => {
      expect(actor.isAlive()).toBe(false);
    });

    it("should return false for STOPPED state", async () => {
      await actor.start();
      await actor.stop();
      expect(actor.isAlive()).toBe(false);
    });

    it("should return false for ERROR state", async () => {
      await actor.start();
      actor["setStatus"](ActorLifecycleStatus.ERROR);
      expect(actor.isAlive()).toBe(false);
    });
  });

  describe("receive()", () => {
    it("should handle PING message", async () => {
      const message: Message = {
        id: createMessageId(`msg-${crypto.randomUUID()}`),
        type: MessageType.PING,
        from: actorId("test-sender"),
        to: "broadcast",
        payload: {},
        timestamp: new Date(),
      };
      await actor.receive(message);
      expect(mockMessageBus.sendTo).toHaveBeenCalled();
    });

    it("should handle TASK_ASSIGN message", async () => {
      await actor.start();
      const message: Message = {
        id: createMessageId(`msg-${crypto.randomUUID()}`),
        type: MessageType.TASK_ASSIGN,
        from: actorId("test-sender"),
        to: actor.id,
        payload: {},
        timestamp: new Date(),
      };
      await actor.receive(message);
      expect(actor.metrics.totalRuns).toBeGreaterThan(0);
    });

    it("should handle STATUS_REQUEST message", async () => {
      const message: Message = {
        id: createMessageId(`msg-${crypto.randomUUID()}`),
        type: MessageType.STATUS_REQUEST,
        from: actorId("test-sender"),
        to: actor.id,
        payload: {},
        timestamp: new Date(),
      };
      await actor.receive(message);
      expect(mockMessageBus.sendTo).toHaveBeenCalled();
    });

    it("should handle STOP message", async () => {
      await actor.start();
      const message: Message = {
        id: createMessageId(`msg-${crypto.randomUUID()}`),
        type: MessageType.STOP,
        from: actorId("test-sender"),
        to: actor.id,
        payload: {},
        timestamp: new Date(),
      };
      await actor.receive(message);
      expect(actor.status.status).toBe(ActorLifecycleStatus.STOPPED);
    });
  });

  describe("report()", () => {
    it("should update metrics on success result", () => {
      const result = createSuccessResult(actionId("action-1"), actor.id, { output: "value" }, 100);
      actor.report(result);
      expect(actor.metrics.totalRuns).toBe(1);
      expect(actor.metrics.successCount).toBe(1);
      expect(actor.metrics.lastExecutionTime).toBe(100);
    });

    it("should update metrics on failure result", () => {
      const result = createFailureResult(actionId("action-1"), actor.id, "Test error", 50);
      actor.report(result);
      expect(actor.metrics.totalRuns).toBe(1);
      expect(actor.metrics.failureCount).toBe(1);
      expect(actor.metrics.lastError).toBeInstanceOf(Error);
      expect(actor.metrics.lastError?.message).toBe("Test error");
    });

    it("should broadcast task.complete message", () => {
      const result = createSuccessResult(actionId("action-1"), actor.id, { output: "value" }, 100);
      actor.report(result);
      expect(mockMessageBus.broadcast).toHaveBeenCalled();
      expect(mockMessageBus.broadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.TASK_COMPLETE,
          from: actor.id,
        })
      );
    });

    it("should update average execution time", () => {
      const result1 = createSuccessResult(actionId("action-1"), actor.id, { output: "value" }, 100);
      const result2 = createSuccessResult(actionId("action-2"), actor.id, { output: "value" }, 200);
      actor.report(result1);
      actor.report(result2);
      expect(actor.metrics.averageExecutionTime).toBe(150);
    });
  });

  describe("OODA cycle", () => {
    it("should execute observe-think-act-report cycle", async () => {
      await actor.start();
      const observation = actor.observe();
      expect(observation.actorId).toBe(actor.id);

      const action = actor.think(observation);
      expect(action.actorId).toBe(actor.id);

      const result = actor.act(action);
      expect(result.actorId).toBe(actor.id);
      expect(result.status).toBe("success");

      actor.report(result);
      expect(actor.metrics.totalRuns).toBe(1);
    });
  });
});

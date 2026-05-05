import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus, EventTimeoutError } from "../event-bus";
import { EventFactory } from "../event-factory";
import { TaskPriority, TaskStatus, createAgentId, createTaskId } from "../../types";
import type { Event } from "../types";

const agentId = createAgentId("agent-1");
const otherAgentId = createAgentId("agent-2");
const taskId = createTaskId("task-1");

function createFactory(): EventFactory {
  let counter = 0;
  return new EventFactory(() => `event-${++counter}`);
}

function createTaskCompletedEvent(source = agentId, correlationId = "corr-1"): Event {
  return createFactory().createTaskCompleted(taskId, { ok: true }, 12, {
    source,
    correlationId,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("EventBus", () => {
  it("dispatches exact, wildcard, all, and filtered subscriptions", () => {
    const bus = new EventBus({ historySize: 5 });
    const exact = vi.fn();
    const taskWildcard = vi.fn();
    const all = vi.fn();
    const filtered = vi.fn();
    const skippedBySource = vi.fn();
    const skippedByPredicate = vi.fn();

    bus.subscribe("task.completed", exact);
    bus.subscribe("task.*", taskWildcard);
    bus.subscribe("*", all);
    bus.subscribeWithFilter("task.*", { source: agentId, correlationId: "corr-1" }, filtered);
    bus.subscribeWithFilter("task.*", { source: otherAgentId }, skippedBySource);
    bus.subscribeWithFilter("task.*", { predicate: () => false }, skippedByPredicate);

    const event = createTaskCompletedEvent();
    bus.emit(event);

    expect(exact).toHaveBeenCalledWith(event);
    expect(taskWildcard).toHaveBeenCalledWith(event);
    expect(all).toHaveBeenCalledWith(event);
    expect(filtered).toHaveBeenCalledWith(event);
    expect(skippedBySource).not.toHaveBeenCalled();
    expect(skippedByPredicate).not.toHaveBeenCalled();
    expect(bus.getHistory()).toEqual([event]);
    expect(bus.getStats()).toMatchObject({
      totalEmitted: 1,
      subscriberCount: 6,
      eventsByType: { "task.completed": 1 },
    });
  });

  it("supports unsubscribe variants and subscriber stats", () => {
    const bus = new EventBus();
    const exact = vi.fn();
    const wildcard = vi.fn();
    const disposable = vi.fn();

    const unsubscribe = bus.subscribe("task.completed", exact);
    bus.subscribe("task.*", wildcard);
    bus.subscribe("system.*", disposable);

    expect(bus.getStats().subscriberCount).toBe(3);
    expect(bus.getStats().subscribersByType.get("task.completed")).toBe(1);

    unsubscribe();
    bus.emit(createTaskCompletedEvent());
    expect(exact).not.toHaveBeenCalled();
    expect(wildcard).toHaveBeenCalledTimes(1);

    bus.unsubscribe("task.*", wildcard);
    bus.emit(createTaskCompletedEvent());
    expect(wildcard).toHaveBeenCalledTimes(1);

    bus.unsubscribeAll("system.*");
    expect(bus.getStats().subscriberCount).toBe(0);

    bus.subscribe("task.completed", exact);
    bus.subscribe("task.*", wildcard);
    bus.removeSubscribersForType("task.completed");
    bus.emit(createTaskCompletedEvent());
    expect(exact).not.toHaveBeenCalled();
    expect(wildcard).toHaveBeenCalledTimes(2);

    bus.removeAllSubscribers();
    expect(bus.getStats().subscriberCount).toBe(0);
  });

  it("removes once subscriptions after the first matching event", () => {
    const bus = new EventBus();
    const once = vi.fn();

    bus.subscribeOnce("task.completed", once);
    bus.emit(createTaskCompletedEvent());
    bus.emit(createTaskCompletedEvent());

    expect(once).toHaveBeenCalledTimes(1);
    expect(bus.getStats().subscriberCount).toBe(0);
  });

  it("records, filters, limits, replays, and clears history", () => {
    const factory = createFactory();
    const bus = new EventBus({ historySize: 2 });
    const replayed = vi.fn();
    const first = factory.createTaskCreated({
      id: taskId,
      name: "Create",
      description: "Create task",
      assignedTo: null,
      status: TaskStatus.PENDING,
      priority: TaskPriority.NORMAL,
      inputs: {},
      outputs: null,
      dependsOn: [],
      error: null,
      startedAt: null,
      completedAt: null,
      timeout: null,
      version: 1,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const second = factory.createTaskCompleted(taskId, { ok: true }, 10, { source: agentId });
    const third = factory.createSystemError("E_TEST", "failed");

    bus.emit(first);
    bus.emit(second);
    bus.emit(third);

    expect(bus.getHistory()).toEqual([second, third]);
    expect(bus.getHistory({ type: "task.*" })).toEqual([second]);
    expect(bus.getHistory({ source: agentId })).toEqual([second]);
    expect(bus.getHistory({ since: second.timestamp, until: third.timestamp, limit: 1 })).toEqual([third]);
    expect(bus.getHistory(undefined, 1)).toEqual([third]);

    bus.subscribe("*", replayed);
    bus.replay([second, third]);
    expect(replayed).toHaveBeenCalledTimes(2);

    bus.clearHistory();
    expect(bus.getHistory()).toEqual([]);

    bus.clear();
    expect(bus.getStats().totalEmitted).toBe(0);
    expect(bus.getStats().subscriberCount).toBe(1);
  });

  it("emits batches and waits for async handlers", async () => {
    const factory = createFactory();
    const bus = new EventBus({ historySize: 10 });
    const seen: string[] = [];

    bus.subscribe("task.*", async (event) => {
      await Promise.resolve();
      seen.push(event.type);
    });

    const created = factory.createTaskAssigned(taskId, agentId);
    const completed = factory.createTaskCompleted(taskId, { ok: true }, 10);

    bus.emitBatch([created, completed]);
    await bus.emitAsync(completed);

    expect(seen).toEqual(["task.assigned", "task.completed", "task.completed"]);
    expect(bus.getHistory()).toEqual([created, completed, completed]);
  });

  it("waits for events, predicates, and conditions", async () => {
    const bus = new EventBus();
    const first = createTaskCompletedEvent(agentId, "skip");
    const second = createTaskCompletedEvent(agentId, "match");

    const waitForAny = bus.waitFor("task.completed", 100);
    bus.emit(first);
    await expect(waitForAny).resolves.toEqual(first);

    const waitForPredicate = bus.waitFor("task.completed", 100, (event) => event.correlationId === "match");
    bus.emit(first);
    bus.emit(second);
    await expect(waitForPredicate).resolves.toEqual(second);

    const waitForCondition = bus.waitForCondition(
      "task.completed",
      (event) => event.payload.duration === 12,
      100
    );
    bus.emit(second);
    await expect(waitForCondition).resolves.toEqual(second);
  });

  it("rejects waiters on timeout and removes their subscriptions", async () => {
    vi.useFakeTimers();
    const bus = new EventBus();

    const waitFor = bus.waitFor("task.completed", 10);
    const assertion = expect(waitFor).rejects.toBeInstanceOf(EventTimeoutError);

    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    expect(bus.getStats().subscriberCount).toBe(0);
  });

  it("normalizes handler failures into system error events", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bus = new EventBus({ historySize: 10 });
    const errorHandler = vi.fn();

    bus.subscribe("system.error", errorHandler);
    bus.subscribe("task.completed", () => {
      throw new Error("handler failed");
    });

    const original = createTaskCompletedEvent();
    bus.emit(original);

    expect(errorSpy).toHaveBeenCalledWith("Error in event handler:", expect.any(Error));
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "system.error",
        payload: expect.objectContaining({
          code: "EVENT_HANDLER_ERROR",
          details: expect.objectContaining({
            originalEventType: "task.completed",
            handlerEventType: "task.completed",
          }),
        }),
      })
    );
    expect(bus.getStats().eventsByType["system.error"]).toBe(1);
  });

  it("logs debug output and suppresses recursive error event emission", () => {
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bus = new EventBus({ debug: true });

    bus.subscribe("system.error", () => {
      throw new Error("error handler failed");
    });

    bus.emit(createFactory().createSystemError("E_TEST", "failed"));

    expect(debugSpy).toHaveBeenCalledWith("[EventBus] Emitting event: system.error", expect.any(Object));
    expect(errorSpy).toHaveBeenCalledWith("Suppressing recursive error event:", expect.any(Error));
  });
});

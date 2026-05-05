import { setImmediate } from "node:timers/promises";
import { describe, expect, it, vi } from "vitest";

import type { Event } from "../../blackboard/events";
import { EventBus } from "../event-bus.js";
import { EventBusAdapter } from "../EventBusAdapter.js";
import type { AuditTrail } from "../AuditTrail.js";
import type { AuditEvent } from "../types.js";

function createTrail(): AuditTrail & { recorded: AuditEvent[] } {
  const recorded: AuditEvent[] = [];

  return {
    recorded,
    record: vi.fn(async (event: AuditEvent) => {
      recorded.push(event);
    }),
    query: vi.fn(async () => recorded),
    replay: vi.fn(async () => ({
      mode: "event-playback",
      executionId: "exec-1",
      totalEvents: recorded.length,
      startedAt: new Date("2026-01-01T00:00:00.000Z"),
      completedAt: new Date("2026-01-01T00:00:00.000Z"),
      durationMs: 0,
      sequence: recorded,
    })),
    export: vi.fn(async () => JSON.stringify(recorded)),
  };
}

function event(overrides: Partial<Event> & { payload?: unknown }): Event {
  return {
    id: overrides.id ?? "evt-1",
    type: overrides.type ?? "task.started",
    timestamp: overrides.timestamp ?? new Date("2026-01-01T00:00:00.000Z"),
    source: overrides.source ?? "system",
    correlationId: overrides.correlationId,
    payload: overrides.payload ?? {},
    ...overrides,
  } as Event;
}

describe("EventBusAdapter", () => {
  it("records mapped event bus messages with execution and cell identity", async () => {
    const bus = new EventBus();
    const trail = createTrail();
    const adapter = new EventBusAdapter(bus, trail, "fallback-exec");

    adapter.start();
    bus.emit(event({
      id: "evt-start",
      type: "task.started",
      source: "agent-1",
      correlationId: "exec-123",
      payload: { taskId: "step-a", input: "ok" },
    }));
    await setImmediate();

    expect(trail.record).toHaveBeenCalledTimes(1);
    expect(trail.recorded[0]).toMatchObject({
      id: "evt-start",
      executionId: "exec-123",
      cellId: "step-a",
      type: "step_start",
      data: {
        sourceType: "task.started",
        source: "agent-1",
        payload: { taskId: "step-a", input: "ok" },
      },
    });
  });

  it("ignores unknown events and falls back when correlation or task id are absent", async () => {
    const bus = new EventBus();
    const trail = createTrail();
    const adapter = new EventBusAdapter(bus, trail, "fallback-exec");

    adapter.start();
    bus.emit(event({ id: "evt-ignore", type: "custom.event", payload: {} }));
    await setImmediate();
    expect(trail.record).not.toHaveBeenCalled();

    bus.emit(event({ id: "evt-error", type: "system.error", payload: null }));
    await setImmediate();
    expect(trail.recorded[0]).toMatchObject({
      id: "evt-error",
      executionId: "fallback-exec",
      cellId: undefined,
      type: "error",
      data: { sourceType: "system.error", payload: null },
    });

    adapter.stop();
    bus.emit(event({ id: "evt-after-stop", type: "task.completed", payload: { taskId: "step-b" } }));
    await setImmediate();
    expect(trail.record).toHaveBeenCalledTimes(1);
  });
});

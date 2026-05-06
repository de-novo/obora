import { describe, expect, it } from "vitest";

import { DefaultAuditRecorder } from "../DefaultAuditRecorder.js";
import { InMemoryAuditStore } from "../InMemoryAuditStore.js";
import type { AuditEvent } from "../types.js";

function makeEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: crypto.randomUUID(),
    executionId: "exec-1",
    timestamp: new Date(),
    type: "tool_call",
    data: { ok: true },
    ...overrides,
  };
}

describe("InMemoryAuditStore", () => {
  it("records and queries events", async () => {
    const store = new InMemoryAuditStore();
    const event = makeEvent({ type: "cell_start" });

    await store.record(event);

    const found = await store.query({ executionId: "exec-1" });
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe(event.id);
    expect(found[0].type).toBe("cell_start");
  });

  it("filters by executionId, type, and date range", async () => {
    const store = new InMemoryAuditStore();
    const base = new Date("2026-02-16T00:00:00.000Z");

    await store.record(
      makeEvent({
        executionId: "exec-1",
        type: "tool_call",
        timestamp: new Date(base.getTime() + 1_000),
      }),
    );
    await store.record(
      makeEvent({
        executionId: "exec-1",
        type: "state_change",
        timestamp: new Date(base.getTime() + 2_000),
      }),
    );
    await store.record(
      makeEvent({
        executionId: "exec-2",
        type: "tool_call",
        timestamp: new Date(base.getTime() + 3_000),
      }),
    );

    const found = await store.query({
      executionId: "exec-1",
      type: "state_change",
      from: new Date(base.getTime() + 1_500),
      to: new Date(base.getTime() + 2_500),
    });

    expect(found).toHaveLength(1);
    expect(found[0].executionId).toBe("exec-1");
    expect(found[0].type).toBe("state_change");
  });

  it("filters by cell, multiple types, bounds, and limit while cloning timestamps", async () => {
    const store = new InMemoryAuditStore();
    const base = new Date("2026-02-16T00:00:00.000Z");
    const first = makeEvent({
      id: "evt-first",
      executionId: "exec-filter",
      cellId: "cell-1",
      type: "tool_call",
      timestamp: new Date(base.getTime() + 1_000),
    });

    await store.record(first);
    await store.record(
      makeEvent({
        id: "evt-second",
        executionId: "exec-filter",
        cellId: "cell-1",
        type: "tool_result",
        timestamp: new Date(base.getTime() + 2_000),
      }),
    );
    await store.record(
      makeEvent({
        id: "evt-third",
        executionId: "exec-filter",
        cellId: "cell-2",
        type: "state_change",
        timestamp: new Date(base.getTime() + 3_000),
      }),
    );

    first.timestamp.setUTCFullYear(2000);

    const found = await store.query({
      executionId: "exec-filter",
      cellId: "cell-1",
      type: ["tool_call", "tool_result"],
      from: new Date(base.getTime() + 500),
      to: new Date(base.getTime() + 2_500),
      limit: 1,
    });

    expect(found.map((event) => event.id)).toEqual(["evt-first"]);
    expect(found[0].timestamp.toISOString()).toBe("2026-02-16T00:00:01.000Z");
    found[0].timestamp.setUTCFullYear(1999);

    const queriedAgain = await store.query({ executionId: "exec-filter", type: "tool_call" });
    expect(queriedAgain[0].timestamp.toISOString()).toBe("2026-02-16T00:00:01.000Z");
  });

  it("replays events in deterministic timestamp order", async () => {
    const store = new InMemoryAuditStore();
    const base = new Date("2026-02-16T00:00:00.000Z");

    await store.record(
      makeEvent({
        executionId: "exec-replay",
        id: "evt-3",
        type: "cell_end",
        timestamp: new Date(base.getTime() + 3_000),
      }),
    );
    await store.record(
      makeEvent({
        executionId: "exec-replay",
        id: "evt-1",
        type: "cell_start",
        timestamp: new Date(base.getTime() + 1_000),
      }),
    );
    await store.record(
      makeEvent({
        executionId: "exec-replay",
        id: "evt-2",
        type: "tool_call",
        timestamp: new Date(base.getTime() + 2_000),
      }),
    );

    const replayedIds: string[] = [];

    const result = await store.replay({
      executionId: "exec-replay",
      speed: Number.MAX_SAFE_INTEGER,
      onEvent: async (event) => {
        replayedIds.push(event.id);
      },
    });

    expect(replayedIds).toEqual(["evt-1", "evt-2", "evt-3"]);
    expect(result.totalEvents).toBe(3);
    expect(result.sequence.map((event) => event.id)).toEqual(["evt-1", "evt-2", "evt-3"]);
  });

  it("throws when replay mode is not event-playback", async () => {
    const store = new InMemoryAuditStore();

    await expect(
      store.replay({
        executionId: "exec-replay",
        mode: "re-execution",
      }),
    ).rejects.toThrow("not supported in M1");
  });

  it("rejects invalid replay speed and supports default replay options", async () => {
    const store = new InMemoryAuditStore();
    await store.record(
      makeEvent({
        executionId: "exec-default-replay",
        id: "evt-default",
        timestamp: new Date("2026-02-16T00:00:00.000Z"),
      }),
    );

    await expect(store.replay({ executionId: "exec-default-replay", speed: 0 })).rejects.toThrow(
      "positive finite",
    );
    await expect(store.replay({ executionId: "exec-default-replay", speed: Number.POSITIVE_INFINITY })).rejects.toThrow(
      "positive finite",
    );

    await expect(store.replay({ executionId: "exec-default-replay" })).resolves.toMatchObject({
      mode: "event-playback",
      totalEvents: 1,
    });
  });

  it("exports execution data as json and csv", async () => {
    const store = new InMemoryAuditStore();

    await store.record(
      makeEvent({
        executionId: "exec-export",
        type: "error",
        data: { code: "E1" },
      }),
    );

    const json = await store.export("exec-export", "json");
    const parsed = JSON.parse(json) as Array<{ executionId: string; type: string }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0].executionId).toBe("exec-export");

    const csv = await store.export("exec-export", "csv");
    expect(csv).toContain("id,executionId,cellId,timestamp,type,data,metadata");
    expect(csv).toContain("exec-export");
    expect(csv).toContain("error");
  });

  it("escapes csv values and leaves nullish fields empty", async () => {
    const store = new InMemoryAuditStore();

    await store.record(
      makeEvent({
        id: 'evt-"quoted"',
        executionId: "exec-csv",
        cellId: undefined,
        type: "tool_call",
        data: 'quoted "value"',
        metadata: undefined,
      }),
    );
    await store.record(
      makeEvent({
        id: "evt-null",
        executionId: "exec-csv",
        cellId: undefined,
        data: null,
        metadata: undefined,
      }),
    );

    const csv = await store.export("exec-csv", "csv");

    expect(csv).toContain('"evt-""quoted"""');
    expect(csv).toContain('"quoted ""value"""');
    expect(csv).toContain('"evt-null","exec-csv",""');
    expect(csv).toContain(',"tool_call",,""');
  });
});

describe("DefaultAuditRecorder", () => {
  it("records convenience audit events", async () => {
    const store = new InMemoryAuditStore();
    const recorder = new DefaultAuditRecorder(store, "exec-r", "cell-1");

    await recorder.recordToolCall("file_write", { path: "a.ts" }, { ok: true }, 25);
    await recorder.recordStateChange("knowledge.code", null, "hello");
    await recorder.recordError("E_RUNTIME", "failed", { step: "build" });

    const events = await store.query({ executionId: "exec-r" });
    const types = events.map((event) => event.type);

    expect(types).toEqual(["tool_call", "tool_result", "state_change", "error"]);
    expect(events.every((event) => event.cellId === "cell-1")).toBe(true);
  });
});

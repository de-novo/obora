import { describe, expect, it } from "vitest";

import { Blackboard } from "../blackboard.js";

describe("CLI runtime Blackboard", () => {
  it("merges partial initial state and preserves default step storage", () => {
    const board = new Blackboard({
      state: {
        context: {
          workflow: { name: "release" },
          steps: {
            plan: {
              success: true,
              output: "ok",
              error: null,
              diagnosisCode: null,
              completedAt: "2026-01-01T00:00:00.000Z",
              failedAt: null,
            },
          },
          extra: { enabled: true },
        },
      },
      metadata: { source: "test" },
    });

    expect(board.read("state.context.workflow")).toEqual({ name: "release" });
    expect(board.read("state.context.steps.plan")).toMatchObject({
      success: true,
      output: "ok",
    });
    expect(board.read("state.context.extra")).toEqual({ enabled: true });
    expect(board.read("metadata")).toEqual({ source: "test" });
  });

  it("keeps defaults when partial initial state omits nested runtime state", () => {
    const board = new Blackboard({ metadata: { source: "empty" } });

    expect(board.read("state.context.steps")).toEqual({});
    expect(board.read("metadata")).toEqual({ source: "empty" });
  });

  it("handles missing paths, non-object traversal, and event emitter no-ops", () => {
    const board = new Blackboard({
      state: {
        context: {
          steps: {},
          scalar: "value",
        },
      },
    });

    expect(board.read("state.context.missing", { strict: false })).toBeUndefined();
    expect(board.read("state.context.scalar.child", { strict: false })).toBeUndefined();
    expect(() => board.read("state.context.scalar.child")).toThrow(
      "Path not found: state.context.scalar.child"
    );
    expect(board.exists("state.context.missing")).toBe(false);

    const listener = () => undefined;
    expect(board.on("event", listener)).toBe(board);
    expect(board.off("event", listener)).toBe(board);
    expect(board.once("event", listener)).toBe(board);
    expect(board.emit("event")).toBe(false);
    expect(board.removeAllListeners("event")).toBe(board);
    expect(board.listenerCount("event")).toBe(0);
  });

  it("records step errors with fallback timestamps and frozen snapshots", () => {
    const board = new Blackboard();
    const startVersion = board.version;

    board.recordStepError("validate", {
      message: "failed validation",
    });

    const record = board.read("state.context.steps.validate");
    expect(record).toMatchObject({
      success: false,
      output: null,
      error: "failed validation",
      errorMeta: null,
      diagnosisCode: null,
      completedAt: null,
    });
    expect(typeof (record as { failedAt?: unknown }).failedAt).toBe("string");
    expect(board.version).toBe(startVersion + 1);

    const snapshot = board.getSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.state.context.steps)).toBe(true);
    expect(() => {
      (snapshot.state.context.steps as Record<string, unknown>).extra = {};
    }).toThrow();
  });

  it("records coded step errors with explicit failedAt values", () => {
    const board = new Blackboard();

    board.recordStepError("build", {
      message: "compile failed",
      code: "E4001",
      failedAt: "2026-02-02T00:00:00.000Z",
    });

    expect(board.read("state.context.steps.build")).toMatchObject({
      error: "compile failed",
      errorMeta: {
        message: "compile failed",
        code: "E4001",
        failedAt: "2026-02-02T00:00:00.000Z",
      },
      diagnosisCode: "E4001",
      failedAt: "2026-02-02T00:00:00.000Z",
    });
  });
});

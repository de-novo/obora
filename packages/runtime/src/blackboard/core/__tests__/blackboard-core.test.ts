import { describe, expect, it, vi } from "vitest";
import { Blackboard, PathNotFoundError, VersionConflictError } from "../blackboard";
import { createSessionId } from "../../types";

const sessionId = createSessionId("session-core");

describe("Blackboard core API", () => {
  it("initializes with stable metadata and emits the optional initialization callback", () => {
    const onEvent = vi.fn();
    const board = new Blackboard({ sessionId, onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      type: "state.initialized",
      timestamp: expect.any(Date),
    });
    expect(board.sessionId).toBe(sessionId);
    expect(board.version).toBe(1);
    expect(board.meta.sessionId).toBe(sessionId);
    expect(board.snapshotManager).toBeDefined();
  });

  it("reads, writes, checks existence, and deletes paths with version feedback", () => {
    const board = new Blackboard({ sessionId });
    const updated = vi.fn();
    board.on("state.updated", updated);

    const write = board.write("state.context.release", { version: "0.1.0" });
    expect(write).toMatchObject({
      success: true,
      version: 2,
      path: "state.context.release",
      previousValue: undefined,
    });
    expect(updated).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "state.updated",
        path: "state.context.release",
      })
    );
    expect(board.exists("state.context.release")).toBe(true);

    const cloned = board.read<{ version: string }>("state.context.release");
    cloned.version = "mutated";
    expect(board.read<{ version: string }>("state.context.release").version).toBe("0.1.0");
    expect(board.read("state.context.missing", { strict: false })).toBeUndefined();
    expect(() => board.read("state.context.missing")).toThrow(PathNotFoundError);

    const deleted = board.delete("state.context.release");
    expect(deleted).toMatchObject({
      success: true,
      version: 3,
      previousValue: { version: "0.1.0" },
    });
    expect(board.delete("state.context.release", { strict: false }).success).toBe(false);
    expect(() => board.delete("state.context.release")).toThrow(PathNotFoundError);
    expect(board.delete("", { strict: false }).error).toBeDefined();
  });

  it("reports write and delete version conflicts without mutating state", () => {
    const board = new Blackboard({ sessionId });

    expect(() => board.write("state.context.release", "0.1.0", { expectedVersion: 999 })).toThrow(
      VersionConflictError
    );
    expect(board.exists("state.context.release")).toBe(false);

    board.write("state.context.release", "0.1.0");
    const failedDelete = board.delete("state.context.release", { expectedVersion: 999 });
    expect(failedDelete.success).toBe(false);
    expect(failedDelete.error).toBeInstanceOf(VersionConflictError);
    expect(board.read("state.context.release")).toBe("0.1.0");
  });

  it("runs transactions atomically and rolls back failed batches", () => {
    const board = new Blackboard({ sessionId });
    board.write("state.context.keep", "original");
    const beforeVersion = board.version;

    const results = board.transaction([
      { type: "write", path: "state.context.release", value: "0.1.0" },
      { type: "delete", path: "state.context.keep" },
    ]);

    expect(results).toHaveLength(2);
    expect(results.every((result) => result.success)).toBe(true);
    expect(results[0]?.version).toBe(beforeVersion + 1);
    expect(board.read("state.context.release")).toBe("0.1.0");
    expect(board.exists("state.context.keep")).toBe(false);

    const versionBeforeFailure = board.version;
    const failed = board.transaction([
      { type: "write", path: "state.context.rollback", value: true, expectedVersion: 999 },
      { type: "write", path: "state.context.other", value: true },
    ]);

    expect(failed.every((result) => !result.success)).toBe(true);
    expect(failed[0]?.version).toBe(versionBeforeFailure);
    expect(board.exists("state.context.rollback")).toBe(false);
    expect(board.exists("state.context.other")).toBe(false);
  });
});

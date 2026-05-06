import { describe, expect, it, vi } from "vitest";
import { Blackboard, PathNotFoundError, VersionConflictError } from "../blackboard";
import {
  AgentStatusEnum,
  TaskPriority,
  TaskStatus,
  createAgentId,
  createSessionId,
  createTaskId,
} from "../../types";
import type { AgentStatus, Task } from "../../types";

const sessionId = createSessionId("session-core");

function createAgentStatus(): AgentStatus {
  return {
    id: createAgentId("agent-json"),
    name: "JSON Agent",
    role: "reviewer",
    status: AgentStatusEnum.IDLE,
    joinedAt: new Date("2026-05-06T00:00:00.000Z"),
  };
}

function createTask(): Task {
  const timestamp = new Date("2026-05-06T00:00:00.000Z");
  return {
    id: createTaskId("task-json"),
    name: "JSON task",
    description: "task stored inside blackboard JSON state",
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
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

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

  it("supports listener lifecycle, once handlers, and wildcard handlers", () => {
    const board = new Blackboard({ sessionId });
    const regular = vi.fn();
    const once = vi.fn();
    const wildcard = vi.fn();

    board.on("state.updated", regular);
    board.once("state.updated", once);
    board.on("state.*", wildcard);

    expect(board.listenerCount("state.updated")).toBe(2);

    board.write("state.context.first", 1);
    board.write("state.context.second", 2);

    expect(regular).toHaveBeenCalledTimes(2);
    expect(once).toHaveBeenCalledTimes(1);
    expect(wildcard).toHaveBeenCalledTimes(2);

    board.off("state.updated", regular);
    board.write("state.context.third", 3);

    expect(regular).toHaveBeenCalledTimes(2);
    expect(wildcard).toHaveBeenCalledTimes(3);

    board.removeAllListeners("state.*");
    board.write("state.context.fourth", 4);
    expect(wildcard).toHaveBeenCalledTimes(3);

    board.removeAllListeners();
    expect(board.listenerCount("state.updated")).toBe(0);
  });

  it("handles empty listener operations and recreates section accessors lazily", () => {
    interface BlackboardHarness {
      _stateAccessor?: unknown;
      _knowledgeAccessor?: unknown;
      _decisionsAccessor?: unknown;
    }

    const board = new Blackboard({ sessionId });
    const missingListener = vi.fn();

    expect(board.off("state.updated", missingListener)).toBe(board);
    expect(board.emit("state.empty")).toBe(false);

    const harness = board as unknown as BlackboardHarness;
    harness._stateAccessor = undefined;
    harness._knowledgeAccessor = undefined;
    harness._decisionsAccessor = undefined;

    expect(board.state.phase).toBe("idle");
    expect(board.knowledge.facts).toEqual([]);
    expect(board.decisions.current).toBeNull();
  });

  it("clones deep reads and exposes raw reads when requested", () => {
    const board = new Blackboard({ sessionId });
    board.write("state.context.nested", { value: 1 });

    const cloned = board.read<{ value: number }>("state.context.nested");
    cloned.value = 2;
    expect(board.read<{ value: number }>("state.context.nested").value).toBe(1);

    const raw = board.read<{ value: number }>("state.context.nested", { deep: false });
    raw.value = 3;
    expect(board.read<{ value: number }>("state.context.nested").value).toBe(3);

    expect(() => board.write("", "invalid")).toThrow("Invalid path");
  });

  it("restores partial JSON payloads through default section fallbacks", () => {
    const metaOnly = Blackboard.fromJSON({ meta: {} });

    expect(metaOnly.version).toBe(1);
    expect(metaOnly.read("state.phase")).toBe("idle");
    expect(metaOnly.read("state.context")).toEqual({});
    expect(metaOnly.knowledge.facts).toEqual([]);
    expect(metaOnly.decisions.pending).toEqual([]);

    const partialSections = Blackboard.fromJSON({
      meta: {},
      state: {},
      decisions: {},
    });

    expect(partialSections.state.agentCount).toBe(0);
    expect(partialSections.state.taskCount).toBe(0);
    expect(partialSections.decisions.current).toBeNull();
    expect(partialSections.decisions.history).toEqual([]);
    const decisions = partialSections.read<{ opinions: Map<string, unknown>; voting: Record<string, unknown> }>("decisions");
    expect(decisions.opinions.size).toBe(0);
    expect(decisions.voting).toEqual({});
  });

  it("clones the active decision in snapshots and transactions", () => {
    const board = new Blackboard({ sessionId });
    board.write("decisions.current", {
      id: "resolution-1",
      taskId: "task-1",
      decision: "approve",
    });

    const state = board.getState();
    expect(state.decisions.current).toEqual({
      id: "resolution-1",
      taskId: "task-1",
      decision: "approve",
    });

    const failed = board.transaction([
      {
        type: "write",
        path: "state.context.rollback",
        value: true,
        expectedVersion: 999,
      },
    ]);

    expect(failed[0]?.success).toBe(false);
    expect(board.read("decisions.current")).toEqual({
      id: "resolution-1",
      taskId: "task-1",
      decision: "approve",
    });
  });

  it("round-trips JSON state with maps and restores snapshots", async () => {
    const initialLastUpdated = new Date("2026-05-06T01:00:00.000Z");
    const initialCreatedAt = new Date("2026-05-06T00:00:00.000Z");
    const board = new Blackboard({
      sessionId,
      initialState: {
        meta: {
          version: 7,
          lastUpdated: initialLastUpdated,
          sessionId,
          createdAt: initialCreatedAt,
        },
        state: {
          phase: "voting",
          context: { nested: { value: 1 } },
          agents: new Map([[createAgentId("agent-json"), createAgentStatus()]]),
          tasks: new Map([[createTaskId("task-json"), createTask()]]),
        },
        knowledge: {
          facts: [],
          inferences: [],
          patterns: [],
        },
        decisions: {
          current: null,
          pending: [],
          opinions: new Map(),
          history: [],
          voting: {},
        },
      },
    });

    const meta = board.meta;
    meta.lastUpdated.setUTCFullYear(2030);
    expect(board.meta.lastUpdated).toEqual(initialLastUpdated);

    const state = board.getState();
    state.state.context.nested = { value: 999 };
    state.state.agents.clear();
    expect(board.read("state.context.nested")).toEqual({ value: 1 });
    expect(board.state.agentCount).toBe(1);

    const json = board.toJSON() as {
      state: { agents: Record<string, AgentStatus>; tasks: Record<string, Task> };
    };
    expect(json.state.agents["agent-json"]?.name).toBe("JSON Agent");
    expect(json.state.tasks["task-json"]?.name).toBe("JSON task");

    const restoredFromJson = Blackboard.fromJSON({
      ...json,
      meta: board.meta,
      knowledge: board.getState().knowledge,
      decisions: board.getState().decisions,
    });
    expect(restoredFromJson.read("state.phase")).toBe("voting");
    expect(restoredFromJson.state.agentCount).toBe(1);

    const snapshot = await board.createSnapshot({
      description: "before restore",
      tags: ["runtime-test"],
      store: true,
    });
    expect((await board.validateSnapshot(snapshot)).valid).toBe(true);

    board.write("state.context.nested", { value: 2 });
    board.restoreSnapshot(snapshot, { newSessionId: false, resetVersion: false });

    expect(board.read("state.context.nested")).toEqual({ value: 1 });
    expect(board.state.agentCount).toBe(1);
  });
});

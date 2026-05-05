import { describe, expect, it, vi } from "vitest";

import { createSessionId } from "../../types";
import { SnapshotComparer } from "../snapshot-comparer";
import { SNAPSHOT_FORMAT_VERSION, type SerializedState, type Snapshot } from "../types";

const createdAt = new Date("2026-05-05T00:00:00.000Z");
const later = new Date("2026-05-05T00:05:00.000Z");
const sessionId = createSessionId("session-compare");

function createSerialized(overrides: Partial<SerializedState> = {}): SerializedState {
  return {
    meta: {
      version: 1,
      lastUpdated: createdAt.toISOString(),
      sessionId,
      createdAt: createdAt.toISOString(),
      ...overrides.meta,
    },
    state: {
      phase: "planning",
      context: {},
      agents: [],
      tasks: [],
      ...overrides.state,
    },
    knowledge: {
      facts: [],
      inferences: [],
      patterns: [],
      ...overrides.knowledge,
    },
    decisions: {
      current: null,
      pending: [],
      opinions: [],
      history: [],
      ...overrides.decisions,
    },
  };
}

function createSnapshot(data: SerializedState, stateVersion = 1, timestamp = createdAt): Snapshot {
  return {
    meta: {
      id: `snapshot-${stateVersion}`,
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      createdAt: timestamp,
      sessionId,
      stateVersion,
      checksum: "checksum",
      compressed: false,
      originalSize: 1,
    },
    data,
  };
}

describe("SnapshotComparer", () => {
  it("detects metadata and section-level additions, removals, and modifications", () => {
    const comparer = new SnapshotComparer();
    const before = createSnapshot(
      createSerialized({
        state: { context: { release: "0.1.0" }, agents: [["agent-1", { status: "idle" }]], tasks: [] },
        knowledge: { facts: [{ id: "fact-1", value: true }], inferences: [], patterns: [] },
        decisions: { current: null, pending: ["agenda-old"], opinions: [["opinion-1", "approve"]], history: [] },
      }),
      3,
      createdAt,
    );
    const after = createSnapshot(
      createSerialized({
        state: { context: { release: "0.1.1" }, agents: [], tasks: [["task-1", { status: "done" }]] },
        knowledge: { facts: [{ id: "fact-1", value: false }], inferences: ["inference-1"], patterns: [] },
        decisions: { current: { id: "agenda-1" }, pending: [], opinions: [], history: ["resolution-1"] },
      }),
      5,
      later,
    );

    const diff = comparer.compare(before, after);

    expect(diff.meta).toEqual({ versionDiff: 2, timeDiff: 300000 });
    expect(diff.hasDifferences).toBe(true);
    expect(diff.sections.state.modified).toBe(3);
    expect(diff.sections.knowledge.modified).toBe(2);
    expect(diff.sections.decisions.modified).toBe(4);
    expect(diff.details).toMatchObject({
      context: { before: { release: "0.1.0" }, after: { release: "0.1.1" } },
      agents: { before: [["agent-1", { status: "idle" }]], after: [] },
      tasks: { before: [], after: [["task-1", { status: "done" }]] },
    });
  });

  it("treats sorted object keys as equal and exposes direct section diffs", () => {
    const comparer = new SnapshotComparer();

    const equal = comparer.createSectionDiff({ item: { b: 2, a: 1 } }, { item: { a: 1, b: 2 } });
    expect(equal).toMatchObject({ added: 0, removed: 0, modified: 0 });
    expect(equal.changes.size).toBe(0);

    const changed = comparer.createSectionDiff({ removed: 1, modified: 1 }, { added: 2, modified: 3 });
    expect(changed).toMatchObject({ added: 1, removed: 1, modified: 1 });
    expect(changed.changes.get("added")).toEqual([undefined, 2]);
    expect(changed.changes.get("removed")).toEqual([1, undefined]);
    expect(changed.changes.get("modified")).toEqual([1, 3]);
  });

  it("returns no differences for identical snapshots and logs extraction failures", () => {
    const comparer = new SnapshotComparer();
    const logger = vi.fn();
    comparer.setLogger(logger);
    const data = createSerialized();
    const identical = comparer.compare(createSnapshot(data), createSnapshot(data));

    expect(identical.hasDifferences).toBe(false);
    expect(identical.details).toBeUndefined();

    const invalidSnapshot = {
      ...createSnapshot(data),
      data: "not serialized",
    } as unknown as Snapshot;

    expect(comparer.extractStateData(invalidSnapshot)).toEqual({});
    expect(comparer.extractKnowledgeData(invalidSnapshot)).toEqual({});
    expect(comparer.extractDecisionsData(invalidSnapshot)).toEqual({});
    expect(logger).toHaveBeenCalledTimes(3);
    expect(logger.mock.calls[0]?.[0]).toContain("extractSection (state) failed");
  });
});

import { describe, expect, it } from "vitest";
import { Blackboard } from "../../core/blackboard";
import { SnapshotManager, SnapshotRestoreError } from "../snapshot-manager";
import { createAgentId, createAgendaId, createSessionId } from "../../types";
import type { BlackboardState, Resolution } from "../../types";

const sessionId = createSessionId("session-manager");
const agentId = createAgentId("agent-1");

function createResolution(id: string, agendaId: string): Resolution {
  return {
    id,
    agendaId: createAgendaId(agendaId),
    decision: "approved",
    summary: `${id} summary`,
    voteSummary: {
      approve: 1,
      reject: 0,
      abstain: 0,
      conditional: 0,
      total: 1,
    },
    conditions: [],
    dissent: [],
    decidedBy: agentId,
    nextActions: [],
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function createManager(): SnapshotManager {
  let counter = 0;
  return new SnapshotManager({
    idGenerator: () => `snapshot-id-${++counter}`,
    autoCompressThreshold: 1_000_000,
  });
}

function createState(context: Record<string, unknown> = {}): BlackboardState {
  const board = new Blackboard({ sessionId });
  board.state.mergeContext(context);
  board.knowledge.addFact({
    content: "gate passed",
    source: agentId,
    confidence: 0.99,
    category: "gate",
    tags: ["release"],
  });
  return board.getState();
}

describe("SnapshotManager", () => {
  it("creates, stores, lists, filters, sorts, and deletes snapshots", () => {
    const manager = createManager();
    const first = manager.createSnapshot(createState({ release: "0.1.0" }), {
      store: true,
      tags: ["release"],
      description: "first",
    });
    const second = manager.createSnapshot(createState({ release: "0.2.0" }), {
      store: true,
      tags: ["checkpoint"],
      description: "second",
    });

    expect(manager.get(first.meta.id)).toBe(first);
    expect(manager.list({ tags: ["release"] })).toEqual([first]);
    expect(manager.list({ sessionId })).toHaveLength(2);
    expect(manager.list({ sortBy: "id", order: "desc" }).map((snapshot) => snapshot.meta.id)).toEqual([
      second.meta.id,
      first.meta.id,
    ]);
    expect(manager.list({ sortBy: "date", order: "asc" })).toHaveLength(2);
    expect(manager.delete(first.meta.id)).toBe(true);
    expect(manager.get(first.meta.id)).toBeUndefined();
  });

  it("validates, serializes, restores, and partially restores snapshots", async () => {
    const manager = createManager();
    const current = createState({ release: "current" });
    const snapshotState = createState({ release: "snapshot" });
    const snapshot = manager.createSnapshot(snapshotState, {
      includeSections: ["state", "knowledge"],
      compress: true,
    });

    expect(manager.validate(snapshot).valid).toBe(true);
    await expect(manager.validateAsync(snapshot)).resolves.toMatchObject({ valid: true });
    expect(manager.validateSyncStructure(snapshot).valid).toBe(true);
    expect(manager.checkVersionCompatibility(snapshot.meta.formatVersion).compatible).toBe(true);

    const json = manager.toJSON(snapshot, true);
    const fromJson = manager.fromJSON(json);
    const fromBytes = manager.fromUint8Array(manager.toUint8Array(snapshot));
    expect(fromJson.meta.id).toBe(snapshot.meta.id);
    expect(fromBytes.meta.id).toBe(snapshot.meta.id);

    const restored = manager.restore(snapshot, {
      resetVersion: false,
      newSessionId: false,
    });
    expect(restored.state.context.release).toBe("snapshot");
    expect(restored.meta.sessionId).toBe(sessionId);

    const partial = manager.partialRestore(snapshot, current, ["state"]);
    expect(partial.state.context.release).toBe("snapshot");
    expect(partial.knowledge.facts[0]?.content).toBe("gate passed");
  });

  it("partially restores knowledge and decisions sections without replacing state", () => {
    const manager = createManager();
    const current = createState({ release: "current" });
    current.decisions.history.push(createResolution("current-decision", "agenda-current"));
    const snapshotState = createState({ release: "snapshot" });
    snapshotState.decisions.history.push(createResolution("snapshot-decision", "agenda-snapshot"));
    const snapshot = manager.createSnapshot(snapshotState);

    const partial = manager.partialRestore(snapshot, current, ["knowledge", "decisions"]);

    expect(partial.state.context.release).toBe("current");
    expect(partial.knowledge.facts[0]?.content).toBe("gate passed");
    expect(partial.decisions.history).toHaveLength(1);
    expect(partial.decisions.history[0]).toMatchObject({
      id: "snapshot-decision",
      agendaId: createAgendaId("agenda-snapshot"),
      decision: "approved",
    });
  });

  it("surfaces checksum, data, and id-generation restore failures", () => {
    const manager = createManager();
    const snapshot = manager.createSnapshot(createState());

    expect(() =>
      manager.restore({
        ...snapshot,
        meta: { ...snapshot.meta, checksum: "invalid" },
      }),
    ).toThrow(SnapshotRestoreError);

    expect(() =>
      manager.restore(
        {
          ...snapshot,
          data: "{bad-json",
        },
        { skipStructuralValidation: true },
      ),
    ).toThrow(SnapshotRestoreError);

    const invalidIdManager = new SnapshotManager({
      idGenerator: () => 1 as unknown as string,
    });
    expect(() =>
      invalidIdManager.restore(snapshot, {
        skipStructuralValidation: true,
      }),
    ).toThrow("idGenerator must return a string");
  });

  it("exposes metadata, size, diff, and section extraction helpers", () => {
    const manager = createManager();
    const before = manager.createSnapshot(createState({ release: "before" }));
    const afterState = createState({ release: "after" });
    afterState.meta.version = before.meta.stateVersion + 1;
    const after = manager.createSnapshot(afterState);

    expect(manager.extractMeta(before)).toBe(before.meta);
    expect(manager.size(before)).toBeGreaterThan(0);
    expect(manager.calculateSize(before)).toMatchObject({
      compressed: false,
    });
    expect(manager.extractStateData(after).context).toEqual({ release: "after" });
    expect(manager.extractKnowledgeData(after).facts).toHaveLength(1);
    expect(manager.extractDecisionsData(after).history).toEqual([]);

    const diff = manager.compare(before, after);
    expect(diff.hasDifferences).toBe(true);
    expect(diff.sections.state.modified).toBeGreaterThan(0);

    const sectionDiff = manager.createSectionDiff({ a: 1, b: 2 }, { a: 1, c: 3 });
    expect(sectionDiff.added).toBe(1);
    expect(sectionDiff.removed).toBe(1);
  });

  it("surfaces restore validation errors with a typed restore error", () => {
    const manager = createManager();
    const snapshot = manager.createSnapshot(createState());
    const invalid = {
      ...snapshot,
      meta: {
        ...snapshot.meta,
        formatVersion: "9.0.0",
      },
    };

    expect(() => manager.restore(invalid)).toThrow(SnapshotRestoreError);
    expect(() => manager.fromJSON(" ")).toThrow("must not be empty");
  });

  it("creates metadata-only snapshots", () => {
    const manager = createManager();
    const meta = manager.createMetaSnapshot(createState(), "meta only");

    expect(meta.description).toBe("meta only");
    expect(meta.id).toBe("snapshot-id-1");
  });
});

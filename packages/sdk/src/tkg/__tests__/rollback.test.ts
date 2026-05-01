import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  FileTKGRollbackStore,
  mergeTKGRollbackSnapshot,
  restoreTKGRollbackFromStore,
  selectTKGRollbackEntry,
  summarizeTKGRollbackEntries,
  type TKGRollbackSnapshot,
  type TKGRollbackStore,
} from "../rollback.js";
import type { MemoryScope, SharedMemorySnapshot, SharedMemoryStore } from "../../shared-memory/store.js";

function makeSnapshot(id: string): TKGRollbackSnapshot {
  return {
    entries: [
      {
        id,
        createdAt: new Date().toISOString(),
        executionId: "exec-1",
        workflowName: "demo",
        scope: "project:obora-kit",
        reason: "pre-tkg-promotion-apply",
        snapshot: {
          knowledge: { facts: [] },
          decisions: { history: [] },
          context: { projectFacts: {} },
        },
      },
    ],
  };
}

describe("TKG rollback helpers", () => {
  it("merges and summarizes rollback entries", () => {
    const merged = mergeTKGRollbackSnapshot(makeSnapshot("r1"), makeSnapshot("r2"));
    expect(merged.entries).toHaveLength(2);
    expect(summarizeTKGRollbackEntries(merged.entries)).toEqual({
      capturedSnapshots: 2,
      scopes: ["project:obora-kit", "project:obora-kit"],
      rollbackIds: ["r1", "r2"],
    });
  });

  it("selects the latest rollback entry by default", () => {
    const selected = selectTKGRollbackEntry(mergeTKGRollbackSnapshot(makeSnapshot("r1"), makeSnapshot("r2")));
    expect(selected?.id).toBe("r2");
  });

  it("restores rollback entry snapshots into shared memory stores", async () => {
    const rollbackStore: TKGRollbackStore = {
      async load() {
        return makeSnapshot("r1");
      },
      async save() {},
    };
    const data = new Map<string, SharedMemorySnapshot>();
    const sharedMemoryStore: SharedMemoryStore = {
      async load(scope: MemoryScope) {
        return data.get(`${scope.level}:${scope.key}`) ?? null;
      },
      async save(scope: MemoryScope, snapshot: SharedMemorySnapshot) {
        data.set(`${scope.level}:${scope.key}`, snapshot);
      },
      async merge() {
        throw new Error("not used");
      },
    };

    const summary = await restoreTKGRollbackFromStore(
      rollbackStore,
      sharedMemoryStore,
      { level: "project", key: "obora-kit" },
    );

    expect(summary).toEqual({
      restored: true,
      scope: "project:obora-kit",
      rollbackId: "r1",
      restoredFactCount: 0,
    });
    expect(await sharedMemoryStore.load({ level: "project", key: "obora-kit" })).not.toBeNull();
  });
});

describe("FileTKGRollbackStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-tkg-rollback-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("saves, loads, and appends rollback entries", async () => {
    const store = new FileTKGRollbackStore(tempDir);
    const scope: MemoryScope = { level: "project", key: "obora-kit" };

    await store.save(scope, makeSnapshot("r1"));
    await store.append(scope, makeSnapshot("r2").entries[0]!);

    const loaded = await store.load(scope);
    expect(loaded).not.toBeNull();
    expect(loaded!.entries.map((entry) => entry.id)).toEqual(["r1", "r2"]);
  });
});

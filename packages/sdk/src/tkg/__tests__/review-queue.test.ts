import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  FileTKGReviewQueueStore,
  listOpenTKGReviewQueueItems,
  mergeTKGReviewQueueSnapshot,
  resolveTKGReviewQueueSnapshot,
  type TKGReviewQueueSnapshot,
} from "../review-queue.js";
import type { MemoryScope } from "../../shared-memory/store.js";

function makeSnapshot(id: string): TKGReviewQueueSnapshot {
  return {
    items: [
      {
        id,
        createdAt: new Date().toISOString(),
        scope: "project:obora-kit",
        workflowName: "demo",
        status: "open",
        candidateNodeIds: ["n2"],
        conflicts: [
          {
            type: "contradiction",
            key: "demo:validate",
            nodeIds: ["n1", "n2"],
            severity: "high",
            message: "Both validation failure and validation success exist for the same step.",
          },
        ],
        summary: {
          candidateCount: 2,
          promotableCount: 1,
          reviewCandidateCount: 1,
          conflictCount: 2,
          reviewQueueCount: 1,
        },
      },
    ],
  };
}

describe("mergeTKGReviewQueueSnapshot", () => {
  it("merges null base with incoming", () => {
    const merged = mergeTKGReviewQueueSnapshot(null, makeSnapshot("item-1"));
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.id).toBe("item-1");
  });

  it("deduplicates queue items by id", () => {
    const merged = mergeTKGReviewQueueSnapshot(makeSnapshot("item-1"), makeSnapshot("item-1"));
    expect(merged.items).toHaveLength(1);
  });
});

describe("review queue snapshot helpers", () => {
  it("resolves items and filters open queue items", () => {
    const resolved = resolveTKGReviewQueueSnapshot(makeSnapshot("item-1"), "item-1", {
      status: "approved",
      resolvedAt: new Date().toISOString(),
      actor: "cto",
      note: "safe to promote",
    });

    expect(listOpenTKGReviewQueueItems(resolved)).toHaveLength(0);
    expect(resolved.items[0]?.status).toBe("approved");
    expect(resolved.items[0]?.resolution?.actor).toBe("cto");
  });
});

describe("FileTKGReviewQueueStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-tkg-review-queue-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("saves, loads, enqueues, and resolves review items", async () => {
    const store = new FileTKGReviewQueueStore(tempDir);
    const scope: MemoryScope = { level: "project", key: "obora-kit" };

    await store.save(scope, makeSnapshot("item-1"));
    await store.enqueue(scope, makeSnapshot("item-2").items[0]!);
    await store.resolve(scope, "item-1", {
      status: "rejected",
      resolvedAt: new Date().toISOString(),
      actor: "cto",
      note: "reject noisy contradiction",
    });

    const loaded = await store.load(scope);
    expect(loaded).not.toBeNull();
    expect(loaded!.items.map((item) => item.id)).toEqual(["item-1", "item-2"]);
    expect(loaded!.items[0]?.status).toBe("rejected");
    expect(loaded!.items[0]?.resolution?.note).toBe("reject noisy contradiction");
  });
});

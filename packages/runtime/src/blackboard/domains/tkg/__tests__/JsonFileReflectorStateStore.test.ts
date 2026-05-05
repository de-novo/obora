import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createAgentId, createNodeId } from "../../../types";
import type { TemporalNode } from "../../../types";
import type { ReflectorPersistedState } from "../ObserverReflector";
import { JsonFileReflectorStateStore } from "../JsonFileReflectorStateStore";

const agentId = createAgentId("agent-1");
const timestamp = new Date("2026-01-01T00:00:00.000Z");
let tempDirs: string[] = [];

function tempFile(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), "obora-reflector-store-"));
  tempDirs.push(dir);
  return join(dir, name);
}

function createNode(): TemporalNode {
  return {
    id: createNodeId("node-1"),
    type: "fact",
    valid_from: timestamp,
    valid_to: new Date("2026-01-02T00:00:00.000Z"),
    observed_at: timestamp,
    updated_at: timestamp,
    confidence: 0.9,
    source: agentId,
    version: 1,
    tags: ["release"],
    data: {
      statement: "release gates passed",
      verified: true,
    },
  };
}

function createState(): ReflectorPersistedState {
  return {
    metrics: {
      totalMerges: 1,
      totalConflicts: 2,
      autoResolved: 1,
      deferred: 1,
      manualReview: 1,
      rollbacks: 0,
    },
    manualReviewQueue: [
      {
        id: "review-1",
        conflictType: "confidence",
        nodeIds: ["node-1"],
        queuedAt: timestamp,
      },
    ],
    deferredQueue: [
      {
        id: "defer-1",
        conflictType: "version",
        nodeIds: ["node-1"],
        queuedAt: timestamp,
      },
    ],
    reportHistory: [
      {
        generatedAt: timestamp,
        mergeId: "merge-1",
        promoted: 1,
        blockedByConflict: 1,
        conflictSummary: {
          contradiction: 0,
          version: 1,
          confidence: 1,
        },
        policySummary: {
          auto: 1,
          manual: 1,
          defer: 1,
        },
      },
    ],
    rollbackSnapshots: [
      {
        mergeId: "merge-1",
        nodes: [createNode()],
      },
    ],
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("JsonFileReflectorStateStore", () => {
  it("returns null for missing, empty, or malformed files", () => {
    const missing = new JsonFileReflectorStateStore(tempFile("missing/state.json"));
    expect(missing.load()).toBeNull();

    const emptyPath = tempFile("empty.json");
    writeFileSync(emptyPath, "   ", "utf8");
    expect(new JsonFileReflectorStateStore(emptyPath).load()).toBeNull();

    const malformedPath = tempFile("malformed.json");
    writeFileSync(malformedPath, "{bad", "utf8");
    expect(new JsonFileReflectorStateStore(malformedPath).load()).toBeNull();
  });

  it("persists and restores queue, report, and rollback snapshot dates", () => {
    const filePath = tempFile("nested/state.json");
    const store = new JsonFileReflectorStateStore(filePath);
    const state = createState();

    store.save(state);
    const loaded = store.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.metrics).toEqual(state.metrics);
    expect(loaded?.manualReviewQueue[0]?.queuedAt).toEqual(timestamp);
    expect(loaded?.deferredQueue[0]?.queuedAt).toEqual(timestamp);
    expect(loaded?.reportHistory[0]?.generatedAt).toEqual(timestamp);
    expect(loaded?.rollbackSnapshots[0]?.nodes[0]?.valid_from).toEqual(timestamp);
    expect(loaded?.rollbackSnapshots[0]?.nodes[0]?.valid_to).toEqual(
      new Date("2026-01-02T00:00:00.000Z")
    );
  });
});

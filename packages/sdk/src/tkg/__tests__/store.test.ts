import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  FileStagingTKGStore,
  mergeStagingTKGSnapshot,
  type StagingTKGSnapshot,
} from "../store.js";
import type { MemoryScope } from "../../shared-memory/store.js";

function makeSnapshot(id: string, summary: string): StagingTKGSnapshot {
  return {
    nodes: [
      {
        id,
        eventType: "workflow.validation_failed",
        executionId: "exec-1",
        workflowName: "demo",
        stepName: "validate",
        timestamp: new Date().toISOString(),
        summary,
        attributes: { summary },
        relations: [{ type: "step", target: "validate" }],
      },
    ],
  };
}

describe("mergeStagingTKGSnapshot", () => {
  it("merges null base with incoming", () => {
    const merged = mergeStagingTKGSnapshot(null, makeSnapshot("node-1", "first"));
    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0]!.id).toBe("node-1");
  });

  it("deduplicates nodes by id with last-write-wins semantics", () => {
    const merged = mergeStagingTKGSnapshot(
      makeSnapshot("node-1", "old"),
      makeSnapshot("node-1", "new"),
    );

    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0]!.summary).toBe("new");
  });
});

describe("FileStagingTKGStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-tkg-store-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-existent scope", async () => {
    const store = new FileStagingTKGStore(tempDir);
    const result = await store.load({ level: "project", key: "missing" });
    expect(result).toBeNull();
  });

  it("saves and loads nodes for a scope", async () => {
    const store = new FileStagingTKGStore(tempDir);
    const scope: MemoryScope = { level: "project", key: "obora-kit" };

    await store.save(scope, makeSnapshot("node-1", "validation failed"));
    const loaded = await store.load(scope);

    expect(loaded).not.toBeNull();
    expect(loaded!.nodes).toHaveLength(1);
    expect(loaded!.nodes[0]!.summary).toBe("validation failed");
  });

  it("appends nodes into an existing scope snapshot", async () => {
    const store = new FileStagingTKGStore(tempDir);
    const scope: MemoryScope = { level: "workflow", key: "repair-loop" };

    await store.save(scope, makeSnapshot("node-1", "first"));
    await store.append(scope, makeSnapshot("node-2", "second").nodes);

    const loaded = await store.load(scope);
    expect(loaded!.nodes.map((node) => node.id)).toEqual(["node-1", "node-2"]);
  });
});

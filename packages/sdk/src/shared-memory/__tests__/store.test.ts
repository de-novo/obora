import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  FileSharedMemoryStore,
  mergeSharedMemorySnapshots,
  type SharedMemorySnapshot,
  type MemoryScope,
} from "../store.js";

function makeSnapshot(factId: string, content: string): SharedMemorySnapshot {
  return {
    knowledge: {
      facts: [
        {
          id: factId,
          content,
          category: "test",
          tags: ["test"],
          confidence: 0.8,
          createdAt: new Date().toISOString(),
        },
      ],
    },
    decisions: { history: [] },
    context: { projectFacts: { key: factId } },
  };
}

describe("mergeSharedMemorySnapshots", () => {
  it("merges null base with incoming", () => {
    const incoming = makeSnapshot("f1", "fact 1");
    const merged = mergeSharedMemorySnapshots(null, incoming);
    expect(merged.knowledge.facts).toHaveLength(1);
    expect(merged.knowledge.facts[0].id).toBe("f1");
  });

  it("deduplicates facts by id", () => {
    const base = makeSnapshot("f1", "fact 1 old");
    const incoming = makeSnapshot("f1", "fact 1 new");
    const merged = mergeSharedMemorySnapshots(base, incoming);
    expect(merged.knowledge.facts).toHaveLength(1);
    expect(merged.knowledge.facts[0].content).toBe("fact 1 new");
  });

  it("appends new facts from incoming", () => {
    const base = makeSnapshot("f1", "fact 1");
    const incoming = makeSnapshot("f2", "fact 2");
    const merged = mergeSharedMemorySnapshots(base, incoming);
    expect(merged.knowledge.facts).toHaveLength(2);
  });

  it("merges context projectFacts", () => {
    const base = makeSnapshot("f1", "fact 1");
    const incoming = makeSnapshot("f2", "fact 2");
    const merged = mergeSharedMemorySnapshots(base, incoming);
    expect(merged.context.projectFacts).toEqual({ key: "f2" });
  });
});

describe("FileSharedMemoryStore", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-shared-memory-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns null for non-existent scope", async () => {
    const store = new FileSharedMemoryStore(tempDir);
    const result = await store.load({ level: "project", key: "missing" });
    expect(result).toBeNull();
  });

  it("saves and loads a snapshot", async () => {
    const store = new FileSharedMemoryStore(tempDir);
    const scope: MemoryScope = { level: "project", key: "obora-kit" };
    const snapshot = makeSnapshot("f1", "backup redesign insight");

    await store.save(scope, snapshot);
    const loaded = await store.load(scope);

    expect(loaded).not.toBeNull();
    expect(loaded!.knowledge.facts).toHaveLength(1);
    expect(loaded!.knowledge.facts[0].content).toBe("backup redesign insight");
  });

  it("merges into existing snapshot", async () => {
    const store = new FileSharedMemoryStore(tempDir);
    const scope: MemoryScope = { level: "workflow", key: "overnight-builder" };

    await store.save(scope, makeSnapshot("f1", "first insight"));
    await store.merge(scope, makeSnapshot("f2", "second insight"));

    const loaded = await store.load(scope);
    expect(loaded!.knowledge.facts).toHaveLength(2);
  });

  it("handles different scope levels independently", async () => {
    const store = new FileSharedMemoryStore(tempDir);

    await store.save({ level: "project", key: "proj" }, makeSnapshot("p1", "project fact"));
    await store.save({ level: "workflow", key: "wf" }, makeSnapshot("w1", "workflow fact"));
    await store.save({ level: "global", key: "global" }, makeSnapshot("g1", "global fact"));

    const project = await store.load({ level: "project", key: "proj" });
    const workflow = await store.load({ level: "workflow", key: "wf" });
    const global = await store.load({ level: "global", key: "global" });

    expect(project!.knowledge.facts[0].id).toBe("p1");
    expect(workflow!.knowledge.facts[0].id).toBe("w1");
    expect(global!.knowledge.facts[0].id).toBe("g1");
  });
});

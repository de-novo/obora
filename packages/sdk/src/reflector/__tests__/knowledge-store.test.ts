import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { KnowledgeStore } from "../knowledge-store.js";

describe("KnowledgeStore", () => {
  let tempDir: string;
  let storePath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "obora-knowledge-test-"));
    storePath = join(tempDir, "reflector-knowledge.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("starts with empty entries", () => {
    const store = new KnowledgeStore(storePath);
    expect(store.size).toBe(0);
    expect(store.getEntries()).toHaveLength(0);
  });

  it("loads gracefully when file does not exist", async () => {
    const store = new KnowledgeStore(storePath);
    await store.load();
    expect(store.size).toBe(0);
  });

  it("records and retrieves patterns", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("backup timing issue", "redesign backup logic", true, {
      workflowName: "test-wf",
      executionId: "exec-1",
    });
    expect(store.size).toBe(1);
    const entries = store.getEntries();
    expect(entries[0]!.pattern).toBe("backup timing issue");
    expect(entries[0]!.resolution).toBe("redesign backup logic");
    expect(entries[0]!.confidence).toBe(1.0);
    expect(entries[0]!.successCount).toBe(1);
    expect(entries[0]!.failureCount).toBe(0);
  });

  it("updates existing pattern on repeated recording", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("timeout error", "increase timeout", true);
    store.recordPattern("timeout error", "add retry", false);
    store.recordPattern("timeout error", "fix root cause", true);

    expect(store.size).toBe(1);
    const entry = store.getEntries()[0]!;
    expect(entry.successCount).toBe(2);
    expect(entry.failureCount).toBe(1);
    expect(entry.confidence).toBeCloseTo(2 / 3);
    // Resolution should be updated to the latest success
    expect(entry.resolution).toBe("fix root cause");
  });

  it("save and load round-trips correctly", async () => {
    const store1 = new KnowledgeStore(storePath);
    store1.recordPattern("pattern_a", "resolution_a", true);
    store1.recordPattern("pattern_b", "resolution_b", false);
    await store1.save();

    // Verify file was written
    const raw = await readFile(storePath, "utf-8");
    const data = JSON.parse(raw);
    expect(data.version).toBe(1);
    expect(data.entries).toHaveLength(2);

    // Load in new store
    const store2 = new KnowledgeStore(storePath);
    await store2.load();
    expect(store2.size).toBe(2);
    const entries = store2.getEntries();
    expect(entries[0]!.pattern).toBe("pattern_a");
    expect(entries[1]!.pattern).toBe("pattern_b");
  });

  it("does not write if not dirty", async () => {
    const store = new KnowledgeStore(storePath);
    await store.save();
    // File should not exist since nothing was recorded
    await expect(readFile(storePath, "utf-8")).rejects.toThrow();
  });

  it("findSimilar returns matching entries sorted by confidence", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("backup timing issue", "fix timing", true);
    store.recordPattern("database connection timeout", "increase pool", false);
    store.recordPattern("backup restore error", "redesign restore", true);

    const results = store.findSimilar(["backup"]);
    expect(results).toHaveLength(2);
    expect(results[0]!.pattern).toContain("backup");
  });

  it("findSimilar returns empty for no match", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("backup timing issue", "fix timing", true);
    const results = store.findSimilar(["nonexistent"]);
    expect(results).toHaveLength(0);
  });

  it("findSimilar returns empty for empty keywords", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("backup timing issue", "fix timing", true);
    expect(store.findSimilar([])).toHaveLength(0);
  });

  it("getTopPatterns returns entries sorted by confidence", () => {
    const store = new KnowledgeStore(storePath);
    store.recordPattern("low_conf", "res", false);
    store.recordPattern("high_conf", "res", true);
    store.recordPattern("mid_conf", "res", true);
    store.recordPattern("mid_conf", "res", false);

    const top = store.getTopPatterns(2);
    expect(top).toHaveLength(2);
    expect(top[0]!.pattern).toBe("high_conf");
    expect(top[0]!.confidence).toBe(1.0);
  });
});

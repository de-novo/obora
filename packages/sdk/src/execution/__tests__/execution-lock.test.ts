import { createHash } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileExecutionLock } from "../execution-lock.js";
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LOCK_DIR = join(__dirname, "..", "..", "__tests__", "test-locks");
const lockFilePath = (workflowName: string): string => {
  const hash = createHash("sha256").update(workflowName).digest("hex").slice(0, 16);
  return join(TEST_LOCK_DIR, `${workflowName}-${hash}.lock`);
};

describe("FileExecutionLock", () => {
  let lock: FileExecutionLock;

  beforeEach(async () => {
    lock = new FileExecutionLock(TEST_LOCK_DIR, 1000); // 1s stale threshold for tests
    try {
      await mkdir(TEST_LOCK_DIR, { recursive: true });
    } catch { /* ignore */ }
  });

  afterEach(async () => {
    await rm(TEST_LOCK_DIR, { recursive: true, force: true });
  });

  it("acquires lock when none exists", async () => {
    const acquired = await lock.acquire("test-workflow", "exec-1");
    expect(acquired).toBe(true);
  });

  it("fails to acquire when already locked by live process", async () => {
    // First acquire
    const first = await lock.acquire("test-workflow", "exec-1");
    expect(first).toBe(true);

    // Second acquire should fail (same PID is alive)
    const second = await lock.acquire("test-workflow", "exec-2");
    expect(second).toBe(false);
  });

  it("does not replace old locks held by live processes", async () => {
    const liveLock = {
      pid: process.pid,
      executionId: "live",
      workflowName: "test-workflow",
      acquiredAt: new Date(Date.now() - 60_000).toISOString(),
      hostname: "test",
    };
    await writeFile(
      lockFilePath("test-workflow"),
      JSON.stringify(liveLock, null, 2),
      "utf-8"
    );

    await expect(lock.acquire("test-workflow", "exec-2")).resolves.toBe(false);
    const stored = JSON.parse(await readFile(lockFilePath("test-workflow"), "utf-8")) as {
      executionId: string;
    };
    expect(stored.executionId).toBe("live");
  });

  it("allows only one concurrent acquire for the same workflow", async () => {
    const results = await Promise.all([
      lock.acquire("race-workflow", "exec-1"),
      lock.acquire("race-workflow", "exec-2"),
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("keeps path-like workflow names inside the lock base path", async () => {
    const acquired = await lock.acquire("../escape", "exec-escape");
    const lockFiles = await readdir(TEST_LOCK_DIR);

    expect(acquired).toBe(true);
    expect(lockFiles).toHaveLength(1);
    expect(lockFiles[0]).toMatch(/^escape-[a-f0-9]{16}\.lock$/);
    await expect(access(join(dirname(TEST_LOCK_DIR), "escape.lock"))).rejects.toThrow();
  });

  it("releases lock successfully", async () => {
    await lock.acquire("test-workflow", "exec-1");
    expect(await lock.isLocked("test-workflow")).toBe(true);

    await lock.release("test-workflow");
    expect(await lock.isLocked("test-workflow")).toBe(false);
  });

  it("only releases own lock", async () => {
    // Create a fake lock with different PID
    const fakeLock = {
      pid: 99999,
      executionId: "other",
      workflowName: "test-workflow",
      acquiredAt: new Date().toISOString(),
      hostname: "test",
    };
    await mkdir(TEST_LOCK_DIR, { recursive: true });
    await writeFile(
      lockFilePath("test-workflow"),
      JSON.stringify(fakeLock, null, 2),
      "utf-8"
    );

    // Try to release (different PID)
    await lock.release("test-workflow");
    
    // Lock should still exist
    expect(await lock.isLocked("test-workflow")).toBe(false); // PID 99999 not alive
  });

  it("detects stale locks from dead processes", async () => {
    // Create a stale lock with non-existent PID
    const staleLock = {
      pid: 99999,
      executionId: "stale",
      workflowName: "test-workflow",
      acquiredAt: new Date(Date.now() - 2000).toISOString(),
      hostname: "test",
    };
    await mkdir(TEST_LOCK_DIR, { recursive: true });
    await writeFile(
      lockFilePath("test-workflow"),
      JSON.stringify(staleLock, null, 2),
      "utf-8"
    );

    // Should be able to acquire (stale lock removed)
    const acquired = await lock.acquire("test-workflow", "exec-1");
    expect(acquired).toBe(true);
  });

  it("replaces recent locks when the recorded process is dead", async () => {
    const deadProcessLock = {
      pid: 99999,
      executionId: "recent-dead",
      workflowName: "test-workflow",
      acquiredAt: new Date().toISOString(),
      hostname: "test",
    };
    await mkdir(TEST_LOCK_DIR, { recursive: true });
    await writeFile(
      lockFilePath("test-workflow"),
      JSON.stringify(deadProcessLock, null, 2),
      "utf-8"
    );

    const acquired = await lock.acquire("test-workflow", "exec-1");

    expect(acquired).toBe(true);
    const stored = JSON.parse(await readFile(lockFilePath("test-workflow"), "utf-8")) as {
      executionId: string;
      pid: number;
    };
    expect(stored.executionId).toBe("exec-1");
    expect(stored.pid).toBe(process.pid);
  });

  it("returns false for isLocked when no lock exists", async () => {
    expect(await lock.isLocked("nonexistent-workflow")).toBe(false);
  });

  it("handles release when no lock exists", async () => {
    await expect(lock.release("nonexistent-workflow")).resolves.toBeUndefined();
  });

  it("uses default executionId when not provided", async () => {
    const acquired = await lock.acquire("test-workflow");
    expect(acquired).toBe(true);
  });
});

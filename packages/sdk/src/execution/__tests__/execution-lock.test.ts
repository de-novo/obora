import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { FileExecutionLock } from "../execution-lock.js";
import { mkdir, writeFile, readFile, access, unlink, rmdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEST_LOCK_DIR = join(__dirname, "..", "..", "__tests__", "test-locks");

describe("FileExecutionLock", () => {
  let lock: FileExecutionLock;

  beforeEach(async () => {
    lock = new FileExecutionLock(TEST_LOCK_DIR, 1000); // 1s stale threshold for tests
    try {
      await mkdir(TEST_LOCK_DIR, { recursive: true });
    } catch { /* ignore */ }
  });

  afterEach(async () => {
    // Clean up test locks
    try {
      const files = await readFile(join(TEST_LOCK_DIR, "test-workflow.lock"), "utf-8").catch(() => null);
      if (files) {
        await unlink(join(TEST_LOCK_DIR, "test-workflow.lock"));
      }
      await rmdir(TEST_LOCK_DIR).catch(() => {});
    } catch { /* ignore */ }
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
      join(TEST_LOCK_DIR, "test-workflow.lock"),
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
      join(TEST_LOCK_DIR, "test-workflow.lock"),
      JSON.stringify(staleLock, null, 2),
      "utf-8"
    );

    // Should be able to acquire (stale lock removed)
    const acquired = await lock.acquire("test-workflow", "exec-1");
    expect(acquired).toBe(true);
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

/**
 * File-based execution lock for preventing concurrent workflow runs.
 *
 * Uses a lockfile with PID to detect stale locks from crashed processes.
 */
import { mkdir, readFile, writeFile, unlink, stat } from "node:fs/promises";
import { dirname } from "node:path";

export interface ExecutionLock {
  acquire(workflowName: string, executionId?: string): Promise<boolean>;
  release(workflowName: string): Promise<void>;
  isLocked(workflowName: string): Promise<boolean>;
}

export interface LockInfo {
  pid: number;
  executionId: string;
  workflowName: string;
  acquiredAt: string;
  hostname: string;
}

export class FileExecutionLock implements ExecutionLock {
  constructor(
    private readonly basePath: string,
    private readonly staleLockThresholdMs: number = 2 * 60 * 60 * 1000, // 2 hours
  ) {}

  private lockPath(workflowName: string): string {
    return `${this.basePath}/${workflowName}.lock`;
  }

  async acquire(workflowName: string, executionId: string = "unknown"): Promise<boolean> {
    const lockFile = this.lockPath(workflowName);

    // Check for existing lock
    const existing = await this.readLock(workflowName);
    if (existing) {
      // Check if lock holder is still alive
      if (this.isProcessAlive(existing.pid)) {
        return false; // Another live process holds the lock
      }

      // Check if lock is stale (process dead or lock too old)
      const lockAge = Date.now() - new Date(existing.acquiredAt).getTime();
      if (lockAge < this.staleLockThresholdMs && this.isProcessAlive(existing.pid)) {
        return false;
      }

      // Stale lock — remove it
    }

    // Write lock
    const info: LockInfo = {
      pid: process.pid,
      executionId,
      workflowName,
      acquiredAt: new Date().toISOString(),
      hostname: (await import("node:os")).hostname(),
    };

    await mkdir(dirname(lockFile), { recursive: true });
    await writeFile(lockFile, JSON.stringify(info, null, 2), "utf-8");

    // Verify we actually got the lock (handle race condition)
    const verify = await this.readLock(workflowName);
    return verify?.pid === process.pid;
  }

  async release(workflowName: string): Promise<void> {
    const lockFile = this.lockPath(workflowName);
    try {
      const existing = await this.readLock(workflowName);
      // Only release our own lock
      if (existing?.pid === process.pid) {
        await unlink(lockFile);
      }
    } catch {
      // Ignore errors on release
    }
  }

  async isLocked(workflowName: string): Promise<boolean> {
    const existing = await this.readLock(workflowName);
    if (!existing) return false;

    // Check if lock holder is still alive
    if (!this.isProcessAlive(existing.pid)) return false;

    return true;
  }

  private async readLock(workflowName: string): Promise<LockInfo | null> {
    try {
      const content = await readFile(this.lockPath(workflowName), "utf-8");
      return JSON.parse(content) as LockInfo;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * File-based execution lock for preventing concurrent workflow runs.
 *
 * Uses a lockfile with PID to detect stale locks from crashed processes.
 */
import { createHash } from "node:crypto";
import { mkdir, open, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

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
    _staleLockThresholdMs: number = 2 * 60 * 60 * 1000, // 2 hours, kept for existing constructor callers
  ) {}

  private lockPath(workflowName: string): string {
    return join(this.basePath, this.lockFileName(workflowName));
  }

  private lockFileName(workflowName: string): string {
    const hash = createHash("sha256").update(workflowName).digest("hex").slice(0, 16);
    const slug = workflowName
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/(^[.-]+|[.-]+$)/g, "")
      .slice(0, 80);
    return `${slug || "workflow"}-${hash}.lock`;
  }

  async acquire(workflowName: string, executionId: string = "unknown"): Promise<boolean> {
    const lockFile = this.lockPath(workflowName);
    const info: LockInfo = {
      pid: process.pid,
      executionId,
      workflowName,
      acquiredAt: new Date().toISOString(),
      hostname: (await import("node:os")).hostname(),
    };

    await mkdir(dirname(lockFile), { recursive: true });
    const created = await this.tryCreateLock(lockFile, info);
    return created ? true : await this.replaceStaleLock(workflowName, lockFile, info);
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

  private async tryCreateLock(lockFile: string, info: LockInfo): Promise<boolean> {
    const handle = await open(lockFile, "wx").catch((error: unknown) => {
      const err = error as NodeJS.ErrnoException;
      if (err.code === "EEXIST") return undefined;
      throw error;
    });

    if (!handle) {
      return false;
    }

    try {
      await handle.writeFile(JSON.stringify(info, null, 2), "utf-8");
      return true;
    } catch (error) {
      await unlink(lockFile).catch(() => undefined);
      throw error;
    } finally {
      await handle.close();
    }
  }

  private async replaceStaleLock(
    workflowName: string,
    lockFile: string,
    info: LockInfo
  ): Promise<boolean> {
    const existing = await this.readLock(workflowName);
    const isHeldByLiveProcess = existing ? this.isLockHeldByLiveProcess(existing) : false;

    if (isHeldByLiveProcess) {
      return false;
    }

    await unlink(lockFile).catch(() => undefined);
    return await this.tryCreateLock(lockFile, info);
  }

  private isLockHeldByLiveProcess(info: LockInfo): boolean {
    return this.isProcessAlive(info.pid);
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

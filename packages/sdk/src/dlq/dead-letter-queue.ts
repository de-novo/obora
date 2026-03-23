/**
 * Dead Letter Queue (DLQ) for unrecoverable execution failures.
 *
 * When a workflow exhausts repair attempts or hits an unrecoverable error,
 * the failure is captured here for later manual review or automated retry.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface DLQEntry {
  id: string;
  createdAt: string;
  executionId: string;
  workflowName: string;
  stepName?: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string;
  repairAttempts: number;
  status: "pending" | "reviewed" | "retried" | "dismissed";
  resolvedAt?: string;
  resolvedBy?: string;
  resolution?: string;
  metadata?: Record<string, unknown>;
}

export interface DLQSnapshot {
  entries: DLQEntry[];
  lastUpdated: string;
}

export interface DLQStore {
  load(): Promise<DLQSnapshot>;
  save(snapshot: DLQSnapshot): Promise<void>;
  append(entry: DLQEntry): Promise<void>;
}

export interface DLQSummary {
  totalEntries: number;
  pendingCount: number;
  reviewedCount: number;
  retriedCount: number;
  dismissedCount: number;
  oldestPendingAt?: string;
}

export function createDLQEntry(params: {
  executionId: string;
  workflowName: string;
  stepName?: string;
  errorCode: string;
  errorMessage: string;
  errorStack?: string;
  repairAttempts: number;
  metadata?: Record<string, unknown>;
}): DLQEntry {
  return {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: "pending",
    ...params,
  };
}

export function summarizeDLQ(snapshot: DLQSnapshot): DLQSummary {
  const entries = snapshot.entries;
  const pending = entries.filter((e) => e.status === "pending");
  return {
    totalEntries: entries.length,
    pendingCount: pending.length,
    reviewedCount: entries.filter((e) => e.status === "reviewed").length,
    retriedCount: entries.filter((e) => e.status === "retried").length,
    dismissedCount: entries.filter((e) => e.status === "dismissed").length,
    oldestPendingAt: pending.length > 0
      ? pending.sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]!.createdAt
      : undefined,
  };
}

export function resolveDLQEntry(
  snapshot: DLQSnapshot,
  entryId: string,
  resolution: { status: "reviewed" | "retried" | "dismissed"; actor?: string; note?: string },
): DLQSnapshot {
  return {
    ...snapshot,
    lastUpdated: new Date().toISOString(),
    entries: snapshot.entries.map((entry) =>
      entry.id === entryId
        ? {
            ...entry,
            status: resolution.status,
            resolvedAt: new Date().toISOString(),
            resolvedBy: resolution.actor,
            resolution: resolution.note,
          }
        : entry,
    ),
  };
}

export class FileDLQStore implements DLQStore {
  constructor(private readonly filePath: string) {}

  async load(): Promise<DLQSnapshot> {
    try {
      const content = await readFile(this.filePath, "utf-8");
      return JSON.parse(content) as DLQSnapshot;
    } catch {
      return { entries: [], lastUpdated: new Date().toISOString() };
    }
  }

  async save(snapshot: DLQSnapshot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async append(entry: DLQEntry): Promise<void> {
    const snapshot = await this.load();
    snapshot.entries.push(entry);
    snapshot.lastUpdated = new Date().toISOString();
    await this.save(snapshot);
  }
}

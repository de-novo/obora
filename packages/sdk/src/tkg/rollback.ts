import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MemoryScope, SharedMemorySnapshot } from "../shared-memory/store.js";

export interface TKGRollbackEntry {
  id: string;
  createdAt: string;
  executionId: string;
  workflowName: string;
  scope: string;
  reason: string;
  snapshot: SharedMemorySnapshot;
}

export interface TKGRollbackSnapshot {
  entries: TKGRollbackEntry[];
}

export interface TKGRollbackStore {
  load(scope: MemoryScope): Promise<TKGRollbackSnapshot | null>;
  save(scope: MemoryScope, snapshot: TKGRollbackSnapshot): Promise<void>;
  append?(scope: MemoryScope, entry: TKGRollbackEntry): Promise<void>;
}

export interface TKGRollbackSummary {
  capturedSnapshots: number;
  scopes: string[];
  rollbackIds: string[];
}

function dedupeRollbackEntries(entries: TKGRollbackEntry[]): TKGRollbackEntry[] {
  const seen = new Map<string, TKGRollbackEntry>();
  for (const entry of entries) {
    seen.set(entry.id, entry);
  }
  return [...seen.values()];
}

export function mergeTKGRollbackSnapshot(
  base: TKGRollbackSnapshot | null | undefined,
  incoming: TKGRollbackSnapshot,
): TKGRollbackSnapshot {
  return {
    entries: dedupeRollbackEntries([...(base?.entries ?? []), ...incoming.entries]),
  };
}

export function summarizeTKGRollbackEntries(entries: TKGRollbackEntry[]): TKGRollbackSummary {
  return {
    capturedSnapshots: entries.length,
    scopes: entries.map((entry) => entry.scope),
    rollbackIds: entries.map((entry) => entry.id),
  };
}

export class FileTKGRollbackStore implements TKGRollbackStore {
  constructor(private readonly basePath: string) {}

  async load(scope: MemoryScope): Promise<TKGRollbackSnapshot | null> {
    try {
      const content = await readFile(this.filePath(scope), "utf-8");
      return JSON.parse(content) as TKGRollbackSnapshot;
    } catch {
      return null;
    }
  }

  async save(scope: MemoryScope, snapshot: TKGRollbackSnapshot): Promise<void> {
    const filePath = this.filePath(scope);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async append(scope: MemoryScope, entry: TKGRollbackEntry): Promise<void> {
    const existing = await this.load(scope);
    await this.save(scope, mergeTKGRollbackSnapshot(existing, { entries: [entry] }));
  }

  private filePath(scope: MemoryScope): string {
    return join(this.basePath, scope.level, `${encodeURIComponent(scope.key)}.json`);
  }
}

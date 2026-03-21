import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MemoryScope } from "../shared-memory/store.js";
import type { TKGConflict, TKGPromotionSummary } from "./promotion.js";

export type TKGReviewQueueStatus = "open" | "approved" | "rejected";

export interface TKGReviewQueueResolution {
  status: Exclude<TKGReviewQueueStatus, "open">;
  resolvedAt: string;
  actor?: string;
  note?: string;
}

export interface TKGReviewQueueItem {
  id: string;
  createdAt: string;
  scope: string;
  workflowName: string;
  status: TKGReviewQueueStatus;
  candidateNodeIds: string[];
  conflicts: TKGConflict[];
  summary: TKGPromotionSummary;
  resolution?: TKGReviewQueueResolution;
}

export interface TKGReviewQueueSnapshot {
  items: TKGReviewQueueItem[];
}

export interface TKGReviewQueueStore {
  load(scope: MemoryScope): Promise<TKGReviewQueueSnapshot | null>;
  save(scope: MemoryScope, snapshot: TKGReviewQueueSnapshot): Promise<void>;
  enqueue?(scope: MemoryScope, item: TKGReviewQueueItem): Promise<void>;
  resolve?(scope: MemoryScope, itemId: string, resolution: TKGReviewQueueResolution): Promise<void>;
}

function dedupeQueueItems(items: TKGReviewQueueItem[]): TKGReviewQueueItem[] {
  const seen = new Map<string, TKGReviewQueueItem>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}

export function mergeTKGReviewQueueSnapshot(
  base: TKGReviewQueueSnapshot | null | undefined,
  incoming: TKGReviewQueueSnapshot,
): TKGReviewQueueSnapshot {
  return {
    items: dedupeQueueItems([...(base?.items ?? []), ...incoming.items]),
  };
}

export function resolveTKGReviewQueueSnapshot(
  snapshot: TKGReviewQueueSnapshot,
  itemId: string,
  resolution: TKGReviewQueueResolution,
): TKGReviewQueueSnapshot {
  return {
    items: snapshot.items.map((item) =>
      item.id === itemId
        ? {
            ...item,
            status: resolution.status,
            resolution,
          }
        : item,
    ),
  };
}

export function listOpenTKGReviewQueueItems(
  snapshot: TKGReviewQueueSnapshot | null | undefined,
): TKGReviewQueueItem[] {
  return (snapshot?.items ?? []).filter((item) => item.status === "open");
}

export class FileTKGReviewQueueStore implements TKGReviewQueueStore {
  constructor(private readonly basePath: string) {}

  async load(scope: MemoryScope): Promise<TKGReviewQueueSnapshot | null> {
    try {
      const content = await readFile(this.filePath(scope), "utf-8");
      return JSON.parse(content) as TKGReviewQueueSnapshot;
    } catch {
      return null;
    }
  }

  async save(scope: MemoryScope, snapshot: TKGReviewQueueSnapshot): Promise<void> {
    const filePath = this.filePath(scope);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async enqueue(scope: MemoryScope, item: TKGReviewQueueItem): Promise<void> {
    const existing = await this.load(scope);
    await this.save(scope, mergeTKGReviewQueueSnapshot(existing, { items: [item] }));
  }

  async resolve(scope: MemoryScope, itemId: string, resolution: TKGReviewQueueResolution): Promise<void> {
    const existing = (await this.load(scope)) ?? { items: [] };
    await this.save(scope, resolveTKGReviewQueueSnapshot(existing, itemId, resolution));
  }

  private filePath(scope: MemoryScope): string {
    return join(this.basePath, scope.level, `${encodeURIComponent(scope.key)}.json`);
  }
}

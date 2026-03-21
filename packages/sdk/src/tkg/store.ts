import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { MemoryScope } from "../shared-memory/store.js";

export const PROJECTABLE_TKG_EVENT_TYPES = [
  "workflow.validation_failed",
  "workflow.validation_passed",
  "workflow.back_edge_triggered",
  "workflow.repair_started",
  "workflow.repair_completed",
] as const;

export type ProjectableTKGEventType = (typeof PROJECTABLE_TKG_EVENT_TYPES)[number];

export interface TemporalNodeRelation {
  type: string;
  target: string;
}

export interface TemporalNode {
  id: string;
  eventType: ProjectableTKGEventType;
  executionId: string;
  workflowName: string;
  stepName?: string;
  timestamp: string;
  summary: string;
  attributes: Record<string, unknown>;
  relations: TemporalNodeRelation[];
}

export interface StagingTKGSnapshot {
  nodes: TemporalNode[];
}

export interface StagingTKGStore {
  load(scope: MemoryScope): Promise<StagingTKGSnapshot | null>;
  save(scope: MemoryScope, snapshot: StagingTKGSnapshot): Promise<void>;
  append?(scope: MemoryScope, nodes: TemporalNode[]): Promise<void>;
}

function dedupeNodesById(nodes: TemporalNode[]): TemporalNode[] {
  const seen = new Map<string, TemporalNode>();
  for (const node of nodes) {
    seen.set(node.id, node);
  }
  return [...seen.values()];
}

export function mergeStagingTKGSnapshot(
  base: StagingTKGSnapshot | null | undefined,
  incoming: StagingTKGSnapshot,
): StagingTKGSnapshot {
  return {
    nodes: dedupeNodesById([...(base?.nodes ?? []), ...incoming.nodes]),
  };
}

export class FileStagingTKGStore implements StagingTKGStore {
  constructor(private readonly basePath: string) {}

  async load(scope: MemoryScope): Promise<StagingTKGSnapshot | null> {
    try {
      const content = await readFile(this.filePath(scope), "utf-8");
      return JSON.parse(content) as StagingTKGSnapshot;
    } catch {
      return null;
    }
  }

  async save(scope: MemoryScope, snapshot: StagingTKGSnapshot): Promise<void> {
    const filePath = this.filePath(scope);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async append(scope: MemoryScope, nodes: TemporalNode[]): Promise<void> {
    const existing = await this.load(scope);
    await this.save(scope, mergeStagingTKGSnapshot(existing, { nodes }));
  }

  private filePath(scope: MemoryScope): string {
    return join(this.basePath, scope.level, `${encodeURIComponent(scope.key)}.json`);
  }
}

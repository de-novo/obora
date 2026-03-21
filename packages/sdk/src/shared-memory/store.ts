import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type MemoryScopeLevel = "workflow" | "project" | "global";

export const SHARED_MEMORY_SCOPE_PRIORITY: Record<MemoryScopeLevel, number> = {
  global: 0,
  project: 1,
  workflow: 2,
};

export interface MemoryScope {
  level: MemoryScopeLevel;
  key: string;
}

export interface SharedMemoryFact {
  id: string;
  content: string;
  category: string;
  tags: string[];
  confidence: number;
  createdAt: string;
  sourceExecutionId?: string;
}

export interface SharedMemoryDecision {
  id: string;
  summary: string;
  createdAt: string;
  sourceExecutionId?: string;
}

export interface SharedMemorySnapshot {
  knowledge: {
    facts: SharedMemoryFact[];
  };
  decisions: {
    history: SharedMemoryDecision[];
  };
  context: {
    projectFacts: Record<string, unknown>;
  };
}

export interface SharedMemoryStore {
  load(scope: MemoryScope): Promise<SharedMemorySnapshot | null>;
  save(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void>;
  merge?(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void>;
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Map<string, T>();
  for (const item of items) {
    seen.set(item.id, item);
  }
  return [...seen.values()];
}

export function sortMemoryScopesByPriority(scopes: MemoryScope[]): MemoryScope[] {
  const deduped = new Map<string, MemoryScope>();
  for (const scope of scopes) {
    deduped.set(`${scope.level}:${scope.key}`, scope);
  }

  return [...deduped.values()].sort(
    (left, right) => SHARED_MEMORY_SCOPE_PRIORITY[left.level] - SHARED_MEMORY_SCOPE_PRIORITY[right.level],
  );
}

export function mergeSharedMemorySnapshots(
  base: SharedMemorySnapshot | null | undefined,
  incoming: SharedMemorySnapshot,
): SharedMemorySnapshot {
  return {
    knowledge: {
      facts: dedupeById([...(base?.knowledge.facts ?? []), ...incoming.knowledge.facts]),
    },
    decisions: {
      history: dedupeById([...(base?.decisions.history ?? []), ...incoming.decisions.history]),
    },
    context: {
      projectFacts: {
        ...(base?.context.projectFacts ?? {}),
        ...incoming.context.projectFacts,
      },
    },
  };
}

export class FileSharedMemoryStore implements SharedMemoryStore {
  constructor(private readonly basePath: string) {}

  async load(scope: MemoryScope): Promise<SharedMemorySnapshot | null> {
    try {
      const content = await readFile(this.filePath(scope), "utf-8");
      return JSON.parse(content) as SharedMemorySnapshot;
    } catch {
      return null;
    }
  }

  async save(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void> {
    const filePath = this.filePath(scope);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
  }

  async merge(scope: MemoryScope, snapshot: SharedMemorySnapshot): Promise<void> {
    const existing = await this.load(scope);
    await this.save(scope, mergeSharedMemorySnapshots(existing, snapshot));
  }

  private filePath(scope: MemoryScope): string {
    return join(this.basePath, scope.level, `${encodeURIComponent(scope.key)}.json`);
  }
}

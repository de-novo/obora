import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

// ── Knowledge entry ────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  pattern: string;
  resolution: string;
  confidence: number;
  source: {
    workflowName: string;
    executionId: string;
    timestamp: string; // ISO string for JSON serialization
  };
  successCount: number;
  failureCount: number;
}

// ── Serialized format ──────────────────────────────────────────────────

interface KnowledgeStoreData {
  version: 1;
  entries: KnowledgeEntry[];
}

// ── KnowledgeStore ─────────────────────────────────────────────────────

export class KnowledgeStore {
  private entries: KnowledgeEntry[] = [];
  private dirty = false;
  private readonly storePath: string;

  constructor(storePath: string) {
    this.storePath = storePath;
  }

  async load(): Promise<void> {
    try {
      const raw = await readFile(this.storePath, "utf-8");
      const data: KnowledgeStoreData = JSON.parse(raw);
      if (data.version === 1 && Array.isArray(data.entries)) {
        this.entries = data.entries;
      }
    } catch {
      // File doesn't exist or is invalid — start fresh
      this.entries = [];
    }
    this.dirty = false;
  }

  async save(): Promise<void> {
    if (!this.dirty) return;
    const data: KnowledgeStoreData = {
      version: 1,
      entries: this.entries,
    };
    await mkdir(dirname(this.storePath), { recursive: true });
    await writeFile(this.storePath, JSON.stringify(data, null, 2), "utf-8");
    this.dirty = false;
  }

  recordPattern(
    pattern: string,
    resolution: string,
    succeeded: boolean,
    source?: { workflowName: string; executionId: string }
  ): void {
    const existing = this.entries.find((e) => e.pattern === pattern);
    if (existing) {
      if (succeeded) {
        existing.successCount += 1;
      } else {
        existing.failureCount += 1;
      }
      // Update confidence based on success rate
      const total = existing.successCount + existing.failureCount;
      existing.confidence = existing.successCount / total;
      // Update resolution if this was a success (the latest working resolution)
      if (succeeded && resolution) {
        existing.resolution = resolution;
      }
    } else {
      this.entries.push({
        id: `kn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        pattern,
        resolution,
        confidence: succeeded ? 1.0 : 0.0,
        source: {
          workflowName: source?.workflowName ?? "unknown",
          executionId: source?.executionId ?? "unknown",
          timestamp: new Date().toISOString(),
        },
        successCount: succeeded ? 1 : 0,
        failureCount: succeeded ? 0 : 1,
      });
    }
    this.dirty = true;
  }

  findSimilar(keywords: string[]): KnowledgeEntry[] {
    if (keywords.length === 0) return [];

    const lowered = keywords.map((k) => k.toLowerCase());
    return this.entries
      .filter((entry) => {
        const patternLower = entry.pattern.toLowerCase();
        return lowered.some((kw) => patternLower.includes(kw));
      })
      .sort((a, b) => b.confidence - a.confidence);
  }

  getTopPatterns(limit = 10): KnowledgeEntry[] {
    return [...this.entries]
      .sort((a, b) => {
        // Sort by confidence desc, then by total count desc
        if (b.confidence !== a.confidence) return b.confidence - a.confidence;
        return (
          b.successCount + b.failureCount - (a.successCount + a.failureCount)
        );
      })
      .slice(0, limit);
  }

  getEntries(): KnowledgeEntry[] {
    return [...this.entries];
  }

  get size(): number {
    return this.entries.length;
  }
}

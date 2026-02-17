/**
 * M6-01: InMemoryStorageAdapter — Test/dev adapter
 */

import type {
  StorageAdapter,
  RunRecord,
  StepRecord,
  ArtifactRecord,
  RunFilter,
} from "./types.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly runs = new Map<string, RunRecord>();
  private readonly steps: StepRecord[] = [];
  private readonly artifacts = new Map<string, ArtifactRecord>();

  async saveRun(record: RunRecord): Promise<void> {
    this.runs.set(record.id, structuredClone(record));
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const r = this.runs.get(runId);
    return r ? structuredClone(r) : null;
  }

  async listRuns(filter: RunFilter): Promise<RunRecord[]> {
    let results = Array.from(this.runs.values());

    if (filter.status) {
      results = results.filter((r) => r.status === filter.status);
    }
    if (filter.workflowName) {
      results = results.filter((r) => r.workflowName === filter.workflowName);
    }
    if (filter.from) {
      results = results.filter((r) => r.startedAt >= filter.from!);
    }
    if (filter.to) {
      results = results.filter((r) => r.startedAt <= filter.to!);
    }

    // Sort by startedAt descending
    results.sort((a, b) => b.startedAt.localeCompare(a.startedAt));

    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? results.length;
    return results.slice(offset, offset + limit).map((r) => structuredClone(r));
  }

  async saveStep(record: StepRecord): Promise<void> {
    const idx = this.steps.findIndex((s) => s.id === record.id);
    if (idx >= 0) {
      this.steps[idx] = structuredClone(record);
    } else {
      this.steps.push(structuredClone(record));
    }
  }

  async getSteps(runId: string): Promise<StepRecord[]> {
    return this.steps
      .filter((s) => s.runId === runId)
      .map((s) => structuredClone(s));
  }

  async saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord> {
    const clone = structuredClone(record);
    this.artifacts.set(clone.id, clone);
    return structuredClone(clone);
  }

  async getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]> {
    return Array.from(this.artifacts.values())
      .filter((a) => a.runId === runId && !a.deletedAt)
      .filter((a) => (stepName ? a.stepName === stepName : true))
      .map((a) => structuredClone(a));
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    const a = this.artifacts.get(artifactId);
    if (a) {
      a.deletedAt = new Date().toISOString();
    }
  }
}

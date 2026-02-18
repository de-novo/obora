/**
 * M6-01: InMemoryStorageAdapter — Test/dev adapter
 */

import type {
  StorageAdapter,
  RunRecord,
  StepRecord,
  ArtifactRecord,
  RunFilter,
  CheckpointRecord,
  CostRecord,
  CostSummary,
  StructuredAuditEvent,
} from "./types.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly runs = new Map<string, RunRecord>();
  private readonly steps: StepRecord[] = [];
  private readonly artifacts = new Map<string, ArtifactRecord>();
  private readonly checkpoints: CheckpointRecord[] = [];
  private readonly costs: CostRecord[] = [];
  private readonly auditEvents: StructuredAuditEvent[] = [];

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
    const limit = filter.limit ?? 100;
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

  async saveCheckpoint(record: CheckpointRecord): Promise<void> {
    this.checkpoints.push(structuredClone(record));
  }

  async getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null> {
    const matching = this.checkpoints
      .filter((c) => c.runId === runId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return matching.length > 0 ? structuredClone(matching[0]) : null;
  }

  async saveCost(record: CostRecord): Promise<void> {
    this.costs.push(structuredClone(record));
  }

  async getCosts(runId: string, stepName?: string): Promise<CostRecord[]> {
    return this.costs
      .filter((c) => c.runId === runId)
      .filter((c) => (stepName ? c.stepName === stepName : true))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((c) => structuredClone(c));
  }

  async getRunCostSummary(runId: string): Promise<CostSummary> {
    const costs = await this.getCosts(runId);
    const byStep = new Map<string, { stepName: string; tokens: number; costUsd: number }>();
    const byModel = new Map<string, { model: string; tokens: number; costUsd: number }>();

    let totalTokens = 0;
    let totalCostUsd = 0;

    for (const c of costs) {
      totalTokens += c.totalTokens;
      totalCostUsd += c.costUsd;

      const step = byStep.get(c.stepName) ?? { stepName: c.stepName, tokens: 0, costUsd: 0 };
      step.tokens += c.totalTokens;
      step.costUsd += c.costUsd;
      byStep.set(c.stepName, step);

      const model = byModel.get(c.model) ?? { model: c.model, tokens: 0, costUsd: 0 };
      model.tokens += c.totalTokens;
      model.costUsd += c.costUsd;
      byModel.set(c.model, model);
    }

    return {
      totalTokens,
      totalCostUsd,
      byStep: Array.from(byStep.values()),
      byModel: Array.from(byModel.values()),
    };
  }

  async saveAuditEvent(event: StructuredAuditEvent): Promise<void> {
    this.auditEvents.push(structuredClone(event));
  }

  async getAuditTimeline(runId: string, stepName?: string): Promise<StructuredAuditEvent[]> {
    return this.auditEvents
      .filter((e) => e.runId === runId)
      .filter((e) => (stepName ? e.stepName === stepName : true))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
      .map((e) => structuredClone(e));
  }
}

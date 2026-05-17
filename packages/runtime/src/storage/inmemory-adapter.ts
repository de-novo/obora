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
    const offset = filter.offset ?? 0;
    const limit = filter.limit ?? 100;
    return Array.from(this.runs.values())
      .filter((r) => (filter.status ? r.status === filter.status : true))
      .filter((r) => (filter.workflowName ? r.workflowName === filter.workflowName : true))
      .filter((r) => (filter.from ? r.startedAt >= filter.from : true))
      .filter((r) => (filter.to ? r.startedAt <= filter.to : true))
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(offset, offset + limit)
      .map((r) => structuredClone(r));
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
    const summary = costs.reduce(
      (acc, c) => {
        const step = acc.byStep.get(c.stepName) ?? { stepName: c.stepName, tokens: 0, costUsd: 0 };
        const model = acc.byModel.get(c.model) ?? { model: c.model, tokens: 0, costUsd: 0 };
        return {
          totalTokens: acc.totalTokens + c.totalTokens,
          totalCostUsd: acc.totalCostUsd + c.costUsd,
          byStep: new Map([
            ...acc.byStep,
            [c.stepName, { ...step, tokens: step.tokens + c.totalTokens, costUsd: step.costUsd + c.costUsd }],
          ]),
          byModel: new Map([
            ...acc.byModel,
            [c.model, { ...model, tokens: model.tokens + c.totalTokens, costUsd: model.costUsd + c.costUsd }],
          ]),
        };
      },
      {
        totalTokens: 0,
        totalCostUsd: 0,
        byStep: new Map<string, { stepName: string; tokens: number; costUsd: number }>(),
        byModel: new Map<string, { model: string; tokens: number; costUsd: number }>(),
      }
    );

    return {
      totalTokens: summary.totalTokens,
      totalCostUsd: summary.totalCostUsd,
      byStep: Array.from(summary.byStep.values()),
      byModel: Array.from(summary.byModel.values()),
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

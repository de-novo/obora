/**
 * M6-01: Run Persistence Layer — Core types
 *
 * SSOT: m6-production-memory-design.md § T1 핵심 인터페이스
 */

// ── Record schemas ──

export interface RunRecord {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "suspended";
  input: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface StepRecord {
  id: string;
  runId: string;
  stepName: string;
  status: "running" | "completed" | "failed" | "skipped";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string;
  createdAt: string;
  deletedAt?: string;
}

export interface RunFilter {
  status?: RunRecord["status"];
  workflowName?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

// ── Checkpoint types (T2 scope) ──

export interface CheckpointRecord {
  id: string;
  runId: string;
  stepName: string;
  stateSnapshot: unknown;
  completedSteps: string[];
  policyHash: string;
  createdAt: string;
}

// ── Cost types (T3 scope) ──

export interface CostRecord {
  id: string;
  runId: string;
  stepName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  createdAt: string;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStep: Array<{ stepName: string; tokens: number; costUsd: number }>;
  byModel: Array<{ model: string; tokens: number; costUsd: number }>;
}

// ── Checkpointable interface ──

export interface Checkpointable {
  readonly schemaVersion: number;
  toCheckpoint(): Record<string, unknown> & { schemaVersion: number };
}

export interface CheckpointableFactory<T> {
  fromCheckpoint(snapshot: Record<string, unknown>): T;
}

export interface ResumeOptions {
  fromStep?: string;
  driftPolicy?: "reject" | "warn" | "ignore";
}

// ── StorageAdapter interface (T1 + T2 scope) ──

export interface StorageAdapter {
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;

  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;

  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  deleteArtifact(artifactId: string): Promise<void>;

  // ── Checkpoint (T2) ──
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;

  // ── Cost (T3) ──
  saveCost(record: CostRecord): Promise<void>;
  getCosts(runId: string, stepName?: string): Promise<CostRecord[]>;
  getRunCostSummary(runId: string): Promise<CostSummary>;
}

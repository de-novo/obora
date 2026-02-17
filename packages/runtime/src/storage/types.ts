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

// ── StorageAdapter interface (T1 scope) ──

export interface StorageAdapter {
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;

  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;

  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  deleteArtifact(artifactId: string): Promise<void>;
}

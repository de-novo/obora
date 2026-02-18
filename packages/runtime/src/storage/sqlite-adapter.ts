/**
 * M6-01: SQLiteStorageAdapter — Default persistence adapter using better-sqlite3
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
} from "./types.js";

// Lazy import to keep better-sqlite3 optional at runtime
let Database: typeof import("better-sqlite3").default;

async function loadDatabase() {
  if (!Database) {
    const mod = await import("better-sqlite3");
    Database = mod.default;
  }
  return Database;
}

export interface SQLiteStorageAdapterOptions {
  path: string;
}

export class SQLiteStorageAdapter implements StorageAdapter {
  private db!: import("better-sqlite3").Database;
  private initialized = false;

  constructor(private readonly options: SQLiteStorageAdapterOptions) {}

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    const Ctor = await loadDatabase();
    this.db = new Ctor(this.options.path);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.createTables();
    this.initialized = true;
  }

  private createTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS steps (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT,
        output TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        storage_ref TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS checkpoints (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        state_snapshot TEXT NOT NULL,
        completed_steps TEXT NOT NULL,
        policy_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE TABLE IF NOT EXISTS costs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        step_name TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL,
        completion_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_usd REAL NOT NULL,
        latency_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_steps_run_id ON steps(run_id);
      CREATE INDEX IF NOT EXISTS idx_artifacts_run_id ON artifacts(run_id);
      CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
      CREATE INDEX IF NOT EXISTS idx_runs_workflow ON runs(workflow_name);
      CREATE INDEX IF NOT EXISTS idx_checkpoints_run_id ON checkpoints(run_id);
      CREATE INDEX IF NOT EXISTS idx_costs_run_id ON costs(run_id);
      CREATE INDEX IF NOT EXISTS idx_costs_run_step ON costs(run_id, step_name);
    `);
  }

  async saveRun(record: RunRecord): Promise<void> {
    await this.ensureInitialized();
    this.db
      .prepare(
        `INSERT INTO runs (id, workflow_name, status, input, started_at, completed_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           completed_at = excluded.completed_at,
           metadata = excluded.metadata`
      )
      .run(
        record.id,
        record.workflowName,
        record.status,
        JSON.stringify(record.input),
        record.startedAt,
        record.completedAt ?? null,
        record.metadata ? JSON.stringify(record.metadata) : null
      );
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    await this.ensureInitialized();
    const row = this.db
      .prepare("SELECT * FROM runs WHERE id = ?")
      .get(runId) as Record<string, unknown> | undefined;
    return row ? this.toRunRecord(row) : null;
  }

  async listRuns(filter: RunFilter): Promise<RunRecord[]> {
    await this.ensureInitialized();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }
    if (filter.workflowName) {
      conditions.push("workflow_name = ?");
      params.push(filter.workflowName);
    }
    if (filter.from) {
      conditions.push("started_at >= ?");
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push("started_at <= ?");
      params.push(filter.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;

    const rows = this.db
      .prepare(
        `SELECT * FROM runs ${where} ORDER BY started_at DESC LIMIT ? OFFSET ?`
      )
      .all(...params, limit, offset) as Record<string, unknown>[];

    return rows.map((r) => this.toRunRecord(r));
  }

  async saveStep(record: StepRecord): Promise<void> {
    await this.ensureInitialized();
    this.db
      .prepare(
        `INSERT INTO steps (id, run_id, step_name, status, input, output, error, started_at, completed_at, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           status = excluded.status,
           output = excluded.output,
           error = excluded.error,
           completed_at = excluded.completed_at,
           duration_ms = excluded.duration_ms`
      )
      .run(
        record.id,
        record.runId,
        record.stepName,
        record.status,
        record.input ? JSON.stringify(record.input) : null,
        record.output ? JSON.stringify(record.output) : null,
        record.error ? JSON.stringify(record.error) : null,
        record.startedAt,
        record.completedAt ?? null,
        record.durationMs ?? null
      );
  }

  async getSteps(runId: string): Promise<StepRecord[]> {
    await this.ensureInitialized();
    const rows = this.db
      .prepare("SELECT * FROM steps WHERE run_id = ? ORDER BY started_at ASC")
      .all(runId) as Record<string, unknown>[];
    return rows.map((r) => this.toStepRecord(r));
  }

  async saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord> {
    await this.ensureInitialized();
    this.db
      .prepare(
        `INSERT INTO artifacts (id, run_id, step_name, name, mime_type, size_bytes, storage_ref, created_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           deleted_at = excluded.deleted_at`
      )
      .run(
        record.id,
        record.runId,
        record.stepName,
        record.name,
        record.mimeType,
        record.sizeBytes,
        record.storageRef,
        record.createdAt,
        record.deletedAt ?? null
      );
    return { ...record };
  }

  async getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]> {
    await this.ensureInitialized();
    if (stepName) {
      const rows = this.db
        .prepare(
          "SELECT * FROM artifacts WHERE run_id = ? AND step_name = ? AND deleted_at IS NULL ORDER BY created_at ASC"
        )
        .all(runId, stepName) as Record<string, unknown>[];
      return rows.map((r) => this.toArtifactRecord(r));
    }
    const rows = this.db
      .prepare(
        "SELECT * FROM artifacts WHERE run_id = ? AND deleted_at IS NULL ORDER BY created_at ASC"
      )
      .all(runId) as Record<string, unknown>[];
    return rows.map((r) => this.toArtifactRecord(r));
  }

  async deleteArtifact(artifactId: string): Promise<void> {
    await this.ensureInitialized();
    this.db
      .prepare("UPDATE artifacts SET deleted_at = ? WHERE id = ?")
      .run(new Date().toISOString(), artifactId);
  }

  async saveCheckpoint(record: CheckpointRecord): Promise<void> {
    await this.ensureInitialized();
    this.db
      .prepare(
        `INSERT INTO checkpoints (id, run_id, step_name, state_snapshot, completed_steps, policy_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           state_snapshot = excluded.state_snapshot,
           completed_steps = excluded.completed_steps,
           policy_hash = excluded.policy_hash`
      )
      .run(
        record.id,
        record.runId,
        record.stepName,
        JSON.stringify(record.stateSnapshot),
        JSON.stringify(record.completedSteps),
        record.policyHash,
        record.createdAt
      );
  }

  async getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null> {
    await this.ensureInitialized();
    const row = this.db
      .prepare("SELECT * FROM checkpoints WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(runId) as Record<string, unknown> | undefined;
    return row ? this.toCheckpointRecord(row) : null;
  }

  async saveCost(record: CostRecord): Promise<void> {
    await this.ensureInitialized();
    this.db
      .prepare(
        `INSERT INTO costs (id, run_id, step_name, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.runId,
        record.stepName,
        record.model,
        record.promptTokens,
        record.completionTokens,
        record.totalTokens,
        record.costUsd,
        record.latencyMs,
        record.createdAt,
      );
  }

  async getCosts(runId: string, stepName?: string): Promise<CostRecord[]> {
    await this.ensureInitialized();
    const rows = stepName
      ? (this.db
          .prepare("SELECT * FROM costs WHERE run_id = ? AND step_name = ? ORDER BY created_at ASC")
          .all(runId, stepName) as Record<string, unknown>[])
      : (this.db
          .prepare("SELECT * FROM costs WHERE run_id = ? ORDER BY created_at ASC")
          .all(runId) as Record<string, unknown>[]);
    return rows.map((r) => this.toCostRecord(r));
  }

  async getRunCostSummary(runId: string): Promise<CostSummary> {
    await this.ensureInitialized();

    const total = this.db
      .prepare("SELECT COALESCE(SUM(total_tokens), 0) AS tokens, COALESCE(SUM(cost_usd), 0) AS cost FROM costs WHERE run_id = ?")
      .get(runId) as { tokens: number; cost: number };

    const byStep = this.db
      .prepare(
        "SELECT step_name, SUM(total_tokens) AS tokens, SUM(cost_usd) AS cost_usd FROM costs WHERE run_id = ? GROUP BY step_name ORDER BY step_name ASC"
      )
      .all(runId) as Array<{ step_name: string; tokens: number; cost_usd: number }>;

    const byModel = this.db
      .prepare(
        "SELECT model, SUM(total_tokens) AS tokens, SUM(cost_usd) AS cost_usd FROM costs WHERE run_id = ? GROUP BY model ORDER BY model ASC"
      )
      .all(runId) as Array<{ model: string; tokens: number; cost_usd: number }>;

    return {
      totalTokens: total.tokens,
      totalCostUsd: total.cost,
      byStep: byStep.map((r) => ({ stepName: r.step_name, tokens: r.tokens, costUsd: r.cost_usd })),
      byModel: byModel.map((r) => ({ model: r.model, tokens: r.tokens, costUsd: r.cost_usd })),
    };
  }

  private toCheckpointRecord(row: Record<string, unknown>): CheckpointRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepName: row.step_name as string,
      stateSnapshot: this.safeJsonParse<unknown>(row.state_snapshot as string, `checkpoints.state_snapshot [id=${row.id}]`),
      completedSteps: this.safeJsonParse<string[]>(row.completed_steps as string, `checkpoints.completed_steps [id=${row.id}]`),
      policyHash: row.policy_hash as string,
      createdAt: row.created_at as string,
    };
  }

  /** Close the database connection */
  close(): void {
    if (this.initialized) {
      this.db.close();
      this.initialized = false;
    }
  }

  // ── Row mappers ──

  /**
   * Safely parse a JSON string, returning a descriptive error on failure
   * instead of crashing with a generic SyntaxError.
   */
  private safeJsonParse<T>(json: string, context: string): T {
    try {
      return JSON.parse(json) as T;
    } catch (cause) {
      const preview = json.length > 80 ? json.slice(0, 80) + "…" : json;
      throw new Error(
        `Corrupt JSON in ${context}: ${(cause as Error).message} (value: ${preview})`,
        { cause },
      );
    }
  }

  private toRunRecord(row: Record<string, unknown>): RunRecord {
    return {
      id: row.id as string,
      workflowName: row.workflow_name as string,
      status: row.status as RunRecord["status"],
      input: this.safeJsonParse<Record<string, unknown>>(row.input as string, `runs.input [id=${row.id}]`),
      startedAt: row.started_at as string,
      completedAt: (row.completed_at as string) || undefined,
      metadata: row.metadata
        ? this.safeJsonParse<Record<string, unknown>>(row.metadata as string, `runs.metadata [id=${row.id}]`)
        : undefined,
    };
  }

  private toStepRecord(row: Record<string, unknown>): StepRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepName: row.step_name as string,
      status: row.status as StepRecord["status"],
      input: row.input
        ? this.safeJsonParse<Record<string, unknown>>(row.input as string, `steps.input [id=${row.id}]`)
        : undefined,
      output: row.output
        ? this.safeJsonParse<Record<string, unknown>>(row.output as string, `steps.output [id=${row.id}]`)
        : undefined,
      error: row.error
        ? this.safeJsonParse<{ code: string; message: string; stack?: string }>(row.error as string, `steps.error [id=${row.id}]`)
        : undefined,
      startedAt: row.started_at as string,
      completedAt: (row.completed_at as string) || undefined,
      durationMs: row.duration_ms != null ? (row.duration_ms as number) : undefined,
    };
  }

  private toArtifactRecord(row: Record<string, unknown>): ArtifactRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepName: row.step_name as string,
      name: row.name as string,
      mimeType: row.mime_type as string,
      sizeBytes: row.size_bytes as number,
      storageRef: row.storage_ref as string,
      createdAt: row.created_at as string,
      deletedAt: (row.deleted_at as string) || undefined,
    };
  }

  private toCostRecord(row: Record<string, unknown>): CostRecord {
    return {
      id: row.id as string,
      runId: row.run_id as string,
      stepName: row.step_name as string,
      model: row.model as string,
      promptTokens: row.prompt_tokens as number,
      completionTokens: row.completion_tokens as number,
      totalTokens: row.total_tokens as number,
      costUsd: row.cost_usd as number,
      latencyMs: row.latency_ms as number,
      createdAt: row.created_at as string,
    };
  }
}

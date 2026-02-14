/**
 * DuckDB client for data persistence
 * @module @obora/database/duckdb-client
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as path from "node:path";

import duckdb from "duckdb";

/**
 * Project record
 */
export interface Project {
  id?: number;
  name: string;
  path: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * Workflow run record
 */
export interface WorkflowRun {
  id?: number;
  project_id: number;
  feature: string;
  workflow: string;
  mode: "auto" | "supervised" | "gated";
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  current_step?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

/**
 * Step execution record
 */
export interface StepExecution {
  id?: number;
  run_id: number;
  step_name: string;
  step_index: number;
  agent: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  retry_count?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  output_path?: string;
}

/**
 * Metric record
 */
export interface Metric {
  id?: number;
  run_id: number;
  step_id?: number;
  metric_name: string;
  metric_value: number;
  recorded_at?: string;
}

/**
 * Database client wrapper
 */
export class OboraDatabase {
  private db: duckdb.Database;
  private connection: duckdb.Connection;
  private dbPath: string;
  private initialized: boolean = false;

  constructor(dbPath: string = ".obora/obora.db") {
    // :memory: is a special DuckDB path for in-memory databases
    this.dbPath = dbPath === ':memory:' ? ':memory:' : path.resolve(dbPath);
    this.db = new duckdb.Database(this.dbPath);
    this.connection = this.db.connect();
  }

  /**
   * Initialize database schema
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Create sequences for auto-incrementing IDs
    await this.run(`CREATE SEQUENCE IF NOT EXISTS projects_id_seq START 1`);
    await this.run(`CREATE SEQUENCE IF NOT EXISTS workflow_runs_id_seq START 1`);
    await this.run(`CREATE SEQUENCE IF NOT EXISTS step_executions_id_seq START 1`);
    await this.run(`CREATE SEQUENCE IF NOT EXISTS metrics_id_seq START 1`);

    await this.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY DEFAULT nextval('projects_id_seq'),
        name VARCHAR(100) NOT NULL,
        path VARCHAR(500) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id INTEGER PRIMARY KEY DEFAULT nextval('workflow_runs_id_seq'),
        project_id INTEGER NOT NULL,
        feature VARCHAR(100) NOT NULL,
        workflow VARCHAR(100) NOT NULL,
        mode VARCHAR(20) NOT NULL,
        status VARCHAR(20) NOT NULL,
        current_step VARCHAR(50),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id)
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS step_executions (
        id INTEGER PRIMARY KEY DEFAULT nextval('step_executions_id_seq'),
        run_id INTEGER NOT NULL,
        step_name VARCHAR(50) NOT NULL,
        step_index INTEGER NOT NULL,
        agent VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        retry_count INTEGER DEFAULT 0,
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        output_path VARCHAR(500),
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY DEFAULT nextval('metrics_id_seq'),
        run_id INTEGER NOT NULL,
        step_id INTEGER,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DOUBLE NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id),
        FOREIGN KEY (step_id) REFERENCES step_executions(id)
      )
    `);

    // Create indexes for better query performance
    await this.run(`CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path)`);
    await this.run(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id)`
    );
    await this.run(
      `CREATE INDEX IF NOT EXISTS idx_workflow_runs_feature ON workflow_runs(feature)`
    );
    await this.run(`CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_step_executions_run ON step_executions(run_id)`);
    await this.run(
      `CREATE INDEX IF NOT EXISTS idx_step_executions_status ON step_executions(status)`
    );
    await this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_run ON metrics(run_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_step ON metrics(step_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(metric_name)`);

    this.initialized = true;
  }

  /**
   * Execute a SQL query without returning results
   */

  run(sql: string, params?: any[]): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const args: any[] = params ? [sql, ...params, (err: any) => {
          if (err) reject(err);
          else resolve();
        }] : [sql, (err: any) => {
          if (err) reject(err);
          else resolve();
        }];
        (this.connection as any).run(...args);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Execute a SQL query and return all rows
   */

  query(sql: string, params?: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      try {
        const args: any[] = params ? [sql, ...params, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }] : [sql, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows || []);
        }];
        (this.connection as any).all(...args);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Execute a SQL query and return first row
   */

  queryOne(sql: string, params?: any[]): Promise<any | null> {
    return new Promise((resolve, reject) => {
      try {
        const args: any[] = params ? [sql, ...params, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows && rows.length > 0 ? rows[0] : null);
        }] : [sql, (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows && rows.length > 0 ? rows[0] : null);
        }];
        (this.connection as any).all(...args);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Close database connection
   */
  close(): void {
    this.connection.close();
    this.db.close();
  }

  /**
   * Get database path
   */
  getPath(): string {
    return this.dbPath;
  }
}

// ===== Project CRUD =====

/**
 * Insert a new project
 */
export async function insertProject(
  db: OboraDatabase,
  project: Omit<Project, "id" | "created_at" | "updated_at">
): Promise<number> {
  const result = await db.query(`INSERT INTO projects (name, path) VALUES (?, ?) RETURNING id`, [
    project.name,
    project.path,
  ]);
  return result[0].id;
}

/**
 * Get a project by ID
 */
export async function getProject(db: OboraDatabase, id: number): Promise<Project | null> {
  const row = await db.queryOne("SELECT * FROM projects WHERE id = ?", [id]);
  return row as Project | null;
}

/**
 * Get a project by path
 */
export async function getProjectByPath(
  db: OboraDatabase,
  projectPath: string
): Promise<Project | null> {
  const row = await db.queryOne("SELECT * FROM projects WHERE path = ?", [projectPath]);
  return row as Project | null;
}

/**
 * List all projects
 */
export async function listProjects(db: OboraDatabase): Promise<Project[]> {
  const rows = await db.query("SELECT * FROM projects ORDER BY created_at DESC");
  return rows as Project[];
}

/**
 * Update a project
 */
export async function updateProject(
  db: OboraDatabase,
  id: number,
  updates: Partial<Project>
): Promise<void> {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push("name = ?");
    values.push(updates.name);
  }
  if (updates.path !== undefined) {
    fields.push("path = ?");
    values.push(updates.path);
  }

  if (fields.length === 0) return;

  fields.push("updated_at = CURRENT_TIMESTAMP");
  values.push(id);

  await db.run(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`, values);
}

/**
 * Delete a project
 */
export async function deleteProject(db: OboraDatabase, id: number): Promise<void> {
  await db.run("DELETE FROM projects WHERE id = ?", [id]);
}

// ===== WorkflowRun CRUD =====

/**
 * Insert a new workflow run
 */
export async function insertWorkflowRun(
  db: OboraDatabase,
  run: Omit<WorkflowRun, "id" | "started_at">
): Promise<number> {
  const result = await db.query(
    `INSERT INTO workflow_runs (project_id, feature, workflow, mode, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [run.project_id, run.feature, run.workflow, run.mode, run.status, new Date().toISOString()]
  );
  return result[0].id;
}

/**
 * Get a workflow run by ID
 */
export async function getWorkflowRun(db: OboraDatabase, id: number): Promise<WorkflowRun | null> {
  const row = await db.queryOne("SELECT * FROM workflow_runs WHERE id = ?", [id]);
  return row as WorkflowRun | null;
}

/**
 * List workflow runs for a project
 */
export async function listWorkflowRuns(
  db: OboraDatabase,
  projectId: number
): Promise<WorkflowRun[]> {
  const rows = await db.query(
    "SELECT * FROM workflow_runs WHERE project_id = ? ORDER BY started_at DESC, id DESC",
    [projectId]
  );
  return rows as WorkflowRun[];
}

/**
 * Update workflow run status
 */
export async function updateWorkflowRunStatus(
  db: OboraDatabase,
  id: number,
  status: WorkflowRun["status"],
  currentStep?: string,
  errorMessage?: string
): Promise<void> {
  const fields: string[] = ["status = ?"];
  const values: any[] = [status];

  if (currentStep !== undefined) {
    fields.push("current_step = ?");
    values.push(currentStep);
  }
  if (errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(errorMessage);
  }
  if (status === "completed" || status === "failed" || status === "cancelled") {
    fields.push("completed_at = ?");
    values.push(new Date().toISOString());
  }

  values.push(id);

  await db.run(`UPDATE workflow_runs SET ${fields.join(", ")} WHERE id = ?`, values);
}

/**
 * Delete a workflow run
 */
export async function deleteWorkflowRun(db: OboraDatabase, id: number): Promise<void> {
  await db.run("DELETE FROM workflow_runs WHERE id = ?", [id]);
}

// ===== StepExecution CRUD =====

/**
 * Insert a new step execution
 */
export async function insertStepExecution(
  db: OboraDatabase,
  step: Omit<StepExecution, "id" | "started_at">
): Promise<number> {
  const result = await db.query(
    `INSERT INTO step_executions (run_id, step_name, step_index, agent, status, started_at)
     VALUES (?, ?, ?, ?, ?, ?)
     RETURNING id`,
    [
      step.run_id,
      step.step_name,
      step.step_index,
      step.agent,
      step.status,
      new Date().toISOString(),
    ]
  );
  return result[0].id;
}

/**
 * Get a step execution by ID
 */
export async function getStepExecution(
  db: OboraDatabase,
  id: number
): Promise<StepExecution | null> {
  const row = await db.queryOne("SELECT * FROM step_executions WHERE id = ?", [id]);
  return row as StepExecution | null;
}

/**
 * List step executions for a run
 */
export async function listStepExecutions(
  db: OboraDatabase,
  runId: number
): Promise<StepExecution[]> {
  const rows = await db.query(
    "SELECT * FROM step_executions WHERE run_id = ? ORDER BY step_index ASC",
    [runId]
  );
  return rows as StepExecution[];
}

/**
 * Update step execution status
 */
export async function updateStepExecutionStatus(
  db: OboraDatabase,
  id: number,
  status: StepExecution["status"],
  output?: string,
  errorMessage?: string
): Promise<void> {
  const fields: string[] = ["status = ?"];
  const values: any[] = [status];

  if (output !== undefined) {
    fields.push("output_path = ?");
    values.push(output);
  }
  if (errorMessage !== undefined) {
    fields.push("error_message = ?");
    values.push(errorMessage);
  }
  if (status === "completed" || status === "failed" || status === "skipped") {
    fields.push("completed_at = ?");
    values.push(new Date().toISOString());
  }

  values.push(id);

  await db.run(`UPDATE step_executions SET ${fields.join(", ")} WHERE id = ?`, values);
}

/**
 * Increment retry count for a step
 */
export async function incrementStepRetry(db: OboraDatabase, id: number): Promise<void> {
  await db.run(`UPDATE step_executions SET retry_count = retry_count + 1 WHERE id = ?`, [id]);
}

/**
 * Delete step executions for a run
 */
export async function deleteStepExecutions(db: OboraDatabase, runId: number): Promise<void> {
  await db.run("DELETE FROM step_executions WHERE run_id = ?", [runId]);
}

// ===== Metrics CRUD =====

/**
 * Insert a new metric
 */
export async function insertMetric(
  db: OboraDatabase,
  metric: Omit<Metric, "id" | "recorded_at">
): Promise<number> {
  const result = await db.query(
    `INSERT INTO metrics (run_id, step_id, metric_name, metric_value, recorded_at)
     VALUES (?, ?, ?, ?, ?)
     RETURNING id`,
    [
      metric.run_id,
      metric.step_id || null,
      metric.metric_name,
      metric.metric_value,
      new Date().toISOString(),
    ]
  );
  return result[0].id;
}

/**
 * Get metrics for a run
 */
export async function getMetricsForRun(db: OboraDatabase, runId: number): Promise<Metric[]> {
  const rows = await db.query("SELECT * FROM metrics WHERE run_id = ? ORDER BY recorded_at ASC", [
    runId,
  ]);
  return rows as Metric[];
}

/**
 * Get metrics for a specific step
 */
export async function getMetricsForStep(db: OboraDatabase, stepId: number): Promise<Metric[]> {
  const rows = await db.query("SELECT * FROM metrics WHERE step_id = ? ORDER BY recorded_at ASC", [
    stepId,
  ]);
  return rows as Metric[];
}

/**
 * Aggregate metric value for a run
 */
export async function aggregateMetric(
  db: OboraDatabase,
  runId: number,
  metricName: string,
  aggregate: "SUM" | "AVG" | "MIN" | "MAX" | "COUNT" = "SUM"
): Promise<number | null> {
  const result = await db.queryOne(
    `SELECT ${aggregate}(metric_value) as value FROM metrics WHERE run_id = ? AND metric_name = ?`,
    [runId, metricName]
  );
  if (!result) return null;
  // DuckDB returns BigInt for COUNT, convert to Number
  const value = result.value;
  return typeof value === 'bigint' ? Number(value) : (value as number);
}

/**
 * Delete metrics for a run
 */
export async function deleteMetrics(db: OboraDatabase, runId: number): Promise<void> {
  await db.run("DELETE FROM metrics WHERE run_id = ?", [runId]);
}

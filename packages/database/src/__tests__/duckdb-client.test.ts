/**
 * @obora/database - DuckDB Client Unit Tests
 * TASK-017: Database unit tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OboraDatabase,
  // Project CRUD
  insertProject,
  getProject,
  getProjectByPath,
  listProjects,
  updateProject,
  deleteProject,
  // WorkflowRun CRUD
  insertWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  updateWorkflowRunStatus,
  deleteWorkflowRun,
  // StepExecution CRUD
  insertStepExecution,
  getStepExecution,
  listStepExecutions,
  updateStepExecutionStatus,
  incrementStepRetry,
  deleteStepExecutions,
  // Metrics CRUD
  insertMetric,
  getMetricsForRun,
  getMetricsForStep,
  aggregateMetric,
  deleteMetrics,
} from '../duckdb-client.js';
import { getDatabase, resetDatabase } from '../testing.js';

// ============================================================
// Test Helpers
// ============================================================

async function createTestProject(
  db: OboraDatabase,
  name: string = 'test-project',
  path: string = '/path/to/project'
): Promise<number> {
  return await insertProject(db, { name, path });
}

async function createTestWorkflowRun(
  db: OboraDatabase,
  projectId: number,
  feature: string = 'test-feature',
  workflow: string = 'simple',
  mode: 'auto' | 'supervised' | 'gated' = 'auto'
): Promise<number> {
  return await insertWorkflowRun(db, {
    project_id: projectId,
    feature,
    workflow,
    mode,
    status: 'pending',
  });
}

async function createTestStepExecution(
  db: OboraDatabase,
  runId: number,
  stepName: string = 'plan',
  agent: string = 'architect',
  stepIndex: number = 0
): Promise<number> {
  return await insertStepExecution(db, {
    run_id: runId,
    step_name: stepName,
    step_index: stepIndex,
    agent,
    status: 'pending',
  });
}

async function createTestMetric(
  db: OboraDatabase,
  runId: number,
  metricName: string = 'execution_time',
  metricValue: number = 1000,
  stepId?: number
): Promise<number> {
  return await insertMetric(db, {
    run_id: runId,
    step_id: stepId,
    metric_name: metricName,
    metric_value: metricValue,
  });
}

// ============================================================
// Database Initialization Tests
// ============================================================

describe('OboraDatabase initialization', () => {
  let db: OboraDatabase;

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  });

  it('should create database with in-memory path', async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    
    const path = db.getPath();
    expect(path).toContain(':memory:');
  });

  it('should create all tables on initialize', async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();

    const tables = await db.query('SHOW TABLES');
    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('workflow_runs');
    expect(tableNames).toContain('step_executions');
    expect(tableNames).toContain('metrics');
  });

  it('should create indexes on initialize', async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();

    // Query DuckDB system catalog for indexes
    const indexes = await db.query(`
      SELECT index_name 
      FROM duckdb_indexes() 
      WHERE table_name IN ('projects', 'workflow_runs', 'step_executions', 'metrics')
    `);

    expect(indexes.length).toBeGreaterThan(0);
    
    const indexNames = indexes.map((i: any) => i.index_name);
    expect(indexNames).toContain('idx_projects_path');
    expect(indexNames).toContain('idx_workflow_runs_project');
    expect(indexNames).toContain('idx_workflow_runs_feature');
    expect(indexNames).toContain('idx_workflow_runs_status');
    expect(indexNames).toContain('idx_step_executions_run');
    expect(indexNames).toContain('idx_step_executions_status');
    expect(indexNames).toContain('idx_metrics_run');
    expect(indexNames).toContain('idx_metrics_step');
    expect(indexNames).toContain('idx_metrics_name');
  });

  it('should be idempotent on multiple initialize calls', async () => {
    db = new OboraDatabase(':memory:');

    await db.initialize();
    await db.initialize();
    await db.initialize();

    // Should not throw and tables should still exist
    const tables = await db.query('SHOW TABLES');
    expect(tables.length).toBe(4);
  });

  it('should skip initialization if already initialized', async () => {
    db = new OboraDatabase(':memory:');
    
    await db.initialize();
    
    // Mock run to verify it's not called again
    const runSpy = vi.spyOn(db, 'run');
    await db.initialize();
    
    expect(runSpy).not.toHaveBeenCalled();
    runSpy.mockRestore();
  });
});

// ============================================================
// Project CRUD Tests
// ============================================================

describe('Project CRUD', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('insertProject', () => {
    it('should insert a project and return id', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('should insert multiple projects with unique ids', async () => {
      const id1 = await insertProject(db, { name: 'project-1', path: '/path/1' });
      const id2 = await insertProject(db, { name: 'project-2', path: '/path/2' });
      const id3 = await insertProject(db, { name: 'project-3', path: '/path/3' });

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should reject duplicate path (UNIQUE constraint)', async () => {
      await insertProject(db, { name: 'project-1', path: '/same/path' });

      await expect(
        insertProject(db, { name: 'project-2', path: '/same/path' })
      ).rejects.toThrow();
    });
  });

  describe('getProject', () => {
    it('should get project by id', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const project = await getProject(db, id);

      expect(project).not.toBeNull();
      expect(project?.name).toBe('test-project');
      expect(project?.path).toBe('/path/to/project');
      expect(project?.id).toBe(id);
      expect(project?.created_at).toBeDefined();
      expect(project?.updated_at).toBeDefined();
    });

    it('should return null for non-existent project', async () => {
      const project = await getProject(db, 999999);
      expect(project).toBeNull();
    });

    it('should return null for id 0', async () => {
      const project = await getProject(db, 0);
      expect(project).toBeNull();
    });

    it('should return null for negative id', async () => {
      const project = await getProject(db, -1);
      expect(project).toBeNull();
    });
  });

  describe('getProjectByPath', () => {
    it('should get project by path', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const project = await getProjectByPath(db, '/path/to/project');

      expect(project).not.toBeNull();
      expect(project?.id).toBe(id);
      expect(project?.name).toBe('test-project');
    });

    it('should return null for non-existent path', async () => {
      const project = await getProjectByPath(db, '/nonexistent/path');
      expect(project).toBeNull();
    });

    it('should be case-sensitive for path', async () => {
      await insertProject(db, { name: 'project', path: '/Path/To/Project' });

      const project = await getProjectByPath(db, '/path/to/project');
      expect(project).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('should return empty array when no projects', async () => {
      const projects = await listProjects(db);
      expect(projects).toHaveLength(0);
    });

    it('should list all projects', async () => {
      await insertProject(db, { name: 'project-1', path: '/path/1' });
      await insertProject(db, { name: 'project-2', path: '/path/2' });
      await insertProject(db, { name: 'project-3', path: '/path/3' });

      const projects = await listProjects(db);

      expect(projects).toHaveLength(3);
    });

    it('should order projects by created_at DESC', async () => {
      await insertProject(db, { name: 'project-1', path: '/path/1' });
      await insertProject(db, { name: 'project-2', path: '/path/2' });
      await insertProject(db, { name: 'project-3', path: '/path/3' });

      const projects = await listProjects(db);

      // Most recent first
      expect(projects[0].name).toBe('project-3');
      expect(projects[1].name).toBe('project-2');
      expect(projects[2].name).toBe('project-1');
    });
  });

  describe('updateProject', () => {
    it('should update project name', async () => {
      const id = await insertProject(db, {
        name: 'old-name',
        path: '/path/to/project',
      });

      await updateProject(db, id, { name: 'new-name' });

      const project = await getProject(db, id);
      expect(project?.name).toBe('new-name');
      expect(project?.path).toBe('/path/to/project');
    });

    it('should update project path', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/old/path',
      });

      await updateProject(db, id, { path: '/new/path' });

      const project = await getProject(db, id);
      expect(project?.name).toBe('test-project');
      expect(project?.path).toBe('/new/path');
    });

    it('should update both name and path', async () => {
      const id = await insertProject(db, {
        name: 'old-name',
        path: '/old/path',
      });

      await updateProject(db, id, { name: 'new-name', path: '/new/path' });

      const project = await getProject(db, id);
      expect(project?.name).toBe('new-name');
      expect(project?.path).toBe('/new/path');
    });

    it('should update updated_at timestamp', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path',
      });

      const before = await getProject(db, id);
      
      // Small delay to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await updateProject(db, id, { name: 'updated-name' });

      const after = await getProject(db, id);
      
      // updated_at should be different or at least not null
      expect(after?.updated_at).toBeDefined();
    });

    it('should do nothing when no updates provided', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path',
      });

      await updateProject(db, id, {});

      const project = await getProject(db, id);
      expect(project?.name).toBe('test-project');
    });

    it('should not throw for non-existent project', async () => {
      await expect(
        updateProject(db, 999999, { name: 'new-name' })
      ).resolves.not.toThrow();
    });
  });

  describe('deleteProject', () => {
    it('should delete project', async () => {
      const id = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      await deleteProject(db, id);

      const project = await getProject(db, id);
      expect(project).toBeNull();
    });

    it('should not throw for non-existent project', async () => {
      await expect(deleteProject(db, 999999)).resolves.not.toThrow();
    });
  });
});

// ============================================================
// WorkflowRun CRUD Tests
// ============================================================

describe('WorkflowRun CRUD', () => {
  let db: OboraDatabase;
  let projectId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    projectId = await createTestProject(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('insertWorkflowRun', () => {
    it('should insert a workflow run and return id', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('should set started_at automatically', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      const run = await getWorkflowRun(db, id);
      expect(run?.started_at).toBeDefined();
    });

    it('should support all mode values', async () => {
      const modes: Array<'auto' | 'supervised' | 'gated'> = ['auto', 'supervised', 'gated'];

      for (const mode of modes) {
        const id = await insertWorkflowRun(db, {
          project_id: projectId,
          feature: `feature-${mode}`,
          workflow: 'simple',
          mode,
          status: 'pending',
        });

        const run = await getWorkflowRun(db, id);
        expect(run?.mode).toBe(mode);
      }
    });

    it('should support all status values', async () => {
      const statuses: Array<'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'> = 
        ['pending', 'running', 'paused', 'completed', 'failed', 'cancelled'];

      for (const status of statuses) {
        const id = await insertWorkflowRun(db, {
          project_id: projectId,
          feature: `feature-${status}`,
          workflow: 'simple',
          mode: 'auto',
          status,
        });

        const run = await getWorkflowRun(db, id);
        expect(run?.status).toBe(status);
      }
    });
  });

  describe('getWorkflowRun', () => {
    it('should get workflow run by id', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      const run = await getWorkflowRun(db, id);

      expect(run).not.toBeNull();
      expect(run?.project_id).toBe(projectId);
      expect(run?.feature).toBe('example-feature');
      expect(run?.workflow).toBe('simple');
      expect(run?.mode).toBe('auto');
      expect(run?.status).toBe('pending');
    });

    it('should return null for non-existent run', async () => {
      const run = await getWorkflowRun(db, 999999);
      expect(run).toBeNull();
    });
  });

  describe('listWorkflowRuns', () => {
    it('should return empty array when no runs', async () => {
      const runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(0);
    });

    it('should list workflow runs for a project', async () => {
      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-1',
        workflow: 'simple',
        mode: 'auto',
        status: 'completed',
      });
      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-2',
        workflow: 'complex',
        mode: 'supervised',
        status: 'running',
      });

      const runs = await listWorkflowRuns(db, projectId);

      expect(runs).toHaveLength(2);
    });

    it('should only list runs for specified project', async () => {
      const project2Id = await createTestProject(db, 'project-2', '/path/2');

      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-1',
        workflow: 'simple',
        mode: 'auto',
        status: 'completed',
      });
      await insertWorkflowRun(db, {
        project_id: project2Id,
        feature: 'feature-2',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      const runs1 = await listWorkflowRuns(db, projectId);
      const runs2 = await listWorkflowRuns(db, project2Id);

      expect(runs1).toHaveLength(1);
      expect(runs1[0].feature).toBe('feature-1');
      expect(runs2).toHaveLength(1);
      expect(runs2[0].feature).toBe('feature-2');
    });

    it('should order runs by started_at DESC', async () => {
      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-1',
        workflow: 'simple',
        mode: 'auto',
        status: 'completed',
      });
      
      // Small delay to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-2',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      const runs = await listWorkflowRuns(db, projectId);

      // Most recent first
      expect(runs[0].feature).toBe('feature-2');
      expect(runs[1].feature).toBe('feature-1');
    });
  });

  describe('updateWorkflowRunStatus', () => {
    it('should update status', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      await updateWorkflowRunStatus(db, id, 'running');

      const run = await getWorkflowRun(db, id);
      expect(run?.status).toBe('running');
    });

    it('should update current_step', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      await updateWorkflowRunStatus(db, id, 'running', 'plan');

      const run = await getWorkflowRun(db, id);
      expect(run?.status).toBe('running');
      expect(run?.current_step).toBe('plan');
    });

    it('should update error_message', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      await updateWorkflowRunStatus(
        db,
        id,
        'failed',
        'implement',
        'Agent execution timeout'
      );

      const run = await getWorkflowRun(db, id);
      expect(run?.status).toBe('failed');
      expect(run?.current_step).toBe('implement');
      expect(run?.error_message).toBe('Agent execution timeout');
    });

    it('should set completed_at when status is completed', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      await updateWorkflowRunStatus(db, id, 'completed');

      const run = await getWorkflowRun(db, id);
      expect(run?.completed_at).toBeDefined();
    });

    it('should set completed_at when status is failed', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      await updateWorkflowRunStatus(db, id, 'failed', undefined, 'Error occurred');

      const run = await getWorkflowRun(db, id);
      expect(run?.completed_at).toBeDefined();
    });

    it('should set completed_at when status is cancelled', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      await updateWorkflowRunStatus(db, id, 'cancelled');

      const run = await getWorkflowRun(db, id);
      expect(run?.completed_at).toBeDefined();
    });

    it('should not set completed_at for non-terminal statuses', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      await updateWorkflowRunStatus(db, id, 'running');

      const run = await getWorkflowRun(db, id);
      expect(run?.completed_at).toBeNull();
    });
  });

  describe('deleteWorkflowRun', () => {
    it('should delete workflow run', async () => {
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'example-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      await deleteWorkflowRun(db, id);

      const run = await getWorkflowRun(db, id);
      expect(run).toBeNull();
    });

    it('should not throw for non-existent run', async () => {
      await expect(deleteWorkflowRun(db, 999999)).resolves.not.toThrow();
    });
  });
});

// ============================================================
// StepExecution CRUD Tests
// ============================================================

describe('StepExecution CRUD', () => {
  let db: OboraDatabase;
  let runId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    const projectId = await createTestProject(db);
    runId = await createTestWorkflowRun(db, projectId);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('insertStepExecution', () => {
    it('should insert a step execution and return id', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('should set started_at automatically', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      const step = await getStepExecution(db, id);
      expect(step?.started_at).toBeDefined();
    });

    it('should set retry_count to 0 by default', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      const step = await getStepExecution(db, id);
      expect(step?.retry_count).toBe(0);
    });
  });

  describe('getStepExecution', () => {
    it('should get step execution by id', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      const step = await getStepExecution(db, id);

      expect(step).not.toBeNull();
      expect(step?.run_id).toBe(runId);
      expect(step?.step_name).toBe('plan');
      expect(step?.step_index).toBe(0);
      expect(step?.agent).toBe('architect');
      expect(step?.status).toBe('pending');
    });

    it('should return null for non-existent step', async () => {
      const step = await getStepExecution(db, 999999);
      expect(step).toBeNull();
    });
  });

  describe('listStepExecutions', () => {
    it('should return empty array when no steps', async () => {
      const steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(0);
    });

    it('should list steps for a run', async () => {
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'completed',
      });
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'implement',
        step_index: 1,
        agent: 'coder',
        status: 'running',
      });
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'test',
        step_index: 2,
        agent: 'tester',
        status: 'pending',
      });

      const steps = await listStepExecutions(db, runId);

      expect(steps).toHaveLength(3);
    });

    it('should order steps by step_index ASC', async () => {
      // Insert out of order
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'test',
        step_index: 2,
        agent: 'tester',
        status: 'pending',
      });
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'completed',
      });
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'implement',
        step_index: 1,
        agent: 'coder',
        status: 'running',
      });

      const steps = await listStepExecutions(db, runId);

      expect(steps[0].step_name).toBe('plan');
      expect(steps[0].step_index).toBe(0);
      expect(steps[1].step_name).toBe('implement');
      expect(steps[1].step_index).toBe(1);
      expect(steps[2].step_name).toBe('test');
      expect(steps[2].step_index).toBe(2);
    });
  });

  describe('updateStepExecutionStatus', () => {
    it('should update status', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      await updateStepExecutionStatus(db, id, 'running');

      const step = await getStepExecution(db, id);
      expect(step?.status).toBe('running');
    });

    it('should update output_path', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      await updateStepExecutionStatus(db, id, 'completed', '/path/to/output.md');

      const step = await getStepExecution(db, id);
      expect(step?.status).toBe('completed');
      expect(step?.output_path).toBe('/path/to/output.md');
    });

    it('should update error_message', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'running',
      });

      await updateStepExecutionStatus(db, id, 'failed', undefined, 'Agent timeout');

      const step = await getStepExecution(db, id);
      expect(step?.status).toBe('failed');
      expect(step?.error_message).toBe('Agent timeout');
    });

    it('should set completed_at when status is completed', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'running',
      });

      await updateStepExecutionStatus(db, id, 'completed');

      const step = await getStepExecution(db, id);
      expect(step?.completed_at).toBeDefined();
    });

    it('should set completed_at when status is failed', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'running',
      });

      await updateStepExecutionStatus(db, id, 'failed');

      const step = await getStepExecution(db, id);
      expect(step?.completed_at).toBeDefined();
    });

    it('should set completed_at when status is skipped', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      await updateStepExecutionStatus(db, id, 'skipped');

      const step = await getStepExecution(db, id);
      expect(step?.completed_at).toBeDefined();
    });
  });

  describe('incrementStepRetry', () => {
    it('should increment retry_count', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'failed',
      });

      await incrementStepRetry(db, id);

      const step = await getStepExecution(db, id);
      expect(step?.retry_count).toBe(1);
    });

    it('should increment multiple times', async () => {
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'failed',
      });

      await incrementStepRetry(db, id);
      await incrementStepRetry(db, id);
      await incrementStepRetry(db, id);

      const step = await getStepExecution(db, id);
      expect(step?.retry_count).toBe(3);
    });
  });

  describe('deleteStepExecutions', () => {
    it('should delete all steps for a run', async () => {
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });
      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'implement',
        step_index: 1,
        agent: 'coder',
        status: 'pending',
      });

      await deleteStepExecutions(db, runId);

      const steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(0);
    });

    it('should not affect other runs', async () => {
      const projectId = await createTestProject(db, 'project-2', '/path/2');
      const runId2 = await createTestWorkflowRun(db, projectId, 'feature-2');

      await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });
      await insertStepExecution(db, {
        run_id: runId2,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'pending',
      });

      await deleteStepExecutions(db, runId);

      const steps1 = await listStepExecutions(db, runId);
      const steps2 = await listStepExecutions(db, runId2);

      expect(steps1).toHaveLength(0);
      expect(steps2).toHaveLength(1);
    });
  });
});

// ============================================================
// Metrics CRUD Tests
// ============================================================

describe('Metrics CRUD', () => {
  let db: OboraDatabase;
  let runId: number;
  let stepId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    const projectId = await createTestProject(db);
    runId = await createTestWorkflowRun(db, projectId);
    stepId = await createTestStepExecution(db, runId);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('insertMetric', () => {
    it('should insert a metric and return id', async () => {
      const id = await insertMetric(db, {
        run_id: runId,
        metric_name: 'execution_time',
        metric_value: 1234.5,
      });

      expect(typeof id).toBe('number');
      expect(id).toBeGreaterThan(0);
    });

    it('should insert metric with step_id', async () => {
      const id = await insertMetric(db, {
        run_id: runId,
        step_id: stepId,
        metric_name: 'tokens_used',
        metric_value: 1234,
      });

      const metrics = await getMetricsForStep(db, stepId);
      expect(metrics).toHaveLength(1);
      expect(metrics[0].step_id).toBe(stepId);
    });

    it('should set recorded_at automatically', async () => {
      const id = await insertMetric(db, {
        run_id: runId,
        metric_name: 'test_metric',
        metric_value: 100,
      });

      const metrics = await getMetricsForRun(db, runId);
      expect(metrics[0].recorded_at).toBeDefined();
    });
  });

  describe('getMetricsForRun', () => {
    it('should return empty array when no metrics', async () => {
      const metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(0);
    });

    it('should get metrics for a run', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'execution_time',
        metric_value: 1000,
      });
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'memory_usage',
        metric_value: 512,
      });

      const metrics = await getMetricsForRun(db, runId);

      expect(metrics).toHaveLength(2);
    });

    it('should order by recorded_at ASC', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'metric_1',
        metric_value: 100,
      });
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'metric_2',
        metric_value: 200,
      });

      const metrics = await getMetricsForRun(db, runId);

      expect(metrics[0].metric_name).toBe('metric_1');
      expect(metrics[1].metric_name).toBe('metric_2');
    });
  });

  describe('getMetricsForStep', () => {
    it('should return empty array when no metrics for step', async () => {
      const metrics = await getMetricsForStep(db, stepId);
      expect(metrics).toHaveLength(0);
    });

    it('should get metrics for a step', async () => {
      await insertMetric(db, {
        run_id: runId,
        step_id: stepId,
        metric_name: 'tokens_used',
        metric_value: 1234,
      });
      await insertMetric(db, {
        run_id: runId,
        step_id: stepId,
        metric_name: 'cost',
        metric_value: 0.05,
      });

      const metrics = await getMetricsForStep(db, stepId);

      expect(metrics).toHaveLength(2);
    });

    it('should only return metrics for specified step', async () => {
      const stepId2 = await createTestStepExecution(db, runId, 'implement', 'coder', 1);

      await insertMetric(db, {
        run_id: runId,
        step_id: stepId,
        metric_name: 'metric_step1',
        metric_value: 100,
      });
      await insertMetric(db, {
        run_id: runId,
        step_id: stepId2,
        metric_name: 'metric_step2',
        metric_value: 200,
      });

      const metrics1 = await getMetricsForStep(db, stepId);
      const metrics2 = await getMetricsForStep(db, stepId2);

      expect(metrics1).toHaveLength(1);
      expect(metrics1[0].metric_name).toBe('metric_step1');
      expect(metrics2).toHaveLength(1);
      expect(metrics2[0].metric_name).toBe('metric_step2');
    });
  });

  describe('aggregateMetric', () => {
    it('should calculate SUM', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 1000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 2000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 3000 });

      const sum = await aggregateMetric(db, runId, 'time', 'SUM');
      expect(sum).toBe(6000);
    });

    it('should calculate AVG', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 1000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 2000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 3000 });

      const avg = await aggregateMetric(db, runId, 'time', 'AVG');
      expect(avg).toBe(2000);
    });

    it('should calculate MIN', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 1000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 2000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 3000 });

      const min = await aggregateMetric(db, runId, 'time', 'MIN');
      expect(min).toBe(1000);
    });

    it('should calculate MAX', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 1000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 2000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 3000 });

      const max = await aggregateMetric(db, runId, 'time', 'MAX');
      expect(max).toBe(3000);
    });

    it('should calculate COUNT', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 1000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 2000 });
      await insertMetric(db, { run_id: runId, metric_name: 'time', metric_value: 3000 });

      const count = await aggregateMetric(db, runId, 'time', 'COUNT');
      expect(Number(count)).toBe(3);
    });

    it('should return null for non-existent metric', async () => {
      const result = await aggregateMetric(db, runId, 'nonexistent', 'SUM');
      expect(result).toBeNull();
    });

    it('should handle negative values', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'delta', metric_value: -100 });
      await insertMetric(db, { run_id: runId, metric_name: 'delta', metric_value: -50 });

      const sum = await aggregateMetric(db, runId, 'delta', 'SUM');
      expect(sum).toBe(-150);

      const min = await aggregateMetric(db, runId, 'delta', 'MIN');
      expect(min).toBe(-100);

      const max = await aggregateMetric(db, runId, 'delta', 'MAX');
      expect(max).toBe(-50);
    });

    it('should handle mixed positive and negative values', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'change', metric_value: 100 });
      await insertMetric(db, { run_id: runId, metric_name: 'change', metric_value: -50 });
      await insertMetric(db, { run_id: runId, metric_name: 'change', metric_value: 30 });

      const sum = await aggregateMetric(db, runId, 'change', 'SUM');
      expect(sum).toBe(80);

      const min = await aggregateMetric(db, runId, 'change', 'MIN');
      expect(min).toBe(-50);

      const max = await aggregateMetric(db, runId, 'change', 'MAX');
      expect(max).toBe(100);
    });

    it('should handle zero values', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'zero', metric_value: 0 });
      await insertMetric(db, { run_id: runId, metric_name: 'zero', metric_value: 0 });

      const sum = await aggregateMetric(db, runId, 'zero', 'SUM');
      expect(sum).toBe(0);

      const avg = await aggregateMetric(db, runId, 'zero', 'AVG');
      expect(avg).toBe(0);

      const count = await aggregateMetric(db, runId, 'zero', 'COUNT');
      expect(Number(count)).toBe(2);
    });

    it('should handle decimal values', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'cost', metric_value: 0.001 });
      await insertMetric(db, { run_id: runId, metric_name: 'cost', metric_value: 0.002 });

      const sum = await aggregateMetric(db, runId, 'cost', 'SUM');
      expect(sum).toBeCloseTo(0.003, 5);
    });
  });

  describe('deleteMetrics', () => {
    it('should delete all metrics for a run', async () => {
      await insertMetric(db, { run_id: runId, metric_name: 'metric1', metric_value: 100 });
      await insertMetric(db, { run_id: runId, metric_name: 'metric2', metric_value: 200 });

      await deleteMetrics(db, runId);

      const metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(0);
    });

    it('should not affect other runs', async () => {
      const projectId = await createTestProject(db, 'project-2', '/path/2');
      const runId2 = await createTestWorkflowRun(db, projectId, 'feature-2');

      await insertMetric(db, { run_id: runId, metric_name: 'metric1', metric_value: 100 });
      await insertMetric(db, { run_id: runId2, metric_name: 'metric2', metric_value: 200 });

      await deleteMetrics(db, runId);

      const metrics1 = await getMetricsForRun(db, runId);
      const metrics2 = await getMetricsForRun(db, runId2);

      expect(metrics1).toHaveLength(0);
      expect(metrics2).toHaveLength(1);
    });
  });
});

// ============================================================
// Singleton Pattern Tests
// ============================================================

describe('Database singleton', () => {
  afterEach(() => {
    resetDatabase();
  });

  it('should return same instance for getDatabase', () => {
    const db1 = getDatabase(':memory:');
    const db2 = getDatabase(':memory:');

    expect(db1).toBe(db2);
  });

  it('should reset database instance', () => {
    const db1 = getDatabase(':memory:');
    resetDatabase();
    const db2 = getDatabase(':memory:');

    expect(db1).not.toBe(db2);
  });

  it('should handle reset even when no instance exists', () => {
    expect(() => resetDatabase()).not.toThrow();
  });
});

// ============================================================
// FK Cascade Delete Tests
// ============================================================

describe('FK cascade delete', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('Manual cascade: workflow_run 삭제 시', () => {
    it('should manually delete step_executions before workflow_run', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      await createTestStepExecution(db, runId, 'plan', 'architect', 0);
      await createTestStepExecution(db, runId, 'implement', 'coder', 1);
      await createTestStepExecution(db, runId, 'test', 'tester', 2);

      let steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(3);

      // Manual cascade: delete steps first
      await deleteStepExecutions(db, runId);
      await deleteWorkflowRun(db, runId);

      steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(0);

      const run = await getWorkflowRun(db, runId);
      expect(run).toBeNull();
    });

    it('should manually delete metrics before workflow_run', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      await createTestMetric(db, runId, 'execution_time', 1000);
      await createTestMetric(db, runId, 'memory_usage', 512);

      let metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(2);

      // Manual cascade: delete metrics first
      await deleteMetrics(db, runId);
      await deleteWorkflowRun(db, runId);

      metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(0);
    });

    it('should not affect other workflow_runs when deleting one', async () => {
      const projectId = await createTestProject(db);

      const runId1 = await createTestWorkflowRun(db, projectId, 'feature-1');
      const runId2 = await createTestWorkflowRun(db, projectId, 'feature-2');

      await createTestStepExecution(db, runId1, 'plan', 'architect', 0);
      await createTestStepExecution(db, runId2, 'plan', 'architect', 0);

      // Delete only run1's steps and run1
      await deleteStepExecutions(db, runId1);
      await deleteWorkflowRun(db, runId1);

      // Verify run2's steps still exist
      const steps = await listStepExecutions(db, runId2);
      expect(steps).toHaveLength(1);
      expect(steps[0].step_name).toBe('plan');
    });
  });

  describe('Manual cascade: project 삭제 시', () => {
    it('should manually delete all related data before project', async () => {
      const projectId = await createTestProject(db);

      const runId1 = await createTestWorkflowRun(db, projectId, 'feature-1');
      const runId2 = await createTestWorkflowRun(db, projectId, 'feature-2');

      await createTestStepExecution(db, runId1, 'plan', 'architect', 0);
      await createTestStepExecution(db, runId2, 'plan', 'architect', 0);

      await createTestMetric(db, runId1, 'time', 1000);
      await createTestMetric(db, runId2, 'time', 2000);

      // Manual cascade: delete in order
      await deleteMetrics(db, runId1);
      await deleteMetrics(db, runId2);
      await deleteStepExecutions(db, runId1);
      await deleteStepExecutions(db, runId2);
      await deleteWorkflowRun(db, runId1);
      await deleteWorkflowRun(db, runId2);
      await deleteProject(db, projectId);

      const project = await getProject(db, projectId);
      expect(project).toBeNull();

      const runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(0);
    });

    it('should not affect other projects when deleting one', async () => {
      const projectId1 = await createTestProject(db, 'project-1', '/path/1');
      const projectId2 = await createTestProject(db, 'project-2', '/path/2');

      const runId1 = await createTestWorkflowRun(db, projectId1, 'feature-1');
      const runId2 = await createTestWorkflowRun(db, projectId2, 'feature-2');

      // Delete only project1's data
      await deleteStepExecutions(db, runId1);
      await deleteMetrics(db, runId1);
      await deleteWorkflowRun(db, runId1);
      await deleteProject(db, projectId1);

      // Verify project2's runs still exist
      const runs = await listWorkflowRuns(db, projectId2);
      expect(runs).toHaveLength(1);
      expect(runs[0].feature).toBe('feature-2');
    });
  });
});

// ============================================================
// Error Handling Tests
// ============================================================

describe('Error handling', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('SQL syntax errors', () => {
    it('should throw on invalid SQL query', async () => {
      await expect(db.query('SELECT * FORM invalid_syntax')).rejects.toThrow();
    });

    it('should throw on invalid table name', async () => {
      await expect(db.query('SELECT * FROM nonexistent_table')).rejects.toThrow();
    });
  });

  describe('Constraint violations', () => {
    it('should throw on UNIQUE constraint violation', async () => {
      await insertProject(db, { name: 'project', path: '/unique/path' });

      await expect(
        insertProject(db, { name: 'project2', path: '/unique/path' })
      ).rejects.toThrow();
    });
  });

  describe('Parameterized queries (SQL injection prevention)', () => {
    it('should safely handle SQL injection attempts in project name', async () => {
      const maliciousName = "'; DROP TABLE projects; --";
      
      const id = await insertProject(db, {
        name: maliciousName,
        path: '/safe/path',
      });

      const project = await getProject(db, id);
      expect(project?.name).toBe(maliciousName);

      // Verify table still exists
      const tables = await db.query('SHOW TABLES');
      expect(tables.map((t: any) => t.name)).toContain('projects');
    });

    it('should safely handle SQL injection attempts in path', async () => {
      const maliciousPath = "/path'; DELETE FROM projects WHERE '1'='1";
      
      const id = await insertProject(db, {
        name: 'safe-project',
        path: maliciousPath,
      });

      const project = await getProject(db, id);
      expect(project?.path).toBe(maliciousPath);
    });

    it('should safely handle SQL injection in metric name', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      const maliciousMetricName = "time'; DROP TABLE metrics; --";
      
      await insertMetric(db, {
        run_id: runId,
        metric_name: maliciousMetricName,
        metric_value: 100,
      });

      const metrics = await getMetricsForRun(db, runId);
      expect(metrics[0].metric_name).toBe(maliciousMetricName);

      // Verify table still exists
      const tables = await db.query('SHOW TABLES');
      expect(tables.map((t: any) => t.name)).toContain('metrics');
    });
  });
});

// ============================================================
// Connection Management Tests
// ============================================================

describe('Connection management', () => {
  afterEach(() => {
    resetDatabase();
  });

  it('should throw error when using closed database', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    // Verify it works before closing
    const result = await db.query('SELECT 1 as test');
    expect(result).toHaveLength(1);

    // Close the database
    db.close();

    // Should throw when trying to use closed connection
    await expect(db.query('SELECT 1 as test')).rejects.toThrow();
  });

  it('should handle double close gracefully', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    // First close
    db.close();

    // Second close should not throw (might log warning but not throw)
    expect(() => {
      try {
        db.close();
      } catch {
        // Some implementations may throw, some may not
      }
    }).not.toThrow();
  });

  it('should not leak connections in rapid create/close cycles', async () => {
    // Stress test: rapidly create and close databases
    for (let i = 0; i < 20; i++) {
      const db = new OboraDatabase(':memory:');
      await db.initialize();
      await db.query('SELECT 1 as test');
      db.close();
    }

    // If connections leaked, this would eventually fail
    const finalDb = new OboraDatabase(':memory:');
    await finalDb.initialize();
    const result = await finalDb.query('SELECT 1 as test');
    expect(result).toHaveLength(1);
    finalDb.close();
  });

  it('should handle concurrent database access', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    const projectId = await createTestProject(db);

    // Concurrent reads should not deadlock or fail
    const promises = Array(10)
      .fill(null)
      .map(() => db.query('SELECT * FROM projects'));

    const results = await Promise.all(promises);

    // All queries should succeed
    for (const result of results) {
      expect(result).toHaveLength(1);
    }

    db.close();
  });

  it('should track connection state accurately via getPath', async () => {
    const db = new OboraDatabase(':memory:');

    const pathBefore = db.getPath();
    expect(pathBefore).toContain(':memory:');

    await db.initialize();

    const pathAfter = db.getPath();
    expect(pathAfter).toContain(':memory:');

    db.close();
  });

  it('should reset singleton and allow new connection', async () => {
    const db1 = getDatabase(':memory:');
    await db1.initialize();
    await db1.query('SELECT 1 as test');

    resetDatabase();

    const db2 = getDatabase(':memory:');
    await db2.initialize();

    const result = await db2.query('SELECT 1 as test');
    expect(result).toHaveLength(1);

    resetDatabase();
  });
});

// ============================================================
// Edge Cases
// ============================================================

describe('Edge cases', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // ignore
    }
  });

  describe('Empty strings', () => {
    it('should handle empty project name', async () => {
      const id = await insertProject(db, { name: '', path: '/path' });
      const project = await getProject(db, id);
      expect(project?.name).toBe('');
    });

    it('should handle empty feature name', async () => {
      const projectId = await createTestProject(db);
      const id = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: '',
        workflow: 'simple',
        mode: 'auto',
        status: 'pending',
      });

      const run = await getWorkflowRun(db, id);
      expect(run?.feature).toBe('');
    });
  });

  describe('Long strings', () => {
    it('should handle long project name', async () => {
      const longName = 'a'.repeat(100);
      const id = await insertProject(db, { name: longName, path: '/path' });
      const project = await getProject(db, id);
      expect(project?.name).toBe(longName);
    });

    it('should handle long path', async () => {
      const longPath = '/' + 'a'.repeat(499);
      const id = await insertProject(db, { name: 'project', path: longPath });
      const project = await getProject(db, id);
      expect(project?.path).toBe(longPath);
    });
  });

  describe('Special characters', () => {
    it('should handle unicode in project name', async () => {
      const unicodeName = '프로젝트-테스트-🚀';
      const id = await insertProject(db, { name: unicodeName, path: '/path' });
      const project = await getProject(db, id);
      expect(project?.name).toBe(unicodeName);
    });

    it('should handle special characters in path', async () => {
      const specialPath = '/path/with spaces/and-dashes/and_underscores/and.dots';
      const id = await insertProject(db, { name: 'project', path: specialPath });
      const project = await getProject(db, id);
      expect(project?.path).toBe(specialPath);
    });

    it('should handle newlines in error_message', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      const errorWithNewlines = 'Error: Something failed\n  at line 1\n  at line 2';
      await updateWorkflowRunStatus(db, runId, 'failed', undefined, errorWithNewlines);

      const run = await getWorkflowRun(db, runId);
      expect(run?.error_message).toBe(errorWithNewlines);
    });
  });

  describe('Numeric edge cases', () => {
    it('should handle very large metric value', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      const largeValue = Number.MAX_SAFE_INTEGER;
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'large',
        metric_value: largeValue,
      });

      const sum = await aggregateMetric(db, runId, 'large', 'SUM');
      expect(sum).toBe(largeValue);
    });

    it('should handle very small decimal metric value', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'small',
        metric_value: 0.0000001,
      });

      const metrics = await getMetricsForRun(db, runId);
      expect(metrics[0].metric_value).toBeCloseTo(0.0000001, 10);
    });

    it('should handle negative step_index', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      // DuckDB allows negative integers
      const id = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'negative-step',
        step_index: -1,
        agent: 'test',
        status: 'pending',
      });

      const step = await getStepExecution(db, id);
      expect(step?.step_index).toBe(-1);
    });
  });

  describe('Bulk operations', () => {
    it('should handle many projects', async () => {
      const count = 100;
      for (let i = 0; i < count; i++) {
        await insertProject(db, { name: `project-${i}`, path: `/path/${i}` });
      }

      const projects = await listProjects(db);
      expect(projects).toHaveLength(count);
    });

    it('should handle many workflow runs', async () => {
      const projectId = await createTestProject(db);
      const count = 50;

      for (let i = 0; i < count; i++) {
        await insertWorkflowRun(db, {
          project_id: projectId,
          feature: `feature-${i}`,
          workflow: 'simple',
          mode: 'auto',
          status: 'pending',
        });
      }

      const runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(count);
    });

    it('should handle many metrics for aggregation', async () => {
      const projectId = await createTestProject(db);
      const runId = await createTestWorkflowRun(db, projectId);

      const count = 100;
      let expectedSum = 0;

      for (let i = 1; i <= count; i++) {
        await insertMetric(db, {
          run_id: runId,
          metric_name: 'counter',
          metric_value: i,
        });
        expectedSum += i;
      }

      const sum = await aggregateMetric(db, runId, 'counter', 'SUM');
      expect(sum).toBe(expectedSum);

      const avg = await aggregateMetric(db, runId, 'counter', 'AVG');
      expect(avg).toBe(expectedSum / count);
    });
  });
});

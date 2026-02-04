# TASK-017: @obora/database 유닛 테스트

## 개요
- 우선순위: P1
- 예상 소요: 5시간
- 담당: 개발자

## 목표
@obora/database 패키지의 DuckDB 클라이언트 테스트 작성

## 작업 내용

### 1. 테스트 환경 설정
- vitest.config.ts 생성 (packages/database/)
- in-memory DuckDB 사용

### 2. 테이블 구조

**실제 테이블:**
- `projects` - 프로젝트 정보
- `workflow_runs` - 워크플로우 실행 기록
- `step_executions` - 스텝 실행 기록
- `metrics` - 메트릭 데이터

### 3. duckdb-client.ts 테스트

**OboraDatabase 클래스:**
```typescript
class OboraDatabase {
  constructor(dbPath: string = ".obora/obora.db")
  async initialize(): Promise<void>
  run(sql: string, params?: any[]): Promise<void>
  query(sql: string, params?: any[]): Promise<any[]>
  queryOne(sql: string, params?: any[]): Promise<any | null>
  close(): void
  getPath(): string
}
```

**CRUD 함수들:**
```typescript
// Project CRUD
async function insertProject(db: OboraDatabase, project: Omit<Project, "id" | "created_at" | "updated_at">): Promise<number>
async function getProject(db: OboraDatabase, id: number): Promise<Project | null>
async function getProjectByPath(db: OboraDatabase, projectPath: string): Promise<Project | null>
async function listProjects(db: OboraDatabase): Promise<Project[]>
async function updateProject(db: OboraDatabase, id: number, updates: Partial<Project>): Promise<void>
async function deleteProject(db: OboraDatabase, id: number): Promise<void>

// WorkflowRun CRUD
async function insertWorkflowRun(db: OboraDatabase, run: Omit<WorkflowRun, "id" | "started_at">): Promise<number>
async function getWorkflowRun(db: OboraDatabase, id: number): Promise<WorkflowRun | null>
async function listWorkflowRuns(db: OboraDatabase, projectId: number): Promise<WorkflowRun[]>
async function updateWorkflowRunStatus(db: OboraDatabase, id: number, status: WorkflowRun["status"], currentStep?: string, errorMessage?: string): Promise<void>
async function deleteWorkflowRun(db: OboraDatabase, id: number): Promise<void>

// StepExecution CRUD
async function insertStepExecution(db: OboraDatabase, step: Omit<StepExecution, "id" | "started_at">): Promise<number>
async function getStepExecution(db: OboraDatabase, id: number): Promise<StepExecution | null>
async function listStepExecutions(db: OboraDatabase, runId: number): Promise<StepExecution[]>
async function updateStepExecutionStatus(db: OboraDatabase, id: number, status: StepExecution["status"], output?: string, errorMessage?: string): Promise<void>
async function incrementStepRetry(db: OboraDatabase, id: number): Promise<void>
async function deleteStepExecutions(db: OboraDatabase, runId: number): Promise<void>

// Metrics CRUD
async function insertMetric(db: OboraDatabase, metric: Omit<Metric, "id" | "recorded_at">): Promise<number>
async function getMetricsForRun(db: OboraDatabase, runId: number): Promise<Metric[]>
async function getMetricsForStep(db: OboraDatabase, stepId: number): Promise<Metric[]>
async function aggregateMetric(db: OboraDatabase, runId: number, metricName: string, aggregate: "SUM" | "AVG" | "MIN" | "MAX" | "COUNT"): Promise<number | null>
async function deleteMetrics(db: OboraDatabase, runId: number): Promise<void>

// Utility
function getDatabase(dbPath?: string): OboraDatabase
function resetDatabase(): void
```

### 4. 테스트 케이스

**Database 초기화:**
- in-memory DB로 연결 성공
- 테이블 생성 확인 (projects, workflow_runs, step_executions, metrics)
- 인덱스 생성 확인
- initialize() 중복 호출 안전 처리

**Project CRUD:**
- 프로젝트 생성 및 자동 ID 할당
- ID로 프로젝트 조회
- path로 프로젝트 조회
- 전체 프로젝트 목록 조회
- 프로젝트 수정 (name, path)
- 프로젝트 삭제
- 존재하지 않는 프로젝트 조회 시 null 반환

**WorkflowRun CRUD:**
- 워크플로우 실행 생성
- 실행 기록 조회
- 프로젝트별 실행 목록 조회
- 상태 업데이트 (pending → running → completed)
- current_step 업데이트
- error_message 업데이트
- 실행 삭제
- completed_at 자동 설정

**StepExecution CRUD:**
- 스텝 실행 생성
- 스텝 실행 조회
- 실행별 스텝 목록 조회 (step_index 순 정렬)
- 상태 업데이트
- output_path 업데이트
- error_message 업데이트
- retry_count 증가
- 스텝 삭제 (cascade 효과 확인)
- completed_at 자동 설정

**Metrics CRUD:**
- 메트릭 기록
- 실행별 메트릭 조회
- 스텝별 메트릭 조회
- 메트릭 집계 (SUM, AVG, MIN, MAX, COUNT)
- 메트릭 삭제

**인덱스 테스트:**
- 인덱스 생성 확인
- 쿼리 성능 (선택적)

**에러 처리:**
- 잘못된 SQL 쿼리 에러
- 제약 조건 위반 (UNIQUE, FOREIGN KEY)
- 파라미터 SQL 인젝션 방지 확인

**커넥션 관리:**
- close() 호출 후 재사용 불가
- 커넥션 누수 없음
- resetDatabase()로 싱글톤 초기화

## Mock 전략

### DuckDB In-Memory 사용법

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OboraDatabase, getDatabase, resetDatabase } from '../duckdb-client';

describe('OboraDatabase', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    // in-memory DB 사용 (테스트 후 자동 삭제)
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should create tables on initialize', async () => {
    const tables = await db.query('SHOW TABLES');
    const tableNames = tables.map((t: any) => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('workflow_runs');
    expect(tableNames).toContain('step_executions');
    expect(tableNames).toContain('metrics');
  });
});
```

### 테스트 데이터셋 헬퍼

```typescript
import {
  insertProject,
  insertWorkflowRun,
  insertStepExecution,
  insertMetric,
} from '../duckdb-client';

async function createTestProject(db: OboraDatabase, name: string, path: string): Promise<number> {
  return await insertProject(db, { name, path });
}

async function createTestWorkflowRun(
  db: OboraDatabase,
  projectId: number,
  feature: string,
  workflow: string,
  mode: 'auto' | 'supervised' | 'gated'
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
  stepName: string,
  agent: string,
  stepIndex: number
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
  metricName: string,
  metricValue: number,
  stepId?: number
): Promise<number> {
  return await insertMetric(db, {
    run_id: runId,
    step_id: stepId,
    metric_name: metricName,
    metric_value: metricValue,
  });
}
```

### Mock DuckDB (선택적)

```typescript
// DuckDB 모듈 mock (실제 DB 대신 사용 시)
import { vi } from 'vitest';

vi.mock('duckdb', () => ({
  default: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockReturnValue({
      run: vi.fn((sql, params, callback) => callback(null)),
      all: vi.fn((sql, params, callback) => callback(null, [])),
      get: vi.fn((sql, params, callback) => callback(null, null)),
      close: vi.fn(),
    }),
    close: vi.fn(),
  })),
}));
```

## 완료 조건
- [ ] 테스트 커버리지 80% 이상
- [ ] in-memory DB로 빠른 테스트
- [ ] 커넥션 누수 없음
- [ ] 모든 CRUD 작업 테스트

## 의존성
- TASK-010 (duckdb-setup)

## 테스트 파일 구조
```
packages/database/
├── src/
│   └── duckdb-client.ts
└── test/
    ├── duckdb-client.test.ts
    ├── project.test.ts
    ├── workflow-run.test.ts
    ├── step-execution.test.ts
    ├── metrics.test.ts
    └── helpers.ts
```

## 테스트 케이스 예시

### Database 초기화 테스트
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OboraDatabase, getDatabase, resetDatabase } from '../duckdb-client';

describe('OboraDatabase initialization', () => {
  it('should create tables on initialize', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    const tables = await db.query('SHOW TABLES');
    const tableNames = tables.map((t: any) => t.name);

    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('workflow_runs');
    expect(tableNames).toContain('step_executions');
    expect(tableNames).toContain('metrics');

    await db.close();
  });

  it('should create indexes', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    const indexes = await db.query('SELECT index_name FROM duckdb_indexes() WHERE table_name = ? OR table_name = ? OR table_name = ? OR table_name = ?', ['projects', 'workflow_runs', 'step_executions', 'metrics']);

    expect(indexes.length).toBeGreaterThan(0);

    await db.close();
  });

  it('should be idempotent on multiple initialize calls', async () => {
    const db = new OboraDatabase(':memory:');

    await db.initialize();
    await db.initialize(); // Should not throw
    await db.initialize(); // Should not throw

    await db.close();
  });
});
```

### Project CRUD 테스트
```typescript
import {
  insertProject,
  getProject,
  getProjectByPath,
  listProjects,
  updateProject,
  deleteProject,
} from '../duckdb-client';

describe('Project CRUD', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  it('should insert a project and return id', async () => {
    const id = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });

    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThan(0);
  });

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

  it('should return null for non-existent project', async () => {
    const project = await getProject(db, 999999);
    expect(project).toBeNull();
  });

  it('should list all projects', async () => {
    await insertProject(db, { name: 'project-1', path: '/path/1' });
    await insertProject(db, { name: 'project-2', path: '/path/2' });
    await insertProject(db, { name: 'project-3', path: '/path/3' });

    const projects = await listProjects(db);

    expect(projects).toHaveLength(3);
    expect(projects.map((p) => p.name)).toEqual(['project-1', 'project-2', 'project-3']);
  });

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

  it('should delete project', async () => {
    const id = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });

    await deleteProject(db, id);

    const project = await getProject(db, id);
    expect(project).toBeNull();
  });
});
```

### WorkflowRun CRUD 테스트
```typescript
import {
  insertProject,
  insertWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  updateWorkflowRunStatus,
  deleteWorkflowRun,
} from '../duckdb-client';

describe('WorkflowRun CRUD', () => {
  let db: OboraDatabase;
  let projectId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    projectId = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('should insert a workflow run', async () => {
    const id = await insertWorkflowRun(db, {
      project_id: projectId,
      feature: 'example-feature',
      workflow: 'simple',
      mode: 'auto',
      status: 'pending',
    });

    expect(typeof id).toBe('number');

    const run = await getWorkflowRun(db, id);
    expect(run).not.toBeNull();
    expect(run?.project_id).toBe(projectId);
    expect(run?.feature).toBe('example-feature');
    expect(run?.status).toBe('pending');
    expect(run?.started_at).toBeDefined();
  });

  it('should update workflow run status', async () => {
    const id = await insertWorkflowRun(db, {
      project_id: projectId,
      feature: 'example-feature',
      workflow: 'simple',
      mode: 'auto',
      status: 'pending',
    });

    await updateWorkflowRunStatus(db, id, 'running', 'plan');

    let run = await getWorkflowRun(db, id);
    expect(run?.status).toBe('running');
    expect(run?.current_step).toBe('plan');

    await updateWorkflowRunStatus(db, id, 'completed', 'done');

    run = await getWorkflowRun(db, id);
    expect(run?.status).toBe('completed');
    expect(run?.completed_at).toBeDefined();
  });

  it('should update with error message', async () => {
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
    expect(run?.error_message).toBe('Agent execution timeout');
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
      mode: 'auto',
      status: 'running',
    });

    const runs = await listWorkflowRuns(db, projectId);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.feature)).toEqual(['feature-1', 'feature-2']);
  });

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
});
```

### StepExecution CRUD 테스트
```typescript
import {
  insertProject,
  insertWorkflowRun,
  insertStepExecution,
  getStepExecution,
  listStepExecutions,
  updateStepExecutionStatus,
  incrementStepRetry,
  deleteStepExecutions,
} from '../duckdb-client';

describe('StepExecution CRUD', () => {
  let db: OboraDatabase;
  let runId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    const projectId = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });
    runId = await insertWorkflowRun(db, {
      project_id: projectId,
      feature: 'example-feature',
      workflow: 'simple',
      mode: 'auto',
      status: 'running',
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('should insert a step execution', async () => {
    const id = await insertStepExecution(db, {
      run_id: runId,
      step_name: 'plan',
      step_index: 0,
      agent: 'architect',
      status: 'pending',
    });

    expect(typeof id).toBe('number');

    const step = await getStepExecution(db, id);
    expect(step).not.toBeNull();
    expect(step?.run_id).toBe(runId);
    expect(step?.step_name).toBe('plan');
    expect(step?.step_index).toBe(0);
    expect(step?.agent).toBe('architect');
    expect(step?.status).toBe('pending');
  });

  it('should list steps for a run in order', async () => {
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
    expect(steps[0].step_name).toBe('plan');
    expect(steps[1].step_name).toBe('implement');
    expect(steps[2].step_name).toBe('test');
  });

  it('should update step status with output', async () => {
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
    expect(step?.completed_at).toBeDefined();
  });

  it('should increment retry count', async () => {
    const id = await insertStepExecution(db, {
      run_id: runId,
      step_name: 'plan',
      step_index: 0,
      agent: 'architect',
      status: 'failed',
    });

    await incrementStepRetry(db, id);
    await incrementStepRetry(db, id);

    const step = await getStepExecution(db, id);
    expect(step?.retry_count).toBe(2);
  });

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
});
```

### Metrics CRUD 테스트
```typescript
import {
  insertProject,
  insertWorkflowRun,
  insertMetric,
  getMetricsForRun,
  getMetricsForStep,
  aggregateMetric,
  deleteMetrics,
} from '../duckdb-client';

describe('Metrics CRUD', () => {
  let db: OboraDatabase;
  let runId: number;
  let stepId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
    const projectId = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });
    runId = await insertWorkflowRun(db, {
      project_id: projectId,
      feature: 'example-feature',
      workflow: 'simple',
      mode: 'auto',
      status: 'running',
    });
    stepId = await insertStepExecution(db, {
      run_id: runId,
      step_name: 'plan',
      step_index: 0,
      agent: 'architect',
      status: 'completed',
    });
  });

  afterEach(async () => {
    await db.close();
  });

  it('should insert a metric', async () => {
    const id = await insertMetric(db, {
      run_id: runId,
      metric_name: 'execution_time',
      metric_value: 1234.5,
    });

    expect(typeof id).toBe('number');
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
    expect(metrics.map((m) => m.metric_name)).toEqual(['execution_time', 'memory_usage']);
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
    expect(metrics.map((m) => m.metric_name)).toEqual(['tokens_used', 'cost']);
  });

  it('should aggregate metrics', async () => {
    await insertMetric(db, {
      run_id: runId,
      metric_name: 'execution_time',
      metric_value: 1000,
    });
    await insertMetric(db, {
      run_id: runId,
      metric_name: 'execution_time',
      metric_value: 2000,
    });
    await insertMetric(db, {
      run_id: runId,
      metric_name: 'execution_time',
      metric_value: 3000,
    });

    const sum = await aggregateMetric(db, runId, 'execution_time', 'SUM');
    expect(sum).toBe(6000);

    const avg = await aggregateMetric(db, runId, 'execution_time', 'AVG');
    expect(avg).toBe(2000);

    const min = await aggregateMetric(db, runId, 'execution_time', 'MIN');
    expect(min).toBe(1000);

    const max = await aggregateMetric(db, runId, 'execution_time', 'MAX');
    expect(max).toBe(3000);

    const count = await aggregateMetric(db, runId, 'execution_time', 'COUNT');
    expect(count).toBe(3);
  });

  it('should delete metrics for a run', async () => {
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

    await deleteMetrics(db, runId);

    const metrics = await getMetricsForRun(db, runId);
    expect(metrics).toHaveLength(0);
  });
});
```

### Singleton 패턴 테스트
```typescript
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
});
```

### FK Cascade 삭제 테스트
```typescript
import {
  OboraDatabase,
  insertProject,
  insertWorkflowRun,
  insertStepExecution,
  insertMetric,
  deleteWorkflowRun,
  deleteProject,
  listStepExecutions,
  listWorkflowRuns,
  getMetricsForRun,
} from '../duckdb-client';

describe('FK cascade delete', () => {
  let db: OboraDatabase;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('workflow_run 삭제 시 step_executions 자동 삭제', () => {
    it('should delete all step_executions when workflow_run is deleted', async () => {
      // Setup: project → workflow_run → step_executions
      const projectId = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const runId = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'test-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      // Create multiple step executions
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

      // Verify steps exist
      let steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(3);

      // Delete workflow run
      await deleteWorkflowRun(db, runId);

      // Verify steps are also deleted (cascade)
      steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(0);
    });

    it('should delete metrics when workflow_run is deleted', async () => {
      const projectId = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const runId = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'test-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      // Create metrics
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

      // Verify metrics exist
      let metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(2);

      // Delete workflow run
      await deleteWorkflowRun(db, runId);

      // Verify metrics are also deleted (cascade)
      metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(0);
    });

    it('should not affect other workflow_runs when deleting one', async () => {
      const projectId = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const runId1 = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-1',
        workflow: 'simple',
        mode: 'auto',
        status: 'completed',
      });

      const runId2 = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-2',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      await insertStepExecution(db, {
        run_id: runId1,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'completed',
      });

      await insertStepExecution(db, {
        run_id: runId2,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'running',
      });

      // Delete only run1
      await deleteWorkflowRun(db, runId1);

      // Verify run2's steps still exist
      const steps = await listStepExecutions(db, runId2);
      expect(steps).toHaveLength(1);
      expect(steps[0].step_name).toBe('plan');
    });
  });

  describe('project 삭제 시 관련 runs 자동 삭제', () => {
    it('should delete all workflow_runs when project is deleted', async () => {
      const projectId = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      // Create multiple workflow runs
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
        workflow: 'standard',
        mode: 'supervised',
        status: 'running',
      });

      await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'feature-3',
        workflow: 'simple',
        mode: 'gated',
        status: 'pending',
      });

      // Verify runs exist
      let runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(3);

      // Delete project
      await deleteProject(db, projectId);

      // Verify runs are also deleted (cascade)
      runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(0);
    });

    it('should cascade delete through all levels: project → runs → steps → metrics', async () => {
      const projectId = await insertProject(db, {
        name: 'test-project',
        path: '/path/to/project',
      });

      const runId = await insertWorkflowRun(db, {
        project_id: projectId,
        feature: 'test-feature',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      const stepId = await insertStepExecution(db, {
        run_id: runId,
        step_name: 'plan',
        step_index: 0,
        agent: 'architect',
        status: 'completed',
      });

      await insertMetric(db, {
        run_id: runId,
        step_id: stepId,
        metric_name: 'tokens_used',
        metric_value: 1234,
      });

      // Verify all records exist
      let runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(1);

      let steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(1);

      let metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(1);

      // Delete project (should cascade to all)
      await deleteProject(db, projectId);

      // Verify all are deleted
      runs = await listWorkflowRuns(db, projectId);
      expect(runs).toHaveLength(0);

      steps = await listStepExecutions(db, runId);
      expect(steps).toHaveLength(0);

      metrics = await getMetricsForRun(db, runId);
      expect(metrics).toHaveLength(0);
    });

    it('should not affect other projects when deleting one', async () => {
      const projectId1 = await insertProject(db, {
        name: 'project-1',
        path: '/path/1',
      });

      const projectId2 = await insertProject(db, {
        name: 'project-2',
        path: '/path/2',
      });

      await insertWorkflowRun(db, {
        project_id: projectId1,
        feature: 'feature-1',
        workflow: 'simple',
        mode: 'auto',
        status: 'completed',
      });

      await insertWorkflowRun(db, {
        project_id: projectId2,
        feature: 'feature-2',
        workflow: 'simple',
        mode: 'auto',
        status: 'running',
      });

      // Delete only project1
      await deleteProject(db, projectId1);

      // Verify project2's runs still exist
      const runs = await listWorkflowRuns(db, projectId2);
      expect(runs).toHaveLength(1);
      expect(runs[0].feature).toBe('feature-2');
    });
  });
});
```

### aggregateMetric 음수/NULL 엣지 케이스 테스트
```typescript
import {
  OboraDatabase,
  insertProject,
  insertWorkflowRun,
  insertMetric,
  aggregateMetric,
} from '../duckdb-client';

describe('aggregateMetric edge cases', () => {
  let db: OboraDatabase;
  let runId: number;

  beforeEach(async () => {
    db = new OboraDatabase(':memory:');
    await db.initialize();

    const projectId = await insertProject(db, {
      name: 'test-project',
      path: '/path/to/project',
    });

    runId = await insertWorkflowRun(db, {
      project_id: projectId,
      feature: 'test-feature',
      workflow: 'simple',
      mode: 'auto',
      status: 'running',
    });
  });

  afterEach(async () => {
    await db.close();
  });

  describe('음수 값 처리', () => {
    it('should handle negative metric values', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'delta',
        metric_value: -100,
      });

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'delta',
        metric_value: -50,
      });

      const sum = await aggregateMetric(db, runId, 'delta', 'SUM');
      expect(sum).toBe(-150);

      const avg = await aggregateMetric(db, runId, 'delta', 'AVG');
      expect(avg).toBe(-75);

      const min = await aggregateMetric(db, runId, 'delta', 'MIN');
      expect(min).toBe(-100);

      const max = await aggregateMetric(db, runId, 'delta', 'MAX');
      expect(max).toBe(-50);
    });

    it('should handle mixed positive and negative values', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'change',
        metric_value: 100,
      });

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'change',
        metric_value: -50,
      });

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'change',
        metric_value: 30,
      });

      const sum = await aggregateMetric(db, runId, 'change', 'SUM');
      expect(sum).toBe(80); // 100 - 50 + 30

      const avg = await aggregateMetric(db, runId, 'change', 'AVG');
      expect(avg).toBeCloseTo(26.67, 1); // (100 - 50 + 30) / 3

      const min = await aggregateMetric(db, runId, 'change', 'MIN');
      expect(min).toBe(-50);

      const max = await aggregateMetric(db, runId, 'change', 'MAX');
      expect(max).toBe(100);
    });

    it('should handle zero values', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'zero_test',
        metric_value: 0,
      });

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'zero_test',
        metric_value: 0,
      });

      const sum = await aggregateMetric(db, runId, 'zero_test', 'SUM');
      expect(sum).toBe(0);

      const avg = await aggregateMetric(db, runId, 'zero_test', 'AVG');
      expect(avg).toBe(0);

      const count = await aggregateMetric(db, runId, 'zero_test', 'COUNT');
      expect(count).toBe(2);
    });
  });

  describe('NULL 처리', () => {
    it('should return null for non-existent metric name', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'existing_metric',
        metric_value: 100,
      });

      const result = await aggregateMetric(db, runId, 'nonexistent_metric', 'SUM');
      expect(result).toBeNull();
    });

    it('should return null for empty result set', async () => {
      // No metrics inserted for this run
      const sum = await aggregateMetric(db, runId, 'any_metric', 'SUM');
      expect(sum).toBeNull();

      const avg = await aggregateMetric(db, runId, 'any_metric', 'AVG');
      expect(avg).toBeNull();

      const min = await aggregateMetric(db, runId, 'any_metric', 'MIN');
      expect(min).toBeNull();

      const max = await aggregateMetric(db, runId, 'any_metric', 'MAX');
      expect(max).toBeNull();
    });

    it('should return 0 for COUNT on empty result set', async () => {
      const count = await aggregateMetric(db, runId, 'nonexistent', 'COUNT');
      expect(count).toBe(0);
    });

    it('should return null for non-existent run_id', async () => {
      const nonExistentRunId = 999999;

      const sum = await aggregateMetric(db, nonExistentRunId, 'any_metric', 'SUM');
      expect(sum).toBeNull();
    });
  });

  describe('극단값 처리', () => {
    it('should handle very large numbers', async () => {
      const largeValue = Number.MAX_SAFE_INTEGER;

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'large',
        metric_value: largeValue,
      });

      const sum = await aggregateMetric(db, runId, 'large', 'SUM');
      expect(sum).toBe(largeValue);
    });

    it('should handle very small decimal numbers', async () => {
      await insertMetric(db, {
        run_id: runId,
        metric_name: 'small',
        metric_value: 0.0000001,
      });

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'small',
        metric_value: 0.0000002,
      });

      const sum = await aggregateMetric(db, runId, 'small', 'SUM');
      expect(sum).toBeCloseTo(0.0000003, 10);
    });

    it('should handle Infinity gracefully', async () => {
      // Note: DuckDB may handle Infinity differently
      // This test documents expected behavior

      await insertMetric(db, {
        run_id: runId,
        metric_name: 'infinity',
        metric_value: Number.POSITIVE_INFINITY,
      });

      const sum = await aggregateMetric(db, runId, 'infinity', 'SUM');
      expect(sum).toBe(Number.POSITIVE_INFINITY);
    });
  });
});
```

### 커넥션 누수 테스트
```typescript
import { OboraDatabase, getDatabase, resetDatabase } from '../duckdb-client';

describe('Connection leak tests', () => {
  afterEach(() => {
    resetDatabase();
  });

  it('should not leak connections when creating multiple databases', async () => {
    const databases: OboraDatabase[] = [];

    // Create many database instances
    for (let i = 0; i < 10; i++) {
      const db = new OboraDatabase(':memory:');
      await db.initialize();
      databases.push(db);
    }

    // All databases should be accessible
    for (const db of databases) {
      const result = await db.query('SELECT 1 as test');
      expect(result).toHaveLength(1);
    }

    // Close all databases
    for (const db of databases) {
      db.close();
    }

    // Should not throw after closing
    expect(() => {
      // Creating new instance after closing all should work
      const newDb = new OboraDatabase(':memory:');
      newDb.close();
    }).not.toThrow();
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

    // Second close should not throw
    expect(() => {
      db.close();
    }).not.toThrow();
  });

  it('should properly reset singleton and allow new connection', async () => {
    // Get singleton instance
    const db1 = getDatabase(':memory:');
    await db1.initialize();

    // Use the database
    await db1.query('SELECT 1 as test');

    // Reset singleton
    resetDatabase();

    // Get new singleton instance
    const db2 = getDatabase(':memory:');
    await db2.initialize();

    // New instance should work
    const result = await db2.query('SELECT 1 as test');
    expect(result).toHaveLength(1);

    // Old instance should not work
    await expect(db1.query('SELECT 1 as test')).rejects.toThrow();

    resetDatabase();
  });

  it('should not leak connections in rapid create/close cycles', async () => {
    // Stress test: rapidly create and close databases
    for (let i = 0; i < 50; i++) {
      const db = new OboraDatabase(':memory:');
      await db.initialize();
      await db.query('SELECT 1 as test');
      db.close();
    }

    // If connections leaked, this would eventually fail
    // or throw "too many open files" error
    const finalDb = new OboraDatabase(':memory:');
    await finalDb.initialize();
    const result = await finalDb.query('SELECT 1 as test');
    expect(result).toHaveLength(1);
    finalDb.close();
  });

  it('should cleanup on error during initialization', async () => {
    // Create a database with invalid path to trigger error
    const db = new OboraDatabase('/nonexistent/path/db.duckdb');

    // Initialization should fail
    await expect(db.initialize()).rejects.toThrow();

    // Trying to use it should also fail gracefully
    await expect(db.query('SELECT 1')).rejects.toThrow();

    // Close should not throw even after failed init
    expect(() => {
      db.close();
    }).not.toThrow();
  });

  it('should handle concurrent database access', async () => {
    const db = new OboraDatabase(':memory:');
    await db.initialize();

    // Create a project
    await db.run(
      'INSERT INTO projects (name, path) VALUES (?, ?)',
      ['test', '/test']
    );

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

  it('should track connection state accurately', async () => {
    const db = new OboraDatabase(':memory:');

    // Before initialization
    const pathBefore = db.getPath();
    expect(pathBefore).toContain(':memory:');

    await db.initialize();

    // After initialization
    const pathAfter = db.getPath();
    expect(pathAfter).toContain(':memory:');

    db.close();
  });
});
```

## 엣지 케이스 목록

### Database 초기화
1. 이미 테이블이 존재하는 상태에서 initialize() 호출
2. 인덱스가 이미 존재하는 상태에서 initialize() 호출
3. DB 경로가 유효하지 않은 경우

### Project CRUD
1. 중복된 path로 프로젝트 생성 (UNIQUE 제약)
2. 긴 프로젝트 이름 (>100자)
3. 빈 문자열 name/path
4. ID가 0 또는 음수인 경우 조회

### WorkflowRun CRUD
1. 존재하지 않는 project_id로 실행 생성 (FOREIGN KEY 제약)
2. 잘못된 status 값
3. 잘못된 mode 값
4. 존재하지 않는 실행 업데이트

### StepExecution CRUD
1. 존재하지 않는 run_id로 스텝 생성 (FOREIGN KEY 제약)
2. 음수 step_index
3. retry_count 음수로 설정 시도 (SQL로 직접 시도)
4. status enum 외의 값

### Metrics CRUD
1. 음수 metric_value
2. 매우 큰 metric_value
3. 특수 문자가 포함된 metric_name
4. run_id 또는 step_id가 없는 metric

### 에러 처리
1. SQL 문법 오류
2. 파라미터 타입 불일치
3. NULL 제약 위반
4. FOREIGN KEY 제약 위반

## 참고 자료
- [DuckDB Node.js API](https://duckdb.org/docs/api/nodejs/overview)
- [Vitest 공식 문서](https://vitest.dev/)
- SPEC-010-database-schema.md

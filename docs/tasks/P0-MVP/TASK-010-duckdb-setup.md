# TASK-010: DuckDB 설정 구현

## 개요
- 우선순위: P0
- 예상 소요: 2.5시간
- 담당: 개발자

## 목표
DuckDB를 사용하여 데이터 저장 및 쿼리 기능 구현

## 작업 내용
1. **DuckDB 설치**
   - `duckdb-node` 패키지 설치
   - packages/database에 의존성 추가
   - TypeScript 타입 정의

2. **데이터베이스 초기화**
   - 데이터베이스 파일 생성 (`.obora/obora.db`)
   - 테이블 스키마 정의
   - 초기 스키마 마이그레이션

3. **테이블 설계** (07-database-schema.md 기준)
   - `projects` 테이블 (프로젝트 메타데이터)
   - `workflow_runs` 테이블 (워크플로우 실행 이력)
   - `step_executions` 테이블 (단계별 실행 기록)
   - `metrics` 테이블 (메트릭 데이터)

4. **기본 쿼리 함수 구현**
   - `query(sql, params)` - 일반 쿼리 실행
   - `insert(table, data)` - 데이터 삽입
   - `select(table, filter)` - 데이터 조회
   - `update(table, id, data)` - 데이터 수정
   - `delete(table, id)` - 데이터 삭제

5. **연결 관리**
   - 연결 풀링 (필요 시)
   - 연결 종료 처리
   - 에러 핸들링

## 완료 조건
- [ ] DuckDB 데이터베이스 초기화
- [ ] 기본 테이블 생성
- [ ] CRUD 함수 구현
- [ ] 기본 쿼리 테스트 통과

## 의존성
- TASK-001 (프로젝트 초기 설정)

## 테이블 스키마 (07-database-schema.md 기준)

### projects 테이블
```sql
CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  path VARCHAR(500) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### workflow_runs 테이블
```sql
CREATE TABLE workflow_runs (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL,
  feature VARCHAR(100) NOT NULL,
  workflow VARCHAR(100) NOT NULL,
  mode VARCHAR(20) NOT NULL,       -- auto, supervised, gated
  status VARCHAR(20) NOT NULL,     -- pending, running, paused, completed, failed, cancelled
  current_step VARCHAR(50),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id)
);
```

### step_executions 테이블
```sql
CREATE TABLE step_executions (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  step_name VARCHAR(50) NOT NULL,
  step_index INTEGER NOT NULL,
  agent VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,     -- pending, running, completed, failed, skipped
  retry_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  output_path VARCHAR(500),
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id)
);
```

### metrics 테이블
```sql
CREATE TABLE metrics (
  id INTEGER PRIMARY KEY,
  run_id INTEGER NOT NULL,
  step_id INTEGER,
  metric_name VARCHAR(100) NOT NULL,
  metric_value DOUBLE NOT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id) REFERENCES workflow_runs(id),
  FOREIGN KEY (step_id) REFERENCES step_executions(id)
);
```

## API 설계

### 데이터베이스 초기화
```typescript
import duckdb from 'duckdb';

export class OboraDatabase {
  private db: duckdb.Database;
  private connection: duckdb.Connection;

  constructor(dbPath: string = '.obora/obora.db') {
    this.db = new duckdb.Database(dbPath);
    this.connection = this.db.connect();
    this.initializeSchema();
  }

  private initializeSchema(): void {
    // projects 테이블
    this.connection.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        path VARCHAR(500) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // workflow_runs 테이블
    this.connection.run(`
      CREATE TABLE IF NOT EXISTS workflow_runs (
        id INTEGER PRIMARY KEY,
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

    // step_executions 테이블
    this.connection.run(`
      CREATE TABLE IF NOT EXISTS step_executions (
        id INTEGER PRIMARY KEY,
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

    // metrics 테이블
    this.connection.run(`
      CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY,
        run_id INTEGER NOT NULL,
        step_id INTEGER,
        metric_name VARCHAR(100) NOT NULL,
        metric_value DOUBLE NOT NULL,
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (run_id) REFERENCES workflow_runs(id),
        FOREIGN KEY (step_id) REFERENCES step_executions(id)
      )
    `);
  }

  query(sql: string, params?: any[]): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connection.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  close(): void {
    this.connection.close();
    this.db.close();
  }
}
```

### CRUD 함수
```typescript
// Project 관련
export async function insertProject(db: OboraDatabase, project: Project): Promise<number> {
  const sql = `
    INSERT INTO projects (name, path)
    VALUES (?, ?)
    RETURNING id
  `;
  const result = await db.query(sql, [project.name, project.path]);
  return result[0].id;
}

// WorkflowRun 관련
export async function insertWorkflowRun(
  db: OboraDatabase,
  run: Omit<WorkflowRun, 'id'>
): Promise<number> {
  const sql = `
    INSERT INTO workflow_runs (project_id, feature, workflow, mode, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `;
  const result = await db.query(sql, [
    run.project_id,
    run.feature,
    run.workflow,
    run.mode,
    run.status,
    run.started_at
  ]);
  return result[0].id;
}

export async function updateWorkflowRunStatus(
  db: OboraDatabase,
  id: number,
  status: string,
  completedAt?: Date
): Promise<void> {
  const sql = completedAt
    ? 'UPDATE workflow_runs SET status = ?, completed_at = ? WHERE id = ?'
    : 'UPDATE workflow_runs SET status = ? WHERE id = ?';
  const params = completedAt ? [status, completedAt, id] : [status, id];
  await db.query(sql, params);
}

// StepExecution 관련
export async function insertStepExecution(
  db: OboraDatabase,
  step: Omit<StepExecution, 'id'>
): Promise<number> {
  const sql = `
    INSERT INTO step_executions (run_id, step_name, step_index, agent, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
    RETURNING id
  `;
  const result = await db.query(sql, [
    step.run_id,
    step.step_name,
    step.step_index,
    step.agent,
    step.status,
    step.started_at
  ]);
  return result[0].id;
}
```

## 테스트 케이스
```typescript
// 데이터베이스 초기화 테스트
const db = new OboraDatabase(':memory:');  // 테스트용 인메모리 DB
const rows = await db.query("SELECT table_name FROM information_schema.tables WHERE table_schema='main'");
expect(rows).toHaveLength(4);  // 4개 테이블 생성 확인 (projects, workflow_runs, step_executions, metrics)

// Project 삽입 테스트
const projectId = await insertProject(db, {
  name: 'my-project',
  path: '/path/to/project'
});
expect(projectId).toBeGreaterThan(0);

// WorkflowRun 삽입 테스트
const runId = await insertWorkflowRun(db, {
  project_id: projectId,
  feature: 'user-auth',
  workflow: 'standard',
  mode: 'auto',
  status: 'running',
  started_at: new Date()
});
expect(runId).toBeGreaterThan(0);

// StepExecution 삽입 테스트
const stepId = await insertStepExecution(db, {
  run_id: runId,
  step_name: 'design',
  step_index: 0,
  agent: 'architect',
  status: 'running',
  started_at: new Date()
});
expect(stepId).toBeGreaterThan(0);

// 상태 변경 테스트
await updateWorkflowRunStatus(db, runId, 'completed', new Date());
const updated = await db.query('SELECT status FROM workflow_runs WHERE id = ?', [runId]);
expect(updated[0].status).toBe('completed');
```

## 참고 자료
- [DuckDB Node.js 바인딩](https://github.com/duckdb/duckdb-node)
- [DuckDB SQL 문서](https://duckdb.org/docs/sql/introduction)
- [DuckDB 타입스크립트 지원](https://duckdb.org/docs/api/nodejs/overview)

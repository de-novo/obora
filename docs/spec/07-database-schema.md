# Database Schema Specification

> 버전: v3
> 패키지: @obora/database
> 데이터베이스: DuckDB

---

## 개요

obora-kit은 DuckDB를 사용하여 실행 기록과 메트릭을 저장합니다.

### 선택 이유

| 장점 | 설명 |
|------|------|
| **임베디드** | 별도 서버 설치 불필요 |
| **SQL 지원** | 표준 SQL 쿼리 가능 |
| **분석 최적화** | 컬럼 지향 저장 |
| **파일 기반** | 단일 `.db` 파일 |

### 파일 위치

```
.obora/obora.db
```

---

## 테이블 정의

### ERD

```
┌─────────────────┐       ┌──────────────────┐
│    projects     │       │  workflow_runs   │
├─────────────────┤       ├──────────────────┤
│ id (PK)         │───┐   │ id (PK)          │
│ name            │   │   │ project_id (FK)  │──┐
│ path            │   └──>│ feature          │  │
│ created_at      │       │ workflow         │  │
│ updated_at      │       │ mode             │  │
└─────────────────┘       │ status           │  │
                          │ started_at       │  │
                          │ completed_at     │  │
                          └──────────────────┘  │
                                   │            │
                    ┌──────────────┘            │
                    ▼                           │
        ┌────────────────────┐                  │
        │  step_executions   │                  │
        ├────────────────────┤                  │
        │ id (PK)            │                  │
        │ run_id (FK)        │                  │
        │ step_name          │                  │
        │ agent              │                  │
        │ status             │                  │
        │ retry_count        │                  │
        │ started_at         │                  │
        │ completed_at       │                  │
        │ error_message      │                  │
        │ output_path        │                  │
        └────────────────────┘                  │
                    │                           │
                    ▼                           │
        ┌────────────────────┐                  │
        │      metrics       │                  │
        ├────────────────────┤                  │
        │ id (PK)            │<─────────────────┘
        │ run_id (FK)        │
        │ step_id (FK)       │
        │ metric_name        │
        │ metric_value       │
        │ recorded_at        │
        └────────────────────┘
```

---

### projects

프로젝트 기본 정보를 저장합니다.

```sql
CREATE TABLE projects (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    path VARCHAR(500) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 프로젝트 ID |
| name | VARCHAR(100) | NOT NULL | 프로젝트 이름 |
| path | VARCHAR(500) | NOT NULL, UNIQUE | 프로젝트 경로 |
| created_at | TIMESTAMP | DEFAULT NOW | 생성 시간 |
| updated_at | TIMESTAMP | DEFAULT NOW | 수정 시간 |

---

### workflow_runs

워크플로우 실행 기록을 저장합니다.

```sql
CREATE TABLE workflow_runs (
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
);
```

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 실행 ID |
| project_id | INTEGER | FK | 프로젝트 ID |
| feature | VARCHAR(100) | NOT NULL | 기능 이름 |
| workflow | VARCHAR(100) | NOT NULL | 워크플로우 이름 |
| mode | VARCHAR(20) | NOT NULL | 실행 모드 |
| status | VARCHAR(20) | NOT NULL | 상태 |
| current_step | VARCHAR(50) | | 현재 단계 |
| started_at | TIMESTAMP | | 시작 시간 |
| completed_at | TIMESTAMP | | 완료 시간 |
| error_message | TEXT | | 에러 메시지 |

---

### step_executions

단계별 실행 기록을 저장합니다.

```sql
CREATE TABLE step_executions (
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
);
```

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 실행 ID |
| run_id | INTEGER | FK | 워크플로우 실행 ID |
| step_name | VARCHAR(50) | NOT NULL | 단계 이름 |
| step_index | INTEGER | NOT NULL | 단계 순서 (0부터) |
| agent | VARCHAR(50) | NOT NULL | 에이전트 ID |
| status | VARCHAR(20) | NOT NULL | 상태 |
| retry_count | INTEGER | DEFAULT 0 | 재시도 횟수 |
| started_at | TIMESTAMP | | 시작 시간 |
| completed_at | TIMESTAMP | | 완료 시간 |
| error_message | TEXT | | 에러 메시지 |
| output_path | VARCHAR(500) | | 출력 파일 경로 |

---

### metrics

메트릭 데이터를 저장합니다.

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

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| id | INTEGER | PK, AUTO | 메트릭 ID |
| run_id | INTEGER | FK | 워크플로우 실행 ID |
| step_id | INTEGER | FK, NULL 가능 | 단계 실행 ID |
| metric_name | VARCHAR(100) | NOT NULL | 메트릭 이름 |
| metric_value | DOUBLE | NOT NULL | 메트릭 값 |
| recorded_at | TIMESTAMP | DEFAULT NOW | 기록 시간 |

---

## 상태값 ENUM

### workflow_runs.status

| 상태 | 설명 | 전이 가능 상태 |
|------|------|---------------|
| `pending` | 대기 중 | running, cancelled |
| `running` | 실행 중 | paused, completed, failed |
| `paused` | 일시 정지 | running, cancelled |
| `completed` | 완료 | - (최종) |
| `failed` | 실패 | - (최종) |
| `cancelled` | 취소됨 | - (최종) |

**상태 전이 다이어그램:**

```
pending ─────────────────┬──> cancelled
    │                    │
    ▼                    │
running ──> paused ──────┘
    │          │
    │          ▼
    ├──> completed
    │
    └──> failed
```

### workflow_runs.mode

| 모드 | 설명 |
|------|------|
| `auto` | 자동 실행 |
| `supervised` | 감독 모드 |
| `gated` | 게이트 모드 |

### step_executions.status

| 상태 | 설명 |
|------|------|
| `pending` | 대기 중 |
| `running` | 실행 중 |
| `completed` | 완료 |
| `failed` | 실패 |
| `skipped` | 건너뜀 |

---

## 인덱스

### 생성 스크립트

```sql
-- projects
CREATE UNIQUE INDEX idx_projects_path ON projects(path);

-- workflow_runs
CREATE INDEX idx_workflow_runs_project ON workflow_runs(project_id);
CREATE INDEX idx_workflow_runs_feature ON workflow_runs(feature);
CREATE INDEX idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX idx_workflow_runs_started ON workflow_runs(started_at);

-- step_executions
CREATE INDEX idx_step_executions_run ON step_executions(run_id);
CREATE INDEX idx_step_executions_status ON step_executions(status);

-- metrics
CREATE INDEX idx_metrics_run ON metrics(run_id);
CREATE INDEX idx_metrics_step ON metrics(step_id);
CREATE INDEX idx_metrics_name ON metrics(metric_name);
```

### 인덱스 설명

| 인덱스 | 테이블 | 용도 |
|--------|--------|------|
| `idx_projects_path` | projects | 경로로 프로젝트 조회 |
| `idx_workflow_runs_project` | workflow_runs | 프로젝트별 실행 조회 |
| `idx_workflow_runs_feature` | workflow_runs | 기능별 실행 조회 |
| `idx_workflow_runs_status` | workflow_runs | 상태별 필터링 |
| `idx_workflow_runs_started` | workflow_runs | 시간순 정렬 |
| `idx_step_executions_run` | step_executions | 실행별 단계 조회 |
| `idx_step_executions_status` | step_executions | 상태별 필터링 |
| `idx_metrics_run` | metrics | 실행별 메트릭 조회 |
| `idx_metrics_step` | metrics | 단계별 메트릭 조회 |
| `idx_metrics_name` | metrics | 메트릭 종류별 집계 |

---

## 마이그레이션 전략

### 버전 관리

```sql
CREATE TABLE schema_versions (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    description VARCHAR(500)
);
```

### 마이그레이션 파일 구조

```
packages/@obora/database/
└── src/
    └── migrations/
        ├── 001_init.sql
        ├── 002_add_metrics.sql
        ├── 003_add_indexes.sql
        └── ...
```

### 001_init.sql

```sql
-- 초기 스키마 생성
-- Version: 1

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    path VARCHAR(500) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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
);

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
);

CREATE TABLE IF NOT EXISTS metrics (
    id INTEGER PRIMARY KEY,
    run_id INTEGER NOT NULL,
    step_id INTEGER,
    metric_name VARCHAR(100) NOT NULL,
    metric_value DOUBLE NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (run_id) REFERENCES workflow_runs(id),
    FOREIGN KEY (step_id) REFERENCES step_executions(id)
);

-- 스키마 버전 기록
INSERT INTO schema_versions (version, description)
VALUES (1, 'Initial schema');
```

### 마이그레이션 실행

```typescript
async function migrate(db: DuckDB): Promise<void> {
  const currentVersion = await getCurrentVersion(db);
  const migrations = await loadMigrations();
  
  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      console.log(`Applying migration ${migration.version}...`);
      await db.run(migration.sql);
      await recordVersion(db, migration.version, migration.description);
    }
  }
}
```

---

## 쿼리 예시

### 프로젝트 생성

```sql
INSERT INTO projects (name, path)
VALUES ('my-project', '/path/to/project')
RETURNING id;
```

### 워크플로우 실행 시작

```sql
INSERT INTO workflow_runs (project_id, feature, workflow, mode, status, started_at)
VALUES (1, 'user-auth', 'standard', 'auto', 'running', CURRENT_TIMESTAMP)
RETURNING id;
```

### 단계 실행 기록

```sql
INSERT INTO step_executions (run_id, step_name, step_index, agent, status, started_at)
VALUES (1, 'design', 0, 'architect', 'running', CURRENT_TIMESTAMP)
RETURNING id;
```

### 단계 완료 업데이트

```sql
UPDATE step_executions
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    output_path = 'context/design-output.md'
WHERE id = 1;
```

### 워크플로우 완료 업데이트

```sql
UPDATE workflow_runs
SET status = 'completed',
    completed_at = CURRENT_TIMESTAMP
WHERE id = 1;
```

### 메트릭 기록

```sql
INSERT INTO metrics (run_id, step_id, metric_name, metric_value)
VALUES (1, 1, 'duration_seconds', 150.5);
```

### 실행 중인 워크플로우 조회

```sql
SELECT 
    wr.id,
    wr.feature,
    wr.workflow,
    wr.status,
    wr.current_step,
    wr.started_at
FROM workflow_runs wr
WHERE wr.status IN ('running', 'paused')
ORDER BY wr.started_at DESC;
```

### 기능별 실행 히스토리

```sql
SELECT 
    wr.id,
    wr.workflow,
    wr.mode,
    wr.status,
    wr.started_at,
    wr.completed_at,
    EXTRACT(EPOCH FROM (wr.completed_at - wr.started_at)) as duration_seconds
FROM workflow_runs wr
WHERE wr.feature = 'user-auth'
ORDER BY wr.started_at DESC
LIMIT 10;
```

### 단계별 평균 실행 시간

```sql
SELECT 
    se.step_name,
    se.agent,
    COUNT(*) as execution_count,
    AVG(EXTRACT(EPOCH FROM (se.completed_at - se.started_at))) as avg_duration_seconds,
    SUM(se.retry_count) as total_retries
FROM step_executions se
JOIN workflow_runs wr ON se.run_id = wr.id
WHERE wr.project_id = 1
  AND se.status = 'completed'
GROUP BY se.step_name, se.agent
ORDER BY avg_duration_seconds DESC;
```

### 성공률 계산

```sql
SELECT 
    wr.workflow,
    COUNT(*) as total_runs,
    SUM(CASE WHEN wr.status = 'completed' THEN 1 ELSE 0 END) as success_count,
    ROUND(
        SUM(CASE WHEN wr.status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
        2
    ) as success_rate
FROM workflow_runs wr
WHERE wr.project_id = 1
GROUP BY wr.workflow;
```

### 최근 실패 조회

```sql
SELECT 
    wr.feature,
    wr.workflow,
    se.step_name,
    se.error_message,
    se.completed_at as failed_at
FROM step_executions se
JOIN workflow_runs wr ON se.run_id = wr.id
WHERE se.status = 'failed'
ORDER BY se.completed_at DESC
LIMIT 5;
```

---

## TypeScript 인터페이스

```typescript
interface Project {
  id: number;
  name: string;
  path: string;
  created_at: Date;
  updated_at: Date;
}

interface WorkflowRun {
  id: number;
  project_id: number;
  feature: string;
  workflow: string;
  mode: 'auto' | 'supervised' | 'gated';
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  current_step?: string;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
}

interface StepExecution {
  id: number;
  run_id: number;
  step_name: string;
  step_index: number;
  agent: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  retry_count: number;
  started_at?: Date;
  completed_at?: Date;
  error_message?: string;
  output_path?: string;
}

interface Metric {
  id: number;
  run_id: number;
  step_id?: number;
  metric_name: string;
  metric_value: number;
  recorded_at: Date;
}
```

---

## MVP vs Full

### MVP

- [x] 4개 테이블 (projects, workflow_runs, step_executions, metrics)
- [x] 기본 CRUD 쿼리
- [x] 기본 인덱스
- [x] 초기 마이그레이션

### Full

- [ ] 상세 메트릭 (토큰 사용량, 비용 등)
- [ ] 뷰 생성 (통계용)
- [ ] 파티셔닝 (대용량 데이터)
- [ ] 백업/복원 유틸리티
- [ ] 데이터 보존 정책

---

*마지막 수정: 2026-02-03*

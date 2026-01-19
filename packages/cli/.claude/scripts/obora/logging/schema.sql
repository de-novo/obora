-- Agent Logging Schema
-- 실시간 모니터링 및 분석을 위한 SQLite 스키마

PRAGMA journal_mode = WAL;  -- 동시 읽기 지원
PRAGMA foreign_keys = ON;

-- 세션 테이블: 전체 대화 세션
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
  initial_prompt TEXT,
  summary TEXT,
  total_tokens INTEGER DEFAULT 0,
  metadata JSON
);

-- 워크플로우 테이블: Planner가 생성한 실행 계획
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  planned_by TEXT DEFAULT 'planner',
  task_description TEXT,
  workflow_json JSON,  -- 전체 계획 (에이전트 순서, 태스크 등)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ended_at DATETIME
);

-- 워크플로우 스텝: 개별 단계
CREATE TABLE IF NOT EXISTS workflow_steps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL,
  parallel_group INTEGER,  -- 같은 번호는 병렬 실행 가능
  agent_name TEXT NOT NULL,
  agent_category TEXT,  -- 'core', 'code', 'test', 'db', 'docs', 'devops', 'security'
  task_description TEXT,
  dependencies JSON,  -- 선행 스텝 ID 목록 [1, 2, 3]
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  run_id TEXT,  -- 실행 시 agent_runs.id 참조
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  ended_at DATETIME,
  result_summary TEXT,
  UNIQUE(workflow_id, step_order)
);

-- 에이전트 실행 테이블: 개별 에이전트 실행 기록
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL,
  parent_run_id TEXT REFERENCES agent_runs(id) ON DELETE SET NULL,  -- 중첩 호출 추적
  agent_name TEXT NOT NULL,
  agent_category TEXT,
  model TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'interrupted')),
  input_summary TEXT,
  output_summary TEXT,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  duration_ms INTEGER,
  error_message TEXT,
  metadata JSON
);

-- 도구 호출 테이블: 에이전트가 사용한 도구 기록
CREATE TABLE IF NOT EXISTS tool_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSON,
  output JSON,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failed', 'blocked', 'timeout')),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  duration_ms INTEGER,
  error_message TEXT
);

-- 파일 접근 테이블: 에이전트가 접근한 파일 기록
CREATE TABLE IF NOT EXISTS file_accesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
  tool_call_id INTEGER REFERENCES tool_calls(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  access_type TEXT NOT NULL CHECK (access_type IN ('read', 'write', 'edit', 'create', 'delete')),
  line_start INTEGER,
  line_end INTEGER,
  summary TEXT,  -- 변경 내용 요약
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 병렬 실행 그룹 테이블
CREATE TABLE IF NOT EXISTS parallel_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  group_order INTEGER NOT NULL,  -- 실행 순서 (같은 순서는 병렬)
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  started_at DATETIME,
  ended_at DATETIME,
  UNIQUE(workflow_id, group_order)
);

-- 병렬 그룹과 스텝 매핑
CREATE TABLE IF NOT EXISTS parallel_group_steps (
  group_id INTEGER REFERENCES parallel_groups(id) ON DELETE CASCADE,
  step_id INTEGER REFERENCES workflow_steps(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, step_id)
);

-- 작업 상세 로그 테이블
CREATE TABLE IF NOT EXISTS action_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT REFERENCES agent_runs(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,  -- 'thinking', 'decision', 'delegation', 'file_change', 'command', 'error'
  description TEXT NOT NULL,
  details JSON,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 피드백 루프 테이블
CREATE TABLE IF NOT EXISTS feedback_loops (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id TEXT REFERENCES workflows(id) ON DELETE CASCADE,
  trigger_step_id INTEGER REFERENCES workflow_steps(id),
  trigger_agent TEXT NOT NULL,
  reviewer_agent TEXT NOT NULL,
  iteration INTEGER DEFAULT 1,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'fixing', 'passed', 'failed', 'max_reached')),
  trigger_output TEXT,
  review_result TEXT,
  fix_result TEXT,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

-- 피드백 루프 상세 기록
CREATE TABLE IF NOT EXISTS feedback_iterations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  loop_id INTEGER REFERENCES feedback_loops(id) ON DELETE CASCADE,
  iteration INTEGER NOT NULL,
  phase TEXT NOT NULL CHECK (phase IN ('review', 'fix', 'verify')),
  agent_name TEXT NOT NULL,
  input_summary TEXT,
  output_summary TEXT,
  issues_found JSON,  -- 발견된 이슈 목록
  issues_resolved JSON,  -- 해결된 이슈 목록
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME
);

-- 에이전트 레지스트리: 사용 가능한 에이전트 목록 (디스커버리용)
CREATE TABLE IF NOT EXISTS agent_registry (
  name TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  description TEXT,
  tools JSON,  -- 허용된 도구 목록
  model TEXT,
  file_path TEXT,
  last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
  usage_count INTEGER DEFAULT 0,
  avg_duration_ms INTEGER,
  success_rate REAL
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_workflows_session ON workflows(session_id);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_workflow ON workflow_steps(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow ON agent_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_agent ON agent_runs(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started ON agent_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_tool_calls_run ON tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_tool_calls_tool ON tool_calls(tool_name);
CREATE INDEX IF NOT EXISTS idx_file_accesses_run ON file_accesses(run_id);
CREATE INDEX IF NOT EXISTS idx_file_accesses_path ON file_accesses(file_path);
CREATE INDEX IF NOT EXISTS idx_file_accesses_type ON file_accesses(access_type);
CREATE INDEX IF NOT EXISTS idx_action_logs_run ON action_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_action_logs_type ON action_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_workflow_steps_parallel ON workflow_steps(workflow_id, parallel_group);

-- 뷰: 실시간 대시보드용
CREATE VIEW IF NOT EXISTS v_current_activity AS
SELECT
  ar.id,
  ar.agent_name,
  ar.agent_category,
  ar.status,
  ar.started_at,
  ar.duration_ms,
  w.task_description as workflow_task,
  ws.step_order,
  (SELECT COUNT(*) FROM workflow_steps WHERE workflow_id = w.id) as total_steps
FROM agent_runs ar
LEFT JOIN workflows w ON ar.workflow_id = w.id
LEFT JOIN workflow_steps ws ON ws.run_id = ar.id
WHERE ar.status = 'running'
ORDER BY ar.started_at DESC;

-- 뷰: 에이전트 통계
CREATE VIEW IF NOT EXISTS v_agent_stats AS
SELECT
  agent_name,
  agent_category,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_runs,
  ROUND(AVG(duration_ms)) as avg_duration_ms,
  ROUND(100.0 * SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate,
  MAX(started_at) as last_used
FROM agent_runs
GROUP BY agent_name, agent_category;

-- 뷰: 워크플로우 진행 상황
CREATE VIEW IF NOT EXISTS v_workflow_progress AS
SELECT
  w.id,
  w.task_description,
  w.status,
  w.created_at,
  COUNT(ws.id) as total_steps,
  SUM(CASE WHEN ws.status = 'completed' THEN 1 ELSE 0 END) as completed_steps,
  SUM(CASE WHEN ws.status = 'running' THEN 1 ELSE 0 END) as running_steps,
  SUM(CASE WHEN ws.status = 'failed' THEN 1 ELSE 0 END) as failed_steps
FROM workflows w
LEFT JOIN workflow_steps ws ON ws.workflow_id = w.id
GROUP BY w.id;

-- 뷰: 에이전트별 파일 접근 현황
CREATE VIEW IF NOT EXISTS v_file_activity AS
SELECT
  ar.agent_name,
  fa.file_path,
  fa.access_type,
  COUNT(*) as access_count,
  MAX(fa.timestamp) as last_access
FROM file_accesses fa
JOIN agent_runs ar ON fa.run_id = ar.id
GROUP BY ar.agent_name, fa.file_path, fa.access_type
ORDER BY last_access DESC;

-- 뷰: 병렬 실행 그룹 현황
CREATE VIEW IF NOT EXISTS v_parallel_execution AS
SELECT
  w.id as workflow_id,
  w.task_description,
  ws.parallel_group,
  GROUP_CONCAT(ws.agent_name, ', ') as agents_in_group,
  COUNT(*) as agents_count,
  SUM(CASE WHEN ws.status = 'completed' THEN 1 ELSE 0 END) as completed,
  SUM(CASE WHEN ws.status = 'running' THEN 1 ELSE 0 END) as running
FROM workflows w
JOIN workflow_steps ws ON ws.workflow_id = w.id
WHERE ws.parallel_group IS NOT NULL
GROUP BY w.id, ws.parallel_group
ORDER BY w.id, ws.parallel_group;

-- 뷰: 최근 작업 로그
CREATE VIEW IF NOT EXISTS v_recent_actions AS
SELECT
  al.timestamp,
  ar.agent_name,
  al.action_type,
  al.description,
  al.details
FROM action_logs al
JOIN agent_runs ar ON al.run_id = ar.id
ORDER BY al.timestamp DESC
LIMIT 100;

-- 뷰: 세션별 파일 변경 요약
CREATE VIEW IF NOT EXISTS v_session_file_changes AS
SELECT
  s.id as session_id,
  fa.file_path,
  GROUP_CONCAT(DISTINCT fa.access_type) as access_types,
  COUNT(*) as total_accesses,
  GROUP_CONCAT(DISTINCT ar.agent_name) as agents_involved
FROM sessions s
JOIN agent_runs ar ON ar.session_id = s.id
JOIN file_accesses fa ON fa.run_id = ar.id
GROUP BY s.id, fa.file_path
ORDER BY s.id, total_accesses DESC;

-- 뷰: 피드백 루프 현황
CREATE VIEW IF NOT EXISTS v_feedback_loops AS
SELECT
  fl.id,
  w.task_description as workflow_task,
  fl.trigger_agent,
  fl.reviewer_agent,
  fl.iteration,
  fl.status,
  (SELECT COUNT(*) FROM feedback_iterations WHERE loop_id = fl.id) as total_iterations,
  fl.started_at,
  fl.ended_at,
  CAST((julianday(fl.ended_at) - julianday(fl.started_at)) * 86400 AS INTEGER) as duration_seconds
FROM feedback_loops fl
JOIN workflows w ON fl.workflow_id = w.id
ORDER BY fl.started_at DESC;

-- 뷰: 에이전트별 피드백 통계
CREATE VIEW IF NOT EXISTS v_agent_feedback_stats AS
SELECT
  trigger_agent,
  reviewer_agent,
  COUNT(*) as total_loops,
  SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) as passed,
  SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
  ROUND(AVG(iteration), 2) as avg_iterations,
  ROUND(100.0 * SUM(CASE WHEN status = 'passed' THEN 1 ELSE 0 END) / COUNT(*), 2) as pass_rate
FROM feedback_loops
GROUP BY trigger_agent, reviewer_agent;

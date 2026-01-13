-- Migration: Add Task-based structure
-- Purpose: Enable task-based tracking instead of session-based tracking
-- This allows grouping related work across sessions and tracking subtasks

-- =============================================================================
-- New Tables
-- =============================================================================

-- Tasks table: Core entity for task-based tracking
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,                                  -- UUID
  title TEXT NOT NULL,                                  -- e.g., "로그인 구현", "Add dark mode"
  description TEXT,                                     -- Detailed description
  parent_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,  -- For subtasks hierarchy
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending',      -- Not started
    'in_progress',  -- Currently being worked on
    'completed',    -- Successfully completed
    'failed',       -- Failed
    'cancelled',    -- Cancelled by user
    'blocked'       -- Blocked by dependency
  )),
  priority INTEGER DEFAULT 0,                           -- Higher = more important
  complexity TEXT CHECK (complexity IN ('trivial', 'simple', 'medium', 'complex', 'epic')),
  tags TEXT,                                            -- JSON array: ["auth", "frontend", "backend"]
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  estimated_duration_ms INTEGER,                        -- Estimated time to complete
  actual_duration_ms INTEGER,                           -- Actual time spent
  created_by TEXT,                                      -- Who created this task (user/agent)
  metadata TEXT                                         -- JSON for additional data
);

-- Task-Session linking table (many-to-many)
-- One task can span multiple sessions
CREATE TABLE IF NOT EXISTS task_sessions (
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'primary' CHECK (role IN ('primary', 'continuation', 'review', 'fix')),
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  PRIMARY KEY (task_id, session_id)
);

-- Task dependencies (for showing related tasks)
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT DEFAULT 'blocks' CHECK (dependency_type IN (
    'blocks',     -- Must complete before this task
    'related',    -- Related but independent
    'continues',  -- This task continues the other
    'reviews'     -- This task reviews the other
  )),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, depends_on_task_id)
);

-- Add task_id to agent_runs
ALTER TABLE agent_runs ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_sessions_task ON task_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_task_sessions_session ON task_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_task ON task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_task ON agent_runs(task_id);

-- =============================================================================
-- Views for Task-based queries
-- =============================================================================

-- View: Task hierarchy with progress
CREATE VIEW IF NOT EXISTS v_task_hierarchy AS
WITH RECURSIVE task_tree AS (
  -- Root tasks (no parent)
  SELECT
    id,
    title,
    description,
    parent_task_id,
    status,
    priority,
    complexity,
    tags,
    created_at,
    started_at,
    completed_at,
    0 as depth,
    id as root_task_id
  FROM tasks
  WHERE parent_task_id IS NULL

  UNION ALL

  -- Child tasks
  SELECT
    t.id,
    t.title,
    t.description,
    t.parent_task_id,
    t.status,
    t.priority,
    t.complexity,
    t.tags,
    t.created_at,
    t.started_at,
    t.completed_at,
    tt.depth + 1 as depth,
    tt.root_task_id
  FROM tasks t
  INNER JOIN task_tree tt ON t.parent_task_id = tt.id
)
SELECT
  th.*,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = th.id) as subtask_count,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = th.id AND status = 'completed') as completed_subtasks,
  (SELECT COUNT(*) FROM agent_runs WHERE task_id = th.id) as agent_run_count
FROM task_tree th;

-- View: Task progress summary
CREATE VIEW IF NOT EXISTS v_task_progress AS
SELECT
  t.id,
  t.title,
  t.status,
  t.priority,
  t.created_at,
  t.started_at,
  t.completed_at,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) as total_subtasks,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') as completed_subtasks,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'in_progress') as in_progress_subtasks,
  (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'failed') as failed_subtasks,
  (SELECT COUNT(*) FROM agent_runs WHERE task_id = t.id) as total_runs,
  (SELECT COUNT(*) FROM agent_runs WHERE task_id = t.id AND status = 'completed') as completed_runs,
  (SELECT SUM(duration_ms) FROM agent_runs WHERE task_id = t.id) as total_duration_ms,
  CASE
    WHEN (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) = 0 THEN
      CASE t.status
        WHEN 'completed' THEN 100
        WHEN 'in_progress' THEN 50
        ELSE 0
      END
    ELSE
      CAST((SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id AND status = 'completed') AS REAL) /
      (SELECT COUNT(*) FROM tasks WHERE parent_task_id = t.id) * 100
  END as progress_percent
FROM tasks t
WHERE t.parent_task_id IS NULL;

-- View: Related tasks (via dependencies)
CREATE VIEW IF NOT EXISTS v_related_tasks AS
SELECT
  td.task_id,
  t1.title as task_title,
  td.depends_on_task_id,
  t2.title as depends_on_title,
  td.dependency_type,
  t2.status as dependency_status
FROM task_dependencies td
JOIN tasks t1 ON td.task_id = t1.id
JOIN tasks t2 ON td.depends_on_task_id = t2.id;

-- View: Active tasks (currently in progress across all sessions)
CREATE VIEW IF NOT EXISTS v_active_tasks AS
SELECT
  t.id,
  t.title,
  t.description,
  t.status,
  t.priority,
  t.started_at,
  (SELECT COUNT(*) FROM agent_runs WHERE task_id = t.id AND status = 'running') as running_agents,
  (SELECT GROUP_CONCAT(DISTINCT s.id) FROM task_sessions ts JOIN sessions s ON ts.session_id = s.id WHERE ts.task_id = t.id) as session_ids
FROM tasks t
WHERE t.status = 'in_progress'
ORDER BY t.priority DESC, t.started_at ASC;

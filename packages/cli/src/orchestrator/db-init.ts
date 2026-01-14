/**
 * Database Initialization
 *
 * 중앙 DB 초기화 및 마이그레이션
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const DASHBOARD_DB = "dashboard.db";

// ============================================================================
// Initialization
// ============================================================================

/**
 * 데이터베이스 초기화
 *
 * - ~/.obora 디렉토리 생성
 * - dashboard.db 파일 생성
 * - 스키마 마이그레이션 실행
 */
export async function initializeDb(): Promise<void> {
  const oboraDir = join(homedir(), OBORA_DIR);
  const dbPath = join(oboraDir, DASHBOARD_DB);

  // 1. 디렉토리 생성
  if (!existsSync(oboraDir)) {
    mkdirSync(oboraDir, { recursive: true });
  }

  // 2. DB 파일 존재 확인
  const isNewDb = !existsSync(dbPath);

  // 3. 연결 생성
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");

  // 4. 스키마 생성 (새 DB인 경우)
  if (isNewDb) {
    await createSchema(sqlite);
  }

  sqlite.close();
}

/**
 * 스키마 생성 (SQL 직접 실행)
 */
async function createSchema(sqlite: Database.Database): Promise<void> {
  // 인라인 스키마 정의 (V2 - SaaS 확장 지원)
  const schema = `
-- Schema Version
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY NOT NULL,
  applied_at INTEGER NOT NULL
);

-- Projects (V2: SaaS 확장 필드 추가)
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  -- Project Identity (SaaS-ready)
  config_id TEXT UNIQUE,
  git_remote TEXT,
  -- Cloud Sync (Future SaaS)
  organization_id TEXT,
  external_id TEXT,
  sync_enabled INTEGER NOT NULL DEFAULT 0,
  last_synced_at INTEGER,
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_projects_path ON projects (path);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_config_id ON projects (config_id);
CREATE INDEX IF NOT EXISTS idx_projects_git_remote ON projects (git_remote);
CREATE INDEX IF NOT EXISTS idx_projects_org ON projects (organization_id);

-- Sessions
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  summary TEXT,
  metadata TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions (project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions (started_at);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  ended_at INTEGER,
  input TEXT,
  output TEXT,
  error TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_workflows_session ON workflows (session_id);
CREATE INDEX IF NOT EXISTS idx_workflows_type ON workflows (type);
CREATE INDEX IF NOT EXISTS idx_workflows_status ON workflows (status);

-- Workflow Steps
CREATE TABLE IF NOT EXISTS workflow_steps (
  id TEXT PRIMARY KEY NOT NULL,
  workflow_id TEXT NOT NULL,
  step_number INTEGER NOT NULL,
  agent_type TEXT NOT NULL,
  task_description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at INTEGER,
  ended_at INTEGER,
  input TEXT,
  output TEXT,
  error TEXT,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_steps_workflow ON workflow_steps (workflow_id);
CREATE INDEX IF NOT EXISTS idx_steps_status ON workflow_steps (status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_steps_workflow_number ON workflow_steps (workflow_id, step_number);

-- Agent Runs
CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY NOT NULL,
  session_id TEXT NOT NULL,
  workflow_step_id TEXT,
  agent_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at INTEGER,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  tools_called TEXT,
  result TEXT,
  error TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (workflow_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_agent_runs_session ON agent_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_step ON agent_runs (workflow_step_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_type ON agent_runs (agent_type);
CREATE INDEX IF NOT EXISTS idx_agent_runs_status ON agent_runs (status);

-- Tasks (Future)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_workflow_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  due_at INTEGER,
  completed_at INTEGER,
  metadata TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks (project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);

-- Commands (Future)
CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  command_type TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  queued_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  assigned_workflow_id TEXT,
  result TEXT,
  error TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_workflow_id) REFERENCES workflows(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_commands_project ON commands (project_id);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands (status);
CREATE INDEX IF NOT EXISTS idx_commands_queued ON commands (queued_at);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  display_name TEXT,
  notes TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_bookmarks_project ON bookmarks (project_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_entity ON bookmarks (entity_type, entity_id);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Entity Tags
CREATE TABLE IF NOT EXISTS entity_tags (
  id TEXT PRIMARY KEY NOT NULL,
  tag_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_entity_tags_tag ON entity_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_tags_unique ON entity_tags (tag_id, entity_type, entity_id);

-- Annotations
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  annotation_type TEXT NOT NULL DEFAULT 'note',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_annotations_entity ON annotations (entity_type, entity_id);

-- Preferences
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Sync Events (Event Sourcing for SaaS)
CREATE TABLE IF NOT EXISTS sync_events (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  payload TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending',
  synced_at INTEGER,
  sync_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  vector_clock TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_events_project ON sync_events (project_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_type ON sync_events (event_type);
CREATE INDEX IF NOT EXISTS idx_sync_events_status ON sync_events (sync_status);
CREATE INDEX IF NOT EXISTS idx_sync_events_entity ON sync_events (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_events_created ON sync_events (created_at);

-- Insert schema version (V2 - SaaS 확장)
INSERT OR IGNORE INTO schema_version (version, applied_at) VALUES (2, unixepoch());
`;

  // 각 statement를 개별 실행
  const statements = schema
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const statement of statements) {
    try {
      sqlite.exec(statement);
    } catch (error) {
      // 이미 존재하는 테이블/인덱스는 무시
      if (
        error instanceof Error &&
        !error.message.includes("already exists")
      ) {
        console.warn(`Schema statement warning: ${error.message}`);
      }
    }
  }
}

/**
 * DB 경로 반환
 */
export function getDbPath(): string {
  return join(homedir(), OBORA_DIR, DASHBOARD_DB);
}

/**
 * DB 존재 여부 확인
 */
export function dbExists(): boolean {
  return existsSync(getDbPath());
}

/**
 * Global Obora Configuration
 * ~/.obora/ 디렉토리 및 dashboard.db 관리
 */

import { homedir } from "node:os";
import { join } from "pathe";
import { existsSync, mkdirSync } from "node:fs";
import Database from "better-sqlite3";

// ============================================================================
// Constants
// ============================================================================

const OBORA_DIR = ".obora";
const DASHBOARD_DB = "dashboard.db";
const SCHEMA_VERSION = 1;

// ============================================================================
// Paths
// ============================================================================

export function getOboraDir(): string {
  return join(homedir(), OBORA_DIR);
}

export function getDashboardDbPath(): string {
  return join(getOboraDir(), DASHBOARD_DB);
}

// ============================================================================
// Schema
// ============================================================================

const DASHBOARD_SCHEMA = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Project registry
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL UNIQUE,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  icon TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);

-- Project groups
CREATE TABLE IF NOT EXISTS project_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#6366f1',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Project-group mapping
CREATE TABLE IF NOT EXISTS project_group_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL REFERENCES project_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, group_id)
);

-- Bookmarks (polymorphic)
CREATE TABLE IF NOT EXISTS bookmarks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('session', 'workflow', 'agent_run', 'task')),
  entity_id TEXT NOT NULL,
  display_name TEXT,
  notes TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_project ON bookmarks(project_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_entity ON bookmarks(entity_type, entity_id);

-- Tags
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#6366f1',
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Entity-tag mapping
CREATE TABLE IF NOT EXISTS entity_tags (
  tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (tag_id, project_id, entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_tags_entity ON entity_tags(project_id, entity_type, entity_id);

-- Annotations
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  annotation_type TEXT NOT NULL DEFAULT 'note' CHECK (annotation_type IN ('note', 'warning', 'error', 'success')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, entity_type, entity_id)
);

-- User preferences
CREATE TABLE IF NOT EXISTS preferences (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Saved views
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  view_type TEXT NOT NULL CHECK (view_type IN ('sessions', 'workflows', 'agents', 'tasks')),
  project_ids TEXT,
  filters TEXT NOT NULL DEFAULT '{}',
  sort_config TEXT,
  columns TEXT,
  layout TEXT NOT NULL DEFAULT 'table' CHECK (layout IN ('table', 'grid', 'timeline')),
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Metrics cache
CREATE TABLE IF NOT EXISTS metrics_cache (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  data TEXT NOT NULL,
  cached_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  PRIMARY KEY (project_id, metric_type)
);

-- Insert schema version
INSERT OR IGNORE INTO schema_version (version) VALUES (${SCHEMA_VERSION});
`;

// ============================================================================
// Initialization
// ============================================================================

let initialized = false;

/**
 * Initialize global obora directory and database
 * Called automatically on CLI startup
 */
export function initializeGlobalConfig(): void {
  if (initialized) return;

  const oboraDir = getOboraDir();
  const dbPath = getDashboardDbPath();

  // Create directory if needed
  if (!existsSync(oboraDir)) {
    mkdirSync(oboraDir, { recursive: true });
  }

  // Initialize database
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DASHBOARD_SCHEMA);
  db.close();

  initialized = true;
}

/**
 * Get database connection (for queries)
 */
export function getGlobalDb(): Database.Database {
  initializeGlobalConfig();
  return new Database(getDashboardDbPath());
}

// ============================================================================
// Project Registration
// ============================================================================

/**
 * Register a project in the global database
 */
export function registerProject(
  path: string,
  name: string,
  options?: { description?: string; color?: string }
): string {
  const db = getGlobalDb();

  try {
    // Check if already registered
    const existing = db.prepare("SELECT id FROM projects WHERE path = ?").get(path) as { id: string } | undefined;
    if (existing) {
      // Update last_opened_at
      db.prepare("UPDATE projects SET last_opened_at = datetime('now') WHERE id = ?").run(existing.id);
      return existing.id;
    }

    // Generate ID
    const id = `proj_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    // Insert new project
    db.prepare(`
      INSERT INTO projects (id, name, path, description, color)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      path,
      options?.description ?? null,
      options?.color ?? "#6366f1"
    );

    return id;
  } finally {
    db.close();
  }
}

/**
 * Get all registered projects
 */
export function getRegisteredProjects(): Array<{
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  isFavorite: boolean;
}> {
  const db = getGlobalDb();

  try {
    const rows = db.prepare(`
      SELECT id, name, path, is_active, is_favorite
      FROM projects
      ORDER BY is_favorite DESC, sort_order ASC, name ASC
    `).all() as Array<{
      id: string;
      name: string;
      path: string;
      is_active: number;
      is_favorite: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      isActive: row.is_active === 1,
      isFavorite: row.is_favorite === 1,
    }));
  } finally {
    db.close();
  }
}

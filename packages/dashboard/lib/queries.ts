/**
 * Dashboard Database Queries
 * CRUD operations for dashboard.db tables
 */

import Database from "better-sqlite3";
import { getDashboardDbPath } from "./db";
import type {
  Project,
  ProjectRow,
  Bookmark,
  BookmarkRow,
  Tag,
  TagRow,
  EntityTag,
  EntityTagRow,
  Annotation,
  AnnotationRow,
  CreateProjectInput,
  UpdateProjectInput,
  CreateBookmarkInput,
  CreateTagInput,
  CreateAnnotationInput,
  ProjectFilters,
  BookmarkFilters,
} from "./types";

// ============================================================================
// Database Connection
// ============================================================================

/**
 * Get database connection
 * Opens a new connection - caller should close it when done
 */
function getDb(): Database.Database {
  const db = new Database(getDashboardDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

// ============================================================================
// Type Converters
// ============================================================================

/**
 * Convert ProjectRow (snake_case) to Project (camelCase)
 */
function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    path: row.path,
    description: row.description,
    color: row.color,
    icon: row.icon,
    isActive: row.is_active === 1,
    isFavorite: row.is_favorite === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastOpenedAt: row.last_opened_at,
    lastError: row.last_error,
    lastSyncAt: row.last_sync_at,
  };
}

/**
 * Convert BookmarkRow (snake_case) to Bookmark (camelCase)
 */
function rowToBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    displayName: row.display_name,
    notes: row.notes,
    pinned: row.pinned === 1,
    createdAt: row.created_at,
  };
}

/**
 * Convert TagRow (snake_case) to Tag (camelCase)
 */
function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    description: row.description,
    createdAt: row.created_at,
  };
}

/**
 * Convert EntityTagRow (snake_case) to EntityTag (camelCase)
 */
function rowToEntityTag(row: EntityTagRow): EntityTag {
  return {
    tagId: row.tag_id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    createdAt: row.created_at,
  };
}

/**
 * Convert AnnotationRow (snake_case) to Annotation (camelCase)
 */
function rowToAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    projectId: row.project_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    title: row.title,
    content: row.content,
    annotationType: row.annotation_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generate ID with prefix
 */
function generateId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

// ============================================================================
// Projects
// ============================================================================

/**
 * Get all projects with optional filters
 */
export function getProjects(filters?: ProjectFilters): Project[] {
  const db = getDb();

  try {
    let query = "SELECT * FROM projects WHERE 1=1";
    const params: unknown[] = [];

    if (filters?.isActive !== undefined) {
      query += " AND is_active = ?";
      params.push(filters.isActive ? 1 : 0);
    }

    if (filters?.isFavorite !== undefined) {
      query += " AND is_favorite = ?";
      params.push(filters.isFavorite ? 1 : 0);
    }

    if (filters?.search) {
      query += " AND (name LIKE ? OR description LIKE ?)";
      const searchPattern = `%${filters.search}%`;
      params.push(searchPattern, searchPattern);
    }

    query += " ORDER BY is_favorite DESC, sort_order ASC, name ASC";

    const rows = db.prepare(query).all(...params) as ProjectRow[];
    return rows.map(rowToProject);
  } finally {
    db.close();
  }
}

/**
 * Get single project by ID
 */
export function getProject(id: string): Project | null {
  const db = getDb();

  try {
    const row = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow | undefined;

    return row ? rowToProject(row) : null;
  } finally {
    db.close();
  }
}

/**
 * Create new project
 */
export function createProject(input: CreateProjectInput): Project {
  const db = getDb();

  try {
    const id = generateId("proj");
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO projects (
        id, name, path, description, color, icon,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.path,
      input.description ?? null,
      input.color ?? "#6366f1",
      input.icon ?? null,
      now,
      now
    );

    const row = db
      .prepare("SELECT * FROM projects WHERE id = ?")
      .get(id) as ProjectRow;

    return rowToProject(row);
  } finally {
    db.close();
  }
}

/**
 * Update project
 */
export function updateProject(
  id: string,
  input: UpdateProjectInput
): Project | null {
  const db = getDb();

  try {
    const updates: string[] = [];
    const params: unknown[] = [];

    if (input.name !== undefined) {
      updates.push("name = ?");
      params.push(input.name);
    }

    if (input.description !== undefined) {
      updates.push("description = ?");
      params.push(input.description);
    }

    if (input.color !== undefined) {
      updates.push("color = ?");
      params.push(input.color);
    }

    if (input.icon !== undefined) {
      updates.push("icon = ?");
      params.push(input.icon);
    }

    if (input.isActive !== undefined) {
      updates.push("is_active = ?");
      params.push(input.isActive ? 1 : 0);
    }

    if (input.isFavorite !== undefined) {
      updates.push("is_favorite = ?");
      params.push(input.isFavorite ? 1 : 0);
    }

    if (input.sortOrder !== undefined) {
      updates.push("sort_order = ?");
      params.push(input.sortOrder);
    }

    if (updates.length === 0) {
      return getProject(id);
    }

    updates.push("updated_at = ?");
    params.push(new Date().toISOString());

    params.push(id);

    const query = `UPDATE projects SET ${updates.join(", ")} WHERE id = ?`;
    const result = db.prepare(query).run(...params);

    if (result.changes === 0) {
      return null;
    }

    return getProject(id);
  } finally {
    db.close();
  }
}

/**
 * Delete project
 */
export function deleteProject(id: string): boolean {
  const db = getDb();

  try {
    const result = db.prepare("DELETE FROM projects WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============================================================================
// Bookmarks
// ============================================================================

/**
 * Get bookmarks with optional filters
 */
export function getBookmarks(filters?: BookmarkFilters): Bookmark[] {
  const db = getDb();

  try {
    let query = "SELECT * FROM bookmarks WHERE 1=1";
    const params: unknown[] = [];

    if (filters?.projectId) {
      query += " AND project_id = ?";
      params.push(filters.projectId);
    }

    if (filters?.entityType) {
      query += " AND entity_type = ?";
      params.push(filters.entityType);
    }

    if (filters?.pinned !== undefined) {
      query += " AND pinned = ?";
      params.push(filters.pinned ? 1 : 0);
    }

    query += " ORDER BY pinned DESC, created_at DESC";

    const rows = db.prepare(query).all(...params) as BookmarkRow[];
    return rows.map(rowToBookmark);
  } finally {
    db.close();
  }
}

/**
 * Create new bookmark
 */
export function createBookmark(input: CreateBookmarkInput): Bookmark {
  const db = getDb();

  try {
    const id = generateId("bm");
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO bookmarks (
        id, project_id, entity_type, entity_id,
        display_name, notes, pinned, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.projectId,
      input.entityType,
      input.entityId,
      input.displayName ?? null,
      input.notes ?? null,
      input.pinned ? 1 : 0,
      now
    );

    const row = db
      .prepare("SELECT * FROM bookmarks WHERE id = ?")
      .get(id) as BookmarkRow;

    return rowToBookmark(row);
  } finally {
    db.close();
  }
}

/**
 * Delete bookmark
 */
export function deleteBookmark(id: string): boolean {
  const db = getDb();

  try {
    const result = db.prepare("DELETE FROM bookmarks WHERE id = ?").run(id);
    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============================================================================
// Tags
// ============================================================================

/**
 * Get all tags
 */
export function getTags(): Tag[] {
  const db = getDb();

  try {
    const rows = db
      .prepare("SELECT * FROM tags ORDER BY name ASC")
      .all() as TagRow[];

    return rows.map(rowToTag);
  } finally {
    db.close();
  }
}

/**
 * Get tags for specific entity
 */
export function getEntityTags(
  projectId: string,
  entityType: string,
  entityId: string
): Tag[] {
  const db = getDb();

  try {
    const rows = db.prepare(`
      SELECT t.*
      FROM tags t
      INNER JOIN entity_tags et ON et.tag_id = t.id
      WHERE et.project_id = ?
        AND et.entity_type = ?
        AND et.entity_id = ?
      ORDER BY t.name ASC
    `).all(projectId, entityType, entityId) as TagRow[];

    return rows.map(rowToTag);
  } finally {
    db.close();
  }
}

/**
 * Create new tag
 */
export function createTag(input: CreateTagInput): Tag {
  const db = getDb();

  try {
    const id = generateId("tag");
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO tags (id, name, color, description, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.color ?? "#6366f1",
      input.description ?? null,
      now
    );

    const row = db.prepare("SELECT * FROM tags WHERE id = ?").get(id) as TagRow;

    return rowToTag(row);
  } finally {
    db.close();
  }
}

/**
 * Add tag to entity
 */
export function addTagToEntity(
  tagId: string,
  projectId: string,
  entityType: string,
  entityId: string
): boolean {
  const db = getDb();

  try {
    const now = new Date().toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO entity_tags (
        tag_id, project_id, entity_type, entity_id, created_at
      )
      VALUES (?, ?, ?, ?, ?)
    `).run(tagId, projectId, entityType, entityId, now);

    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) {
      throw new Error("Tag or project not found");
    }
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Remove tag from entity
 */
export function removeTagFromEntity(
  tagId: string,
  projectId: string,
  entityType: string,
  entityId: string
): boolean {
  const db = getDb();

  try {
    const result = db.prepare(`
      DELETE FROM entity_tags
      WHERE tag_id = ?
        AND project_id = ?
        AND entity_type = ?
        AND entity_id = ?
    `).run(tagId, projectId, entityType, entityId);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

// ============================================================================
// Annotations
// ============================================================================

/**
 * Get annotation for entity
 */
export function getAnnotation(
  projectId: string,
  entityType: string,
  entityId: string
): Annotation | null {
  const db = getDb();

  try {
    const row = db.prepare(`
      SELECT * FROM annotations
      WHERE project_id = ?
        AND entity_type = ?
        AND entity_id = ?
    `).get(projectId, entityType, entityId) as AnnotationRow | undefined;

    return row ? rowToAnnotation(row) : null;
  } finally {
    db.close();
  }
}

/**
 * Create or update annotation
 */
export function upsertAnnotation(
  input: CreateAnnotationInput
): Annotation {
  const db = getDb();

  try {
    const existing = getAnnotation(
      input.projectId,
      input.entityType,
      input.entityId
    );

    const now = new Date().toISOString();

    if (existing) {
      db.prepare(`
        UPDATE annotations
        SET title = ?,
            content = ?,
            annotation_type = ?,
            updated_at = ?
        WHERE project_id = ?
          AND entity_type = ?
          AND entity_id = ?
      `).run(
        input.title ?? null,
        input.content ?? null,
        input.annotationType ?? "note",
        now,
        input.projectId,
        input.entityType,
        input.entityId
      );

      return getAnnotation(input.projectId, input.entityType, input.entityId)!;
    }

    const id = generateId("ann");

    db.prepare(`
      INSERT INTO annotations (
        id, project_id, entity_type, entity_id,
        title, content, annotation_type,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.projectId,
      input.entityType,
      input.entityId,
      input.title ?? null,
      input.content ?? null,
      input.annotationType ?? "note",
      now,
      now
    );

    const row = db
      .prepare("SELECT * FROM annotations WHERE id = ?")
      .get(id) as AnnotationRow;

    return rowToAnnotation(row);
  } finally {
    db.close();
  }
}

/**
 * Delete annotation
 */
export function deleteAnnotation(
  projectId: string,
  entityType: string,
  entityId: string
): boolean {
  const db = getDb();

  try {
    const result = db.prepare(`
      DELETE FROM annotations
      WHERE project_id = ?
        AND entity_type = ?
        AND entity_id = ?
    `).run(projectId, entityType, entityId);

    return result.changes > 0;
  } finally {
    db.close();
  }
}

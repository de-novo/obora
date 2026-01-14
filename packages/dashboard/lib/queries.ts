/**
 * Dashboard Database Queries
 * CRUD operations using Drizzle ORM
 */

import { eq, and, or, desc, asc, like } from "@obora/database";
import { getDb } from "./db";
import * as schema from "./schema";
import type { Project, Bookmark, Tag, Annotation } from "./schema";
import type {
  CreateProjectInput,
  UpdateProjectInput,
  CreateBookmarkInput,
  CreateTagInput,
  CreateAnnotationInput,
  ProjectFilters,
  BookmarkFilters,
  BookmarkEntityType,
} from "./types";

// ============================================================================
// Utilities
// ============================================================================

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
  if (!db) return [];

  let query = db.select().from(schema.projects).$dynamic();

  const conditions = [];

  if (filters?.status !== undefined) {
    conditions.push(eq(schema.projects.status, filters.status));
  }

  if (filters?.search) {
    const searchPattern = `%${filters.search}%`;
    conditions.push(
      or(
        like(schema.projects.name, searchPattern),
        like(schema.projects.description, searchPattern)
      )
    );
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = query
    .orderBy(
      desc(schema.projects.updatedAt),
      asc(schema.projects.name)
    )
    .all();

  return rows as Project[];
}

/**
 * Get single project by ID
 */
export function getProject(id: string): Project | null {
  const db = getDb();
  if (!db) return null;

  const row = db
    .select()
    .from(schema.projects)
    .where(eq(schema.projects.id, id))
    .get();

  return row as Project | null;
}

/**
 * Create new project
 */
export function createProject(input: CreateProjectInput): Project {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const id = generateId("proj");

  db.insert(schema.projects)
    .values({
      id,
      name: input.name,
      path: input.path,
      description: input.description ?? null,
      color: input.color ?? "#6366f1",
      icon: input.icon ?? null,
    })
    .run();

  return getProject(id)!;
}

/**
 * Update project
 */
export function updateProject(
  id: string,
  input: UpdateProjectInput
): Project | null {
  const db = getDb();
  if (!db) return null;

  const updates: Partial<typeof schema.projects.$inferInsert> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  if (input.color !== undefined) updates.color = input.color;
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.status !== undefined) updates.status = input.status;

  if (Object.keys(updates).length === 0) {
    return getProject(id);
  }

  updates.updatedAt = new Date();

  const result = db
    .update(schema.projects)
    .set(updates)
    .where(eq(schema.projects.id, id))
    .run();

  if (result.changes === 0) {
    return null;
  }

  return getProject(id);
}

/**
 * Delete project
 */
export function deleteProject(id: string): boolean {
  const db = getDb();
  if (!db) return false;

  const result = db
    .delete(schema.projects)
    .where(eq(schema.projects.id, id))
    .run();

  return result.changes > 0;
}

// ============================================================================
// Bookmarks
// ============================================================================

/**
 * Get bookmarks with optional filters
 */
export function getBookmarks(filters?: BookmarkFilters): Bookmark[] {
  const db = getDb();
  if (!db) return [];

  let query = db.select().from(schema.bookmarks).$dynamic();

  const conditions = [];

  if (filters?.projectId) {
    conditions.push(eq(schema.bookmarks.projectId, filters.projectId));
  }

  if (filters?.entityType) {
    conditions.push(eq(schema.bookmarks.entityType, filters.entityType as BookmarkEntityType));
  }

  if (filters?.pinned !== undefined) {
    conditions.push(eq(schema.bookmarks.pinned, filters.pinned));
  }

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  const rows = query
    .orderBy(desc(schema.bookmarks.pinned), desc(schema.bookmarks.createdAt))
    .all();

  return rows as Bookmark[];
}

/**
 * Get single bookmark by ID
 */
export function getBookmark(id: string): Bookmark | null {
  const db = getDb();
  if (!db) return null;

  const row = db
    .select()
    .from(schema.bookmarks)
    .where(eq(schema.bookmarks.id, id))
    .get();

  return row as Bookmark | null;
}

/**
 * Create new bookmark
 */
export function createBookmark(input: CreateBookmarkInput): Bookmark {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const id = generateId("bm");

  db.insert(schema.bookmarks)
    .values({
      id,
      projectId: input.projectId,
      entityType: input.entityType as BookmarkEntityType,
      entityId: input.entityId,
      displayName: input.displayName ?? null,
      notes: input.notes ?? null,
      pinned: input.pinned ?? false,
    })
    .run();

  return getBookmark(id)!;
}

/**
 * Delete bookmark
 */
export function deleteBookmark(id: string): boolean {
  const db = getDb();
  if (!db) return false;

  const result = db
    .delete(schema.bookmarks)
    .where(eq(schema.bookmarks.id, id))
    .run();

  return result.changes > 0;
}

// ============================================================================
// Tags
// ============================================================================

/**
 * Get all tags
 */
export function getTags(): Tag[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .select()
    .from(schema.tags)
    .orderBy(asc(schema.tags.name))
    .all();

  return rows as Tag[];
}

/**
 * Entity type for tags
 */
type TagEntityType = "project" | "session" | "workflow" | "step" | "agent_run" | "task";

/**
 * Get tags for specific entity
 */
export function getEntityTags(
  entityType: TagEntityType,
  entityId: string
): Tag[] {
  const db = getDb();
  if (!db) return [];

  const rows = db
    .select({
      id: schema.tags.id,
      name: schema.tags.name,
      color: schema.tags.color,
      description: schema.tags.description,
      createdAt: schema.tags.createdAt,
    })
    .from(schema.tags)
    .innerJoin(schema.entityTags, eq(schema.entityTags.tagId, schema.tags.id))
    .where(
      and(
        eq(schema.entityTags.entityType, entityType),
        eq(schema.entityTags.entityId, entityId)
      )
    )
    .orderBy(asc(schema.tags.name))
    .all();

  return rows as Tag[];
}

/**
 * Create new tag
 */
export function createTag(input: CreateTagInput): Tag {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const id = generateId("tag");

  db.insert(schema.tags)
    .values({
      id,
      name: input.name,
      color: input.color ?? "#6366f1",
      description: input.description ?? null,
    })
    .run();

  const row = db
    .select()
    .from(schema.tags)
    .where(eq(schema.tags.id, id))
    .get();

  return row as Tag;
}

/**
 * Add tag to entity
 */
export function addTagToEntity(
  tagId: string,
  entityType: TagEntityType,
  entityId: string
): boolean {
  const db = getDb();
  if (!db) return false;

  const id = generateId("et");

  try {
    db.insert(schema.entityTags)
      .values({
        id,
        tagId,
        entityType,
        entityId,
      })
      .onConflictDoNothing()
      .run();

    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("FOREIGN KEY")) {
      throw new Error("Tag not found");
    }
    throw error;
  }
}

/**
 * Remove tag from entity
 */
export function removeTagFromEntity(
  tagId: string,
  entityType: TagEntityType,
  entityId: string
): boolean {
  const db = getDb();
  if (!db) return false;

  const result = db
    .delete(schema.entityTags)
    .where(
      and(
        eq(schema.entityTags.tagId, tagId),
        eq(schema.entityTags.entityType, entityType),
        eq(schema.entityTags.entityId, entityId)
      )
    )
    .run();

  return result.changes > 0;
}

// ============================================================================
// Annotations
// ============================================================================

/**
 * Annotation type enum
 */
type AnnotationTypeEnum = "note" | "warning" | "error" | "success" | "info";

/**
 * Get annotation for entity
 */
export function getAnnotation(
  entityType: TagEntityType,
  entityId: string
): Annotation | null {
  const db = getDb();
  if (!db) return null;

  const row = db
    .select()
    .from(schema.annotations)
    .where(
      and(
        eq(schema.annotations.entityType, entityType),
        eq(schema.annotations.entityId, entityId)
      )
    )
    .get();

  return row as Annotation | null;
}

/**
 * Create or update annotation
 */
export function upsertAnnotation(input: CreateAnnotationInput): Annotation {
  const db = getDb();
  if (!db) throw new Error("Database not available");

  const entityType = input.entityType as TagEntityType;
  const annotationType = (input.annotationType ?? "note") as AnnotationTypeEnum;

  const existing = getAnnotation(entityType, input.entityId);

  if (existing) {
    db.update(schema.annotations)
      .set({
        title: input.title ?? null,
        content: input.content ?? null,
        annotationType,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.annotations.entityType, entityType),
          eq(schema.annotations.entityId, input.entityId)
        )
      )
      .run();

    return getAnnotation(entityType, input.entityId)!;
  }

  const id = generateId("ann");

  db.insert(schema.annotations)
    .values({
      id,
      entityType,
      entityId: input.entityId,
      title: input.title ?? null,
      content: input.content ?? null,
      annotationType,
    })
    .run();

  const row = db
    .select()
    .from(schema.annotations)
    .where(eq(schema.annotations.id, id))
    .get();

  return row as Annotation;
}

/**
 * Delete annotation
 */
export function deleteAnnotation(
  entityType: TagEntityType,
  entityId: string
): boolean {
  const db = getDb();
  if (!db) return false;

  const result = db
    .delete(schema.annotations)
    .where(
      and(
        eq(schema.annotations.entityType, entityType),
        eq(schema.annotations.entityId, entityId)
      )
    )
    .run();

  return result.changes > 0;
}

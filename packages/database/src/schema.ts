/**
 * Drizzle ORM Schema
 * Shared database schema for obora dashboard
 *
 * @see https://orm.drizzle.team/docs/sql-schema-declaration
 */

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

// ============================================================================
// Schema Version
// ============================================================================

export const schemaVersion = sqliteTable("schema_version", {
  version: integer("version").primaryKey(),
  appliedAt: text("applied_at").notNull().default("datetime('now')"),
});

// ============================================================================
// Projects
// ============================================================================

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    path: text("path").notNull().unique(),
    description: text("description"),
    color: text("color").notNull().default("#6366f1"),
    icon: text("icon"),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default("datetime('now')"),
    updatedAt: text("updated_at").notNull().default("datetime('now')"),
    lastOpenedAt: text("last_opened_at"),
    lastError: text("last_error"),
    lastSyncAt: text("last_sync_at"),
  },
  (table) => [
    index("idx_projects_path").on(table.path),
    index("idx_projects_active").on(table.isActive),
  ]
);

// ============================================================================
// Project Groups
// ============================================================================

export const projectGroups = sqliteTable("project_groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: text("created_at").notNull().default("datetime('now')"),
});

export const projectGroupMembers = sqliteTable("project_group_members", {
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  groupId: text("group_id")
    .notNull()
    .references(() => projectGroups.id, { onDelete: "cascade" }),
});

// ============================================================================
// Bookmarks
// ============================================================================

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    entityType: text("entity_type", {
      enum: ["session", "workflow", "agent_run", "task"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    displayName: text("display_name"),
    notes: text("notes"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull().default("datetime('now')"),
  },
  (table) => [
    index("idx_bookmarks_project").on(table.projectId),
    index("idx_bookmarks_entity").on(table.entityType, table.entityId),
  ]
);

// ============================================================================
// Tags
// ============================================================================

export const tags = sqliteTable("tags", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#6366f1"),
  description: text("description"),
  createdAt: text("created_at").notNull().default("datetime('now')"),
});

export const entityTags = sqliteTable(
  "entity_tags",
  {
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: text("created_at").notNull().default("datetime('now')"),
  },
  (table) => [
    index("idx_entity_tags_entity").on(table.projectId, table.entityType, table.entityId),
  ]
);

// ============================================================================
// Annotations
// ============================================================================

export const annotations = sqliteTable("annotations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  title: text("title"),
  content: text("content"),
  annotationType: text("annotation_type", {
    enum: ["note", "warning", "error", "success"],
  })
    .notNull()
    .default("note"),
  createdAt: text("created_at").notNull().default("datetime('now')"),
  updatedAt: text("updated_at").notNull().default("datetime('now')"),
});

// ============================================================================
// Preferences
// ============================================================================

export const preferences = sqliteTable("preferences", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default("datetime('now')"),
});

// ============================================================================
// Saved Views
// ============================================================================

export const savedViews = sqliteTable("saved_views", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  viewType: text("view_type", {
    enum: ["sessions", "workflows", "agents", "tasks"],
  }).notNull(),
  projectIds: text("project_ids"), // JSON string
  filters: text("filters").notNull().default("{}"),
  sortConfig: text("sort_config"),
  columns: text("columns"),
  layout: text("layout", { enum: ["table", "grid", "timeline"] })
    .notNull()
    .default("table"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default("datetime('now')"),
  updatedAt: text("updated_at").notNull().default("datetime('now')"),
});

// ============================================================================
// Metrics Cache
// ============================================================================

export const metricsCache = sqliteTable("metrics_cache", {
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  metricType: text("metric_type").notNull(),
  data: text("data").notNull(), // JSON string
  cachedAt: text("cached_at").notNull().default("datetime('now')"),
  expiresAt: text("expires_at").notNull(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

export type ProjectGroup = typeof projectGroups.$inferSelect;
export type NewProjectGroup = typeof projectGroups.$inferInsert;

export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;

export type EntityTag = typeof entityTags.$inferSelect;
export type NewEntityTag = typeof entityTags.$inferInsert;

export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;

export type Preference = typeof preferences.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;
export type MetricsCache = typeof metricsCache.$inferSelect;

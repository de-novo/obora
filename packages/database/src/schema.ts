/**
 * Obora Central Database Schema
 * Stores all workflow data across projects
 *
 * @see https://orm.drizzle.team/docs/sql-schema-declaration
 */

import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

// ============================================================================
// Schema Version
// ============================================================================

export const schemaVersion = sqliteTable("schema_version", {
  version: integer("version").primaryKey(),
  appliedAt: integer("applied_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
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
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_projects_path").on(table.path),
    index("idx_projects_status").on(table.status),
  ]
);

// ============================================================================
// Sessions (Terminal session - multiple commands)
// ============================================================================

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["active", "completed", "failed", "interrupted"],
    })
      .notNull()
      .default("active"),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    totalTokens: integer("total_tokens").notNull().default(0),
    summary: text("summary"),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_sessions_project").on(table.projectId),
    index("idx_sessions_status").on(table.status),
    index("idx_sessions_started").on(table.startedAt),
  ]
);

// ============================================================================
// Workflows
// ============================================================================

export const workflows = sqliteTable(
  "workflows",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", {
      enum: ["implement", "fix", "review", "commit", "refactor", "test", "custom"],
    }).notNull(),
    status: text("status", {
      enum: ["pending", "planning", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    tokensUsed: integer("tokens_used").notNull().default(0),
  },
  (table) => [
    index("idx_workflows_session").on(table.sessionId),
    index("idx_workflows_type").on(table.type),
    index("idx_workflows_status").on(table.status),
  ]
);

// ============================================================================
// Workflow Steps
// ============================================================================

export const workflowSteps = sqliteTable(
  "workflow_steps",
  {
    id: text("id").primaryKey(),
    workflowId: text("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    agentType: text("agent_type").notNull(),
    taskDescription: text("task_description").notNull(),
    status: text("status", {
      enum: ["pending", "running", "completed", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    startedAt: integer("started_at", { mode: "timestamp" }),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    input: text("input", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
    tokensUsed: integer("tokens_used").notNull().default(0),
  },
  (table) => [
    index("idx_steps_workflow").on(table.workflowId),
    index("idx_steps_status").on(table.status),
    unique("idx_steps_workflow_number").on(table.workflowId, table.stepNumber),
  ]
);

// ============================================================================
// Agent Runs
// ============================================================================

export const agentRuns = sqliteTable(
  "agent_runs",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    workflowStepId: text("workflow_step_id").references(() => workflowSteps.id, {
      onDelete: "set null",
    }),
    agentType: text("agent_type").notNull(),
    status: text("status", {
      enum: ["running", "completed", "failed"],
    })
      .notNull()
      .default("running"),
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    endedAt: integer("ended_at", { mode: "timestamp" }),
    tokensUsed: integer("tokens_used").notNull().default(0),
    toolsCalled: text("tools_called", { mode: "json" }).$type<string[]>(),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (table) => [
    index("idx_agent_runs_session").on(table.sessionId),
    index("idx_agent_runs_step").on(table.workflowStepId),
    index("idx_agent_runs_type").on(table.agentType),
    index("idx_agent_runs_status").on(table.status),
  ]
);

// ============================================================================
// Tasks (Future: Task Queue)
// ============================================================================

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    priority: text("priority", {
      enum: ["low", "medium", "high", "urgent"],
    })
      .notNull()
      .default("medium"),
    status: text("status", {
      enum: ["pending", "queued", "in_progress", "completed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    assignedWorkflowId: text("assigned_workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    dueAt: integer("due_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (table) => [
    index("idx_tasks_project").on(table.projectId),
    index("idx_tasks_status").on(table.status),
    index("idx_tasks_priority").on(table.priority),
  ]
);

// ============================================================================
// Commands (Future: Command Queue)
// ============================================================================

export const commands = sqliteTable(
  "commands",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    commandType: text("command_type", {
      enum: ["implement", "fix", "review", "commit", "refactor", "test", "custom"],
    }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    queuedAt: integer("queued_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    assignedWorkflowId: text("assigned_workflow_id").references(() => workflows.id, {
      onDelete: "set null",
    }),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    error: text("error"),
  },
  (table) => [
    index("idx_commands_project").on(table.projectId),
    index("idx_commands_status").on(table.status),
    index("idx_commands_queued").on(table.queuedAt),
  ]
);

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
      enum: ["session", "workflow", "step", "agent_run", "task"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    displayName: text("display_name"),
    notes: text("notes"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
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
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const entityTags = sqliteTable(
  "entity_tags",
  {
    id: text("id").primaryKey(),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    entityType: text("entity_type", {
      enum: ["project", "session", "workflow", "step", "agent_run", "task"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_entity_tags_tag").on(table.tagId),
    index("idx_entity_tags_entity").on(table.entityType, table.entityId),
    unique("idx_entity_tags_unique").on(table.tagId, table.entityType, table.entityId),
  ]
);

// ============================================================================
// Annotations
// ============================================================================

export const annotations = sqliteTable(
  "annotations",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", {
      enum: ["project", "session", "workflow", "step", "agent_run", "task"],
    }).notNull(),
    entityId: text("entity_id").notNull(),
    title: text("title"),
    content: text("content"),
    annotationType: text("annotation_type", {
      enum: ["note", "warning", "error", "success", "info"],
    })
      .notNull()
      .default("note"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("idx_annotations_entity").on(table.entityType, table.entityId),
  ]
);

// ============================================================================
// Preferences
// ============================================================================

export const preferences = sqliteTable("preferences", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// ============================================================================
// Type Exports
// ============================================================================

// Projects
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// Sessions
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

// Workflows
export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;

// Workflow Steps
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;

// Agent Runs
export type AgentRun = typeof agentRuns.$inferSelect;
export type NewAgentRun = typeof agentRuns.$inferInsert;

// Tasks
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// Commands
export type Command = typeof commands.$inferSelect;
export type NewCommand = typeof commands.$inferInsert;

// Bookmarks
export type Bookmark = typeof bookmarks.$inferSelect;
export type NewBookmark = typeof bookmarks.$inferInsert;

// Tags
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type EntityTag = typeof entityTags.$inferSelect;
export type NewEntityTag = typeof entityTags.$inferInsert;

// Annotations
export type Annotation = typeof annotations.$inferSelect;
export type NewAnnotation = typeof annotations.$inferInsert;

// Preferences
export type Preference = typeof preferences.$inferSelect;

// ============================================================================
// Enum Types
// ============================================================================

export type ProjectStatus = "active" | "archived";
export type SessionStatus = "active" | "completed" | "failed" | "interrupted";
export type WorkflowType = "implement" | "fix" | "review" | "commit" | "refactor" | "test" | "custom";
export type WorkflowStatus = "pending" | "planning" | "running" | "completed" | "failed" | "cancelled";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";
export type AgentRunStatus = "running" | "completed" | "failed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type TaskStatus = "pending" | "queued" | "in_progress" | "completed" | "cancelled";
export type CommandStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type EntityType = "project" | "session" | "workflow" | "step" | "agent_run" | "task";
export type AnnotationType = "note" | "warning" | "error" | "success" | "info";

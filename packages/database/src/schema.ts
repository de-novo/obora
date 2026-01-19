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
    path: text("path").notNull(),
    description: text("description"),
    color: text("color").notNull().default("#6366f1"),
    icon: text("icon"),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),

    // ======== Project Identity (SaaS-ready) ========
    // .obora/project.yaml의 id - 최우선 식별자
    configId: text("config_id").unique(),
    // Git remote origin URL - secondary 식별자
    gitRemote: text("git_remote"),

    // ======== Cloud Sync (Future SaaS) ========
    // 클라우드 조직 ID
    organizationId: text("organization_id"),
    // 클라우드에서의 프로젝트 ID
    externalId: text("external_id"),
    // 동기화 활성화 여부
    syncEnabled: integer("sync_enabled", { mode: "boolean" })
      .notNull()
      .default(false),
    // 마지막 동기화 시간
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),

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
    index("idx_projects_config_id").on(table.configId),
    index("idx_projects_git_remote").on(table.gitRemote),
    index("idx_projects_org").on(table.organizationId),
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
    // Current Working Directory where the session was started
    cwd: text("cwd"),
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
    // Direct project reference (optional, for cross-session queries)
    projectId: text("project_id").references(() => projects.id),
    // Current Working Directory where the workflow was started
    cwd: text("cwd"),
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
    output: text("output"), // Plain text (Claude's response)
    error: text("error"),
    tokensUsed: integer("tokens_used").notNull().default(0),
  },
  (table) => [
    index("idx_workflows_session").on(table.sessionId),
    index("idx_workflows_project").on(table.projectId),
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
    output: text("output"), // Plain text (agent's response)
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

// Tool call detail for agent runs
interface ToolCallDetail {
  toolName: string;
  input: Record<string, unknown>;
  output?: unknown;
  duration?: number;
  error?: string;
}

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

    // ======== Model & Prompt Info ========
    model: text("model"), // sonnet, opus, haiku, etc.
    prompt: text("prompt"), // The task/prompt given to the agent
    systemPrompt: text("system_prompt"), // System prompt if any

    // ======== Execution Details ========
    startedAt: integer("started_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    endedAt: integer("ended_at", { mode: "timestamp" }),

    // ======== Token Usage ========
    tokensUsed: integer("tokens_used").notNull().default(0),
    inputTokens: integer("input_tokens").default(0),
    outputTokens: integer("output_tokens").default(0),

    // ======== Tool Calls (Detailed) ========
    toolsCalled: text("tools_called", { mode: "json" }).$type<string[]>(),
    toolCallDetails: text("tool_call_details", { mode: "json" }).$type<ToolCallDetail[]>(),

    // ======== Output ========
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    output: text("output"), // Raw text output
    error: text("error"),

    // ======== Real-time Tracking ========
    currentTool: text("current_tool"), // Currently executing tool name
    currentToolInput: text("current_tool_input", { mode: "json" }).$type<Record<string, unknown>>(), // Current tool input (brief)
    toolCallCount: integer("tool_call_count").default(0), // Number of tools called so far
    lastStreamUpdate: integer("last_stream_update", { mode: "timestamp" }),
  },
  (table) => [
    index("idx_agent_runs_session").on(table.sessionId),
    index("idx_agent_runs_step").on(table.workflowStepId),
    index("idx_agent_runs_type").on(table.agentType),
    index("idx_agent_runs_status").on(table.status),
    index("idx_agent_runs_model").on(table.model),
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
// Sync Events (Event Sourcing for SaaS)
// ============================================================================

export const syncEvents = sqliteTable(
  "sync_events",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),

    // 이벤트 타입
    eventType: text("event_type", {
      enum: [
        // Session events
        "session.started",
        "session.completed",
        "session.failed",
        // Workflow events
        "workflow.started",
        "workflow.planned",
        "workflow.completed",
        "workflow.failed",
        // Step events
        "step.started",
        "step.completed",
        "step.failed",
        // Agent events
        "agent.started",
        "agent.completed",
        "agent.failed",
        // Project events
        "project.created",
        "project.updated",
        "project.archived",
      ],
    }).notNull(),

    // 관련 엔티티
    entityType: text("entity_type", {
      enum: ["project", "session", "workflow", "step", "agent_run"],
    }).notNull(),
    entityId: text("entity_id").notNull(),

    // 이벤트 데이터 (JSON)
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),

    // 동기화 상태
    syncStatus: text("sync_status", {
      enum: ["pending", "synced", "failed", "skipped"],
    })
      .notNull()
      .default("pending"),
    syncedAt: integer("synced_at", { mode: "timestamp" }),
    syncError: text("sync_error"),

    // 타임스탬프
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),

    // Vector clock for conflict resolution (future)
    vectorClock: text("vector_clock"),
  },
  (table) => [
    index("idx_sync_events_project").on(table.projectId),
    index("idx_sync_events_type").on(table.eventType),
    index("idx_sync_events_status").on(table.syncStatus),
    index("idx_sync_events_entity").on(table.entityType, table.entityId),
    index("idx_sync_events_created").on(table.createdAt),
  ]
);

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
export type { ToolCallDetail };

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

// Sync Events
export type SyncEvent = typeof syncEvents.$inferSelect;
export type NewSyncEvent = typeof syncEvents.$inferInsert;

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

// Sync Types
export type SyncEventType =
  | "session.started"
  | "session.completed"
  | "session.failed"
  | "workflow.started"
  | "workflow.planned"
  | "workflow.completed"
  | "workflow.failed"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "project.created"
  | "project.updated"
  | "project.archived";

export type SyncStatus = "pending" | "synced" | "failed" | "skipped";
export type SyncEntityType = "project" | "session" | "workflow" | "step" | "agent_run";

/**
 * Dashboard Types
 * Compatible with @obora/database schema
 */

// Re-export schema types
export type {
  Project,
  Session,
  Workflow,
  WorkflowStep,
  AgentRun,
  Task,
  Command,
  Bookmark,
  Tag,
  EntityTag,
  Annotation,
  Preference,
  // Enum types
  ProjectStatus,
  SessionStatus,
  WorkflowType,
  WorkflowStatus,
  StepStatus,
  AgentRunStatus,
  TaskPriority,
  TaskStatus,
  CommandStatus,
  EntityType,
  AnnotationType,
} from "@obora/database/schema";

// ============================================================================
// Result Pattern
// ============================================================================

/**
 * Result type for operations that can fail
 * @template T - Success value type
 * @template E - Error type (defaults to Error)
 */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Create a successful result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/**
 * Create an error result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// ============================================================================
// Dashboard-specific Types
// ============================================================================

/**
 * Bookmark entity types (subset for bookmarks table)
 */
export type BookmarkEntityType = "session" | "workflow" | "step" | "agent_run" | "task";

// ============================================================================
// API Response Types
// ============================================================================

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  timestamp: string;
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  error?: ApiError;
  timestamp: string;
}

/**
 * API error details
 */
export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  stack?: string;
}

// ============================================================================
// Input/Update Types
// ============================================================================

import type { ProjectStatus, AnnotationType as SchemaAnnotationType } from "@obora/database/schema";

/**
 * Project creation input
 */
export interface CreateProjectInput {
  name: string;
  path: string;
  description?: string;
  color?: string;
  icon?: string;
}

/**
 * Project update input
 */
export interface UpdateProjectInput {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  status?: ProjectStatus;
}

/**
 * Bookmark creation input
 */
export interface CreateBookmarkInput {
  projectId: string;
  entityType: BookmarkEntityType;
  entityId: string;
  displayName?: string;
  notes?: string;
  pinned?: boolean;
}

/**
 * Tag creation input
 */
export interface CreateTagInput {
  name: string;
  color?: string;
  description?: string;
}

/**
 * Annotation creation input
 */
export interface CreateAnnotationInput {
  entityType: string;
  entityId: string;
  title?: string;
  content?: string;
  annotationType?: SchemaAnnotationType;
}

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Project query filters
 */
export interface ProjectFilters {
  status?: ProjectStatus;
  search?: string;
}

/**
 * Bookmark query filters
 */
export interface BookmarkFilters {
  projectId?: string;
  entityType?: BookmarkEntityType;
  pinned?: boolean;
}

/**
 * Tag query filters
 */
export interface TagFilters {
  search?: string;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Database row to entity converter result
 */
export type ConvertedEntity<T> = T;

/**
 * Partial update type (all fields optional)
 */
export type PartialUpdate<T> = Partial<T>;

/**
 * Required fields for creation
 */
export type CreateInput<T> = Omit<T, "id" | "createdAt" | "updatedAt">;

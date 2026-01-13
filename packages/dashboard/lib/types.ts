/**
 * Dashboard Types
 * Generated from DASHBOARD_SCHEMA in packages/cli/src/utils/global-config.ts
 */

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
// Entity Types
// ============================================================================

/**
 * Project registry entity
 */
export interface Project {
  id: string;
  name: string;
  path: string;
  description: string | null;
  color: string;
  icon: string | null;
  isActive: boolean;
  isFavorite: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
  lastError: string | null;
  lastSyncAt: string | null;
}

/**
 * Project database row (snake_case)
 */
export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  description: string | null;
  color: string;
  icon: string | null;
  is_active: number;
  is_favorite: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
  last_error: string | null;
  last_sync_at: string | null;
}

/**
 * Project group entity
 */
export interface ProjectGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
  createdAt: string;
}

/**
 * Project group database row (snake_case)
 */
export interface ProjectGroupRow {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  created_at: string;
}

/**
 * Project-group mapping
 */
export interface ProjectGroupMember {
  projectId: string;
  groupId: string;
}

/**
 * Project-group mapping database row (snake_case)
 */
export interface ProjectGroupMemberRow {
  project_id: string;
  group_id: string;
}

/**
 * Bookmark entity types
 */
export type BookmarkEntityType = "session" | "workflow" | "agent_run" | "task";

/**
 * Bookmark entity (polymorphic)
 */
export interface Bookmark {
  id: string;
  projectId: string;
  entityType: BookmarkEntityType;
  entityId: string;
  displayName: string | null;
  notes: string | null;
  pinned: boolean;
  createdAt: string;
}

/**
 * Bookmark database row (snake_case)
 */
export interface BookmarkRow {
  id: string;
  project_id: string;
  entity_type: BookmarkEntityType;
  entity_id: string;
  display_name: string | null;
  notes: string | null;
  pinned: number;
  created_at: string;
}

/**
 * Tag entity
 */
export interface Tag {
  id: string;
  name: string;
  color: string;
  description: string | null;
  createdAt: string;
}

/**
 * Tag database row (snake_case)
 */
export interface TagRow {
  id: string;
  name: string;
  color: string;
  description: string | null;
  created_at: string;
}

/**
 * Entity-tag mapping
 */
export interface EntityTag {
  tagId: string;
  projectId: string;
  entityType: string;
  entityId: string;
  createdAt: string;
}

/**
 * Entity-tag mapping database row (snake_case)
 */
export interface EntityTagRow {
  tag_id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
}

/**
 * Annotation types
 */
export type AnnotationType = "note" | "warning" | "error" | "success";

/**
 * Annotation entity
 */
export interface Annotation {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  title: string | null;
  content: string | null;
  annotationType: AnnotationType;
  createdAt: string;
  updatedAt: string;
}

/**
 * Annotation database row (snake_case)
 */
export interface AnnotationRow {
  id: string;
  project_id: string;
  entity_type: string;
  entity_id: string;
  title: string | null;
  content: string | null;
  annotation_type: AnnotationType;
  created_at: string;
  updated_at: string;
}

/**
 * User preference entity
 */
export interface Preference {
  key: string;
  value: string;
  updatedAt: string;
}

/**
 * User preference database row (snake_case)
 */
export interface PreferenceRow {
  key: string;
  value: string;
  updated_at: string;
}

/**
 * Saved view types
 */
export type ViewType = "sessions" | "workflows" | "agents" | "tasks";

/**
 * Saved view layout types
 */
export type ViewLayout = "table" | "grid" | "timeline";

/**
 * Saved view entity
 */
export interface SavedView {
  id: string;
  name: string;
  description: string | null;
  viewType: ViewType;
  projectIds: string[] | null;
  filters: Record<string, unknown>;
  sortConfig: Record<string, unknown> | null;
  columns: string[] | null;
  layout: ViewLayout;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Saved view database row (snake_case)
 */
export interface SavedViewRow {
  id: string;
  name: string;
  description: string | null;
  view_type: ViewType;
  project_ids: string | null;
  filters: string;
  sort_config: string | null;
  columns: string | null;
  layout: ViewLayout;
  is_default: number;
  created_at: string;
  updated_at: string;
}

/**
 * Metrics cache entity
 */
export interface MetricsCache {
  projectId: string;
  metricType: string;
  data: Record<string, unknown>;
  cachedAt: string;
  expiresAt: string;
}

/**
 * Metrics cache database row (snake_case)
 */
export interface MetricsCacheRow {
  project_id: string;
  metric_type: string;
  data: string;
  cached_at: string;
  expires_at: string;
}

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
  isActive?: boolean;
  isFavorite?: boolean;
  sortOrder?: number;
}

/**
 * Project group creation input
 */
export interface CreateProjectGroupInput {
  name: string;
  description?: string;
  color?: string;
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
  projectId: string;
  entityType: string;
  entityId: string;
  title?: string;
  content?: string;
  annotationType?: AnnotationType;
}

/**
 * Saved view creation input
 */
export interface CreateSavedViewInput {
  name: string;
  description?: string;
  viewType: ViewType;
  projectIds?: string[];
  filters?: Record<string, unknown>;
  sortConfig?: Record<string, unknown>;
  columns?: string[];
  layout?: ViewLayout;
  isDefault?: boolean;
}

// ============================================================================
// Query/Filter Types
// ============================================================================

/**
 * Project query filters
 */
export interface ProjectFilters {
  isActive?: boolean;
  isFavorite?: boolean;
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

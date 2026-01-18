/**
 * API Client Functions
 * Used with TanStack Query
 */

import type { ApiResponse } from "./types";
import type {
  DashboardStats,
  WorkflowSummary,
  SessionWithStats,
} from "./queries";
import type { Project, Session, Workflow, WorkflowStep, AgentRun } from "./types";

const BASE_URL = "";

async function fetchApi<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  const result: ApiResponse<T> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "API request failed");
  }

  return result.data;
}

async function postApi<T, B>(endpoint: string, body: B): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result: ApiResponse<T> = await response.json();

  if (!result.success || !result.data) {
    throw new Error(result.error?.message || "API request failed");
  }

  return result.data;
}

// ============================================================================
// Stats
// ============================================================================

export async function fetchStats(projectId?: string): Promise<DashboardStats> {
  const query = projectId ? `?projectId=${projectId}` : "";
  return fetchApi<DashboardStats>(`/api/stats${query}`);
}

// ============================================================================
// Projects
// ============================================================================

export async function fetchProjects(): Promise<Project[]> {
  return fetchApi<Project[]>("/api/projects");
}

export async function fetchProject(id: string): Promise<Project> {
  return fetchApi<Project>(`/api/projects/${id}`);
}

// ============================================================================
// Sessions
// ============================================================================

export async function fetchSessions(projectId?: string): Promise<SessionWithStats[]> {
  const query = projectId ? `?projectId=${projectId}` : "";
  return fetchApi<SessionWithStats[]>(`/api/sessions${query}`);
}

export interface SessionWithWorkflows extends Session {
  workflows: Workflow[];
}

export interface SessionDetailData {
  session: Session & { projectName: string; projectColor: string };
  workflows: Workflow[];
}

export async function fetchSession(id: string): Promise<SessionDetailData> {
  return fetchApi<SessionDetailData>(`/api/sessions/${id}`);
}

// ============================================================================
// Workflows
// ============================================================================

export async function fetchWorkflows(limit = 50, projectId?: string): Promise<WorkflowSummary[]> {
  const params = new URLSearchParams({ limit: limit.toString() });
  if (projectId) params.set("projectId", projectId);
  return fetchApi<WorkflowSummary[]>(`/api/workflows?${params.toString()}`);
}

export interface WorkflowWithDetails extends Workflow {
  steps: WorkflowStep[];
  agentRuns: AgentRun[];
}

export async function fetchWorkflow(id: string): Promise<WorkflowWithDetails> {
  return fetchApi<WorkflowWithDetails>(`/api/workflows/${id}`);
}

// ============================================================================
// Query Keys
// ============================================================================

export const queryKeys = {
  stats: (projectId?: string) => ["stats", { projectId }] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  sessions: (projectId?: string) => ["sessions", { projectId }] as const,
  session: (id: string) => ["sessions", id] as const,
  workflows: (limit?: number, projectId?: string) => ["workflows", { limit, projectId }] as const,
  workflow: (id: string) => ["workflows", id] as const,
};

/**
 * Public API surface for @obora/database.
 *
 * Note: test-only helpers are exported from ./testing.js and intentionally excluded here.
 */

export { OboraDatabase } from "./duckdb-client.js";

export type { Project, WorkflowRun, StepExecution, Metric } from "./duckdb-client.js";

export {
  insertProject,
  getProject,
  getProjectByPath,
  listProjects,
  updateProject,
  deleteProject,
  insertWorkflowRun,
  getWorkflowRun,
  listWorkflowRuns,
  updateWorkflowRunStatus,
  deleteWorkflowRun,
  insertStepExecution,
  getStepExecution,
  listStepExecutions,
  updateStepExecutionStatus,
  incrementStepRetry,
  deleteStepExecutions,
  insertMetric,
  getMetricsForRun,
  getMetricsForStep,
  aggregateMetric,
  deleteMetrics,
} from "./duckdb-client.js";

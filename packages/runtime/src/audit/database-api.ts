/**
 * @deprecated DuckDB database API has been removed.
 *
 * For testing, use InMemoryAuditStore from './InMemoryAuditStore.js'.
 * For production, use SQLiteStorageAdapter from '../storage/sqlite-adapter.js'.
 */

// Re-export types only (for backwards compatibility)
export type {
  Project,
  WorkflowRun,
  StepExecution,
  Metric,
} from "../_legacy/database/src/duckdb-client.js";

// Deprecated stubs
export const OboraDatabase = class {
  constructor() {
    throw new Error(
      "DuckDB support has been removed. " +
        "Use InMemoryAuditStore for testing or SQLiteStorageAdapter for production."
    );
  }
};

// Export stub functions that throw
const createDeprecatedFunction = (name: string) => () => {
  throw new Error(`DuckDB function '${name}' has been removed. Use InMemoryAuditStore or SQLiteStorageAdapter.`);
};

export const insertProject = createDeprecatedFunction("insertProject");
export const getProject = createDeprecatedFunction("getProject");
export const getProjectByPath = createDeprecatedFunction("getProjectByPath");
export const listProjects = createDeprecatedFunction("listProjects");
export const updateProject = createDeprecatedFunction("updateProject");
export const deleteProject = createDeprecatedFunction("deleteProject");
export const insertWorkflowRun = createDeprecatedFunction("insertWorkflowRun");
export const getWorkflowRun = createDeprecatedFunction("getWorkflowRun");
export const listWorkflowRuns = createDeprecatedFunction("listWorkflowRuns");
export const updateWorkflowRunStatus = createDeprecatedFunction("updateWorkflowRunStatus");
export const deleteWorkflowRun = createDeprecatedFunction("deleteWorkflowRun");
export const insertStepExecution = createDeprecatedFunction("insertStepExecution");
export const getStepExecution = createDeprecatedFunction("getStepExecution");
export const listStepExecutions = createDeprecatedFunction("listStepExecutions");
export const updateStepExecutionStatus = createDeprecatedFunction("updateStepExecutionStatus");
export const incrementStepRetry = createDeprecatedFunction("incrementStepRetry");
export const deleteStepExecutions = createDeprecatedFunction("deleteStepExecutions");
export const insertMetric = createDeprecatedFunction("insertMetric");
export const getMetricsForRun = createDeprecatedFunction("getMetricsForRun");
export const getMetricsForStep = createDeprecatedFunction("getMetricsForStep");
export const aggregateMetric = createDeprecatedFunction("aggregateMetric");
export const deleteMetrics = createDeprecatedFunction("deleteMetrics");

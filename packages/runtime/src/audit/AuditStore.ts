/**
 * @deprecated DuckDB-based AuditStore has been removed.
 *
 * For testing, use InMemoryAuditStore from './InMemoryAuditStore.js'.
 * For production, use SQLiteStorageAdapter from '../storage/sqlite-adapter.js'.
 *
 * @throws Always throws an error when instantiated.
 */

// Re-export types for backwards compatibility
export type {
  Project,
  WorkflowRun,
  StepExecution,
  Metric,
} from "../_legacy/database/src/duckdb-client.js";

// Stub class that throws on construction
class DeprecatedAuditStore {
  constructor() {
    throw new Error(
      "DuckDB-based AuditStore has been removed. " +
        "Use InMemoryAuditStore for testing or SQLiteStorageAdapter for production."
    );
  }
}

export { DeprecatedAuditStore as AuditStore };

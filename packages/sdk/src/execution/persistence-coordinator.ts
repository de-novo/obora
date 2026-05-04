import type { StorageAdapter, RunRecord } from "@obora/runtime";
import type { PersistenceManager } from "../persistence/persistence-manager.js";
import type { OboraConfig } from "../runtime-types.js";
import type { RuntimeExecution } from "../runtime-types.js";
import type { PersistedRepairLoopSummary } from "../runtime-types.js";

export interface PersistenceCoordinatorDeps {
  persistenceManager: PersistenceManager;
  logger?: { warn?: (message: string, ...args: unknown[]) => void };
}

/**
 * Coordinates persistence operations for workflow executions.
 *
 * @description
 * Encapsulates the logic for saving run records to persistent storage,
 * particularly on error paths where the execution has failed or been suspended.
 * Gracefully handles persistence failures by logging warnings instead of throwing.
 */
export class PersistenceCoordinator {
  constructor(private readonly deps: PersistenceCoordinatorDeps) {}

  async saveRunOnError(
    executionId: string,
    workflowName: string,
    execution: RuntimeExecution,
    variables: Record<string, unknown> | undefined,
    errorCode: string,
    persistenceEnabled: boolean,
    persistenceConfig: OboraConfig["persistence"] | undefined,
    repairLoopSummary: PersistedRepairLoopSummary | undefined
  ): Promise<void> {
    if (!persistenceEnabled) {
      return;
    }
    try {
      const adapter = await this.deps.persistenceManager.getStorageAdapter(
        persistenceEnabled,
        persistenceConfig
      );
      await adapter.saveRun({
        id: executionId,
        workflowName,
        status: execution.status as RunRecord["status"],
        input: { value: execution.input ?? null },
        startedAt: execution.startedAt.toISOString(),
        completedAt: execution.endedAt?.toISOString(),
        metadata: {
          variables,
          error: execution.error,
          errorCode,
          ...(repairLoopSummary ? { repairLoop: repairLoopSummary } : {}),
        },
      });
    } catch (err) {
      this.deps.logger?.warn?.("[persistence] Failed to save run on error:", err);
    }
  }
}

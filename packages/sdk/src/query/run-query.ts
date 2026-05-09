import { readFile } from "node:fs/promises";

import type { RunFilter } from "@obora/runtime";

import { OboraError } from "../runtime-types.js";
import type { PersistenceManager } from "../persistence/persistence-manager.js";

/**
 * RunQuery provides the spec-aligned query facade exposed as
 * `runtime.runs.*` and `runtime.step.*`.
 *
 * All methods delegate to the StorageAdapter via PersistenceManager.
 */
export class RunQuery {
  constructor(private readonly persistence: PersistenceManager) {}

  // ── run artifact helpers ─────────────────────────────────────────────────

  async getRunArtifacts(runId: string, stepName?: string) {
    const adapter = await this.persistence.getStorageAdapter();
    const records = await adapter.getArtifacts(runId, stepName);
    return records.map((record) => ({
      ...record,
      download: async () => {
        const store = await this.persistence.getArtifactStore();
        if (store) {
          try {
            return await store.get(record.id);
          } catch {
            // fallback to storageRef when store backend differs
          }
        }

        if (!record.storageRef) {
          throw new OboraError(
            "Artifact backend unavailable and no storageRef found",
            "SDK_ARTIFACT_BACKEND_UNAVAILABLE",
          );
        }

        const data = await readFile(record.storageRef).catch((err: unknown) => {
          throw new OboraError(
            `Artifact read failed: ${err instanceof Error ? err.message : String(err)}`,
            "SDK_ARTIFACT_READ_ERROR",
          );
        });

        return {
          record: {
            id: record.id,
            runId: record.runId,
            stepName: record.stepName,
            name: record.name,
            mime: record.mimeType,
            size: record.sizeBytes,
            path: record.storageRef,
            createdAt: record.createdAt,
          },
          data,
        };
      },
    }));
  }

  async getArtifact(runId: string, stepName: string, name: string) {
    const artifacts = await this.getRunArtifacts(runId, stepName);
    const matched = artifacts.filter((a) => a.name === name);
    const target = matched.length > 0 ? matched[matched.length - 1] : undefined;
    if (!target) {
      throw new OboraError(
        `Artifact not found: ${runId}/${stepName}/${name}`,
        "SDK_ARTIFACT_NOT_FOUND",
      );
    }
    return target;
  }

  async deleteArtifact(runId: string, stepName: string, name: string): Promise<void> {
    const adapter = await this.persistence.getStorageAdapter();
    const store = await this.persistence.getArtifactStore();
    const artifacts = await adapter.getArtifacts(runId, stepName);
    const matched = artifacts.filter((a) => a.name === name);
    const target = matched.length > 0 ? matched[matched.length - 1] : undefined;
    if (!target) {
      throw new OboraError(
        `Artifact not found: ${runId}/${stepName}/${name}`,
        "SDK_ARTIFACT_NOT_FOUND",
      );
    }

    if (store) {
      await store.delete(target.id);
    }
    await adapter.deleteArtifact(target.id);
  }

  // ── runs namespace ───────────────────────────────────────────────────────

  readonly runs = {
    get: async (runId: string) => {
      const adapter = await this.persistence.getStorageAdapter();
      return adapter.getRun(runId);
    },

    list: async (filter: RunFilter = {}) => {
      const adapter = await this.persistence.getStorageAdapter();
      return adapter.listRuns(filter);
    },

    steps: async (runId: string) => {
      const adapter = await this.persistence.getStorageAdapter();
      return adapter.getSteps(runId);
    },

    artifacts: async (runId: string, stepName?: string) =>
      this.getRunArtifacts(runId, stepName),

    cost: async (runId: string) => {
      const adapter = await this.persistence.getStorageAdapter();
      return adapter.getRunCostSummary(runId);
    },

    auditReplay: async (runId: string, stepName?: string) => {
      const adapter = await this.persistence.getStorageAdapter();
      return adapter.getAuditTimeline(runId, stepName);
    },
  };

  // ── step namespace ───────────────────────────────────────────────────────

  readonly step = {
    cost: async (runId: string, stepName: string) => {
      const adapter = await this.persistence.getStorageAdapter();
      const records = await adapter.getCosts(runId, stepName);
      const tokens = records.reduce((sum, r) => sum + r.totalTokens, 0);
      const costUsd = records.reduce((sum, r) => sum + r.costUsd, 0);
      return { stepName, tokens, costUsd, records };
    },

    artifacts: async (runId: string, stepName: string) =>
      this.getRunArtifacts(runId, stepName),

    artifact: async (runId: string, stepName: string, name: string) =>
      this.getArtifact(runId, stepName, name),
  };

  // ── rich run handle ──────────────────────────────────────────────────────

  async getRun(runId: string) {
    const adapter = await this.persistence.getStorageAdapter();
    const run = await adapter.getRun(runId);
    if (!run) return null;

    return {
      ...run,
      steps: async () => adapter.getSteps(runId),
      artifacts: async (stepName?: string) => this.getRunArtifacts(runId, stepName),
      cost: async () => adapter.getRunCostSummary(runId),
      auditReplay: async (stepName?: string) => adapter.getAuditTimeline(runId, stepName),
      artifact: async (stepName: string, name: string) =>
        this.getArtifact(runId, stepName, name),
    };
  }
}

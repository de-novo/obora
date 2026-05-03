import { createHash } from "node:crypto";
import { basename, join } from "node:path";
import type { WorkflowDef } from "../workflow.js";
import type { OboraRuntimeConfig, TKGPromotionTrigger, RuntimeExecution } from "../runtime-types.js";
import type { OboraConfig } from "../config-loader.js";
import { loadConfig } from "../config-loader.js";
import {
  sortMemoryScopesByPriority,
  type MemoryScope,
  type SharedMemoryStore,
} from "../shared-memory/store.js";
import {
  FileStagingTKGStore,
  type StagingTKGStore,
} from "../tkg/store.js";
import {
  FileTKGRollbackStore,
  restoreTKGRollbackFromStore,
  summarizeTKGRollbackEntries,
  type TKGRollbackStore,
  type TKGRollbackRestoreSummary,
  type TKGRollbackEntry,
} from "../tkg/rollback.js";
import {
  FileTKGReviewQueueStore,
  listOpenTKGReviewQueueItemsFromStore,
  resolveTKGReviewQueueItemInStore,
  type TKGReviewQueueStore,
  type TKGReviewQueueItem,
  type TKGReviewQueueResolutionSummary,
} from "../tkg/review-queue.js";
import {
  reapplyApprovedTKGReviewQueueItems,
  type TKGApprovedReviewQueueApplySummary,
} from "../tkg/apply.js";
import type { EventBus } from "../events/event-bus.js";

export interface TKGServiceDeps {
  config: OboraRuntimeConfig;
  eventBus: EventBus;
}

export class TKGService {
  constructor(private readonly deps: TKGServiceDeps) {}

  // ── Public TKG API methods (moved from WorkflowRunner) ────────────────────

  async listOpenTKGReviewQueueItems(workflow: WorkflowDef): Promise<TKGReviewQueueItem[]> {
    const { config } = this.deps;
    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);
    const queueScope = tkgProjectionScopes.at(-1);

    if (!tkgReviewQueueStore || !queueScope) {
      return [];
    }

    return listOpenTKGReviewQueueItemsFromStore(tkgReviewQueueStore, queueScope);
  }

  async resolveTKGReviewQueueItem(
    workflow: WorkflowDef,
    itemId: string,
    resolution: { status: "approved" | "rejected"; actor?: string; note?: string }
  ): Promise<TKGReviewQueueResolutionSummary> {
    const { config } = this.deps;
    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);
    const queueScope = tkgProjectionScopes.at(-1);

    if (!tkgReviewQueueStore || !queueScope) {
      return {
        resolved: false,
        scope: queueScope ? `${queueScope.level}:${queueScope.key}` : "unresolved",
        itemId,
      };
    }

    return resolveTKGReviewQueueItemInStore(tkgReviewQueueStore, queueScope, itemId, {
      status: resolution.status,
      resolvedAt: new Date().toISOString(),
      actor: resolution.actor,
      note: resolution.note,
    });
  }

  async restoreLatestTKGRollback(
    workflow: WorkflowDef,
    options: { rollbackId?: string } = {}
  ): Promise<TKGRollbackRestoreSummary> {
    const { config } = this.deps;
    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const sharedMemoryStore = await this.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.resolveTKGPromotionApplyScopes(
      workflow,
      config,
      loadedConfig
    );
    const tkgRollbackStore = this.resolveTKGRollbackStore(workflow, config, loadedConfig);

    const targetScope = (
      tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes
    ).at(-1);
    if (!sharedMemoryStore || !tkgRollbackStore || !targetScope) {
      return {
        restored: false,
        scope: targetScope ? `${targetScope.level}:${targetScope.key}` : "unresolved",
        restoredFactCount: 0,
      };
    }

    return restoreTKGRollbackFromStore(
      tkgRollbackStore,
      sharedMemoryStore,
      targetScope,
      options.rollbackId
    );
  }

  async reapplyApprovedTKGReviewQueueItems(
    workflow: WorkflowDef,
    options: { sourceExecutionId?: string } = {}
  ): Promise<TKGApprovedReviewQueueApplySummary> {
    const { config } = this.deps;
    const loadedConfig =
      config.config !== undefined ? config.config : await loadConfig(config.configPath);
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(workflow, config, loadedConfig);
    const sharedMemoryStore = await this.resolveSharedMemoryStore(workflow, config, loadedConfig);
    const sharedMemoryScopes = this.resolveSharedMemoryScopes(workflow, config, loadedConfig);
    const stagingTKGStore = this.resolveStagingTKGStore(workflow, config, loadedConfig);
    const tkgProjectionScopes = this.resolveTKGProjectionScopes(workflow, config, loadedConfig);
    const tkgPromotionApplyScopes = this.resolveTKGPromotionApplyScopes(
      workflow,
      config,
      loadedConfig
    );
    const tkgReviewQueueStore = this.resolveTKGReviewQueueStore(workflow, config, loadedConfig);

    const applyScopes =
      tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes;
    const queueScope = tkgProjectionScopes.at(-1);

    if (
      !sharedMemoryStore ||
      !stagingTKGStore ||
      !tkgReviewQueueStore ||
      !queueScope ||
      applyScopes.length === 0
    ) {
      return {
        appliedFactCount: 0,
        appliedNodeIds: [],
        approvedItemCount: 0,
        approvedItemIds: [],
        appliedDecisionCount: 0,
        scopes: applyScopes.map((scope) => `${scope.level}:${scope.key}`),
      };
    }

    return reapplyApprovedTKGReviewQueueItems({
      sharedMemoryStore,
      stagingStore: stagingTKGStore,
      reviewQueueStore: tkgReviewQueueStore,
      queueScope,
      applyScopes,
      sourceExecutionId: options.sourceExecutionId,
      allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes,
    });
  }

  async rollbackTKGOnExecutionFailure(
    executionId: string,
    workflow: WorkflowDef
  ): Promise<TKGRollbackRestoreSummary> {
    const { config } = this.deps;

    try {
      const result = await this.restoreLatestTKGRollback(workflow);

      if (result.restored && config.verbose) {
        console.log(
          `[TKG] Auto-rollback completed for execution ${executionId}: ${result.restoredFactCount} facts restored`
        );
      }

      return result;
    } catch (err) {
      if (config.verbose) {
        console.warn(`[TKG] Auto-rollback failed for execution ${executionId}:`, err);
      }
      throw err;
    }
  }

  // ── Resolution helpers (moved from WorkflowRunner) ───────────────────────

  resolveTKGProjectionConfig(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): NonNullable<OboraConfig["tkgProjection"]> | undefined {
    const baseConfig = loadedConfig?.tkgProjection;
    const runtimeTKGProjection = runtimeConfig.tkgProjection;

    const merged: NonNullable<OboraConfig["tkgProjection"]> = {
      ...(baseConfig ?? {}),
      ...(runtimeTKGProjection ?? {}),
      file: {
        ...(baseConfig?.file ?? {}),
        ...(runtimeTKGProjection?.file ?? {}),
      },
      custom: runtimeTKGProjection?.custom ?? baseConfig?.custom,
      promotion: {
        ...(baseConfig?.promotion ?? {}),
        ...(runtimeTKGProjection?.promotion ?? {}),
      },
      rollback: {
        ...(baseConfig?.rollback ?? {}),
        ...(runtimeTKGProjection?.rollback ?? {}),
        file: {
          ...(baseConfig?.rollback?.file ?? {}),
          ...(runtimeTKGProjection?.rollback?.file ?? {}),
        },
        custom: runtimeTKGProjection?.rollback?.custom ?? baseConfig?.rollback?.custom,
      },
      reviewQueue: {
        ...(baseConfig?.reviewQueue ?? {}),
        ...(runtimeTKGProjection?.reviewQueue ?? {}),
        file: {
          ...(baseConfig?.reviewQueue?.file ?? {}),
          ...(runtimeTKGProjection?.reviewQueue?.file ?? {}),
        },
        custom: runtimeTKGProjection?.reviewQueue?.custom ?? baseConfig?.reviewQueue?.custom,
      },
    };

    if (workflow.tkgProjection) {
      merged.enabled = workflow.tkgProjection.enabled ?? merged.enabled;
      merged.file = {
        ...(merged.file ?? {}),
        ...(workflow.tkgProjection.projectKey !== undefined
          ? { projectKey: workflow.tkgProjection.projectKey }
          : {}),
        ...(workflow.tkgProjection.scopes !== undefined
          ? { scopes: workflow.tkgProjection.scopes }
          : {}),
      };
      merged.promotion = {
        ...(merged.promotion ?? {}),
        ...(workflow.tkgProjection.promotion ?? {}),
      };
      merged.rollback = {
        ...(merged.rollback ?? {}),
        ...(workflow.tkgProjection.rollback?.enabled !== undefined
          ? { enabled: workflow.tkgProjection.rollback.enabled }
          : {}),
      };
      merged.reviewQueue = {
        ...(merged.reviewQueue ?? {}),
        ...(workflow.tkgProjection.reviewQueue?.enabled !== undefined
          ? { enabled: workflow.tkgProjection.reviewQueue.enabled }
          : {}),
      };
    }

    return merged;
  }

  resolveStagingTKGStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): StagingTKGStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled) return undefined;

    if (tkgProjectionConfig.adapter === "custom") {
      return tkgProjectionConfig.custom?.instance;
    }

    const basePath =
      tkgProjectionConfig.file?.basePath ?? join(process.cwd(), ".obora", "tkg-staging");
    return new FileStagingTKGStore(basePath);
  }

  resolveTKGProjectionScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): MemoryScope[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled) {
      return [];
    }

    const scopeLevels =
      tkgProjectionConfig.file?.scopes ?? (["workflow", "project"] as MemoryScope["level"][]);
    const projectKey = tkgProjectionConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      }))
    );
  }

  resolveTKGPromotionApplyScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): MemoryScope[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled || tkgProjectionConfig.promotion?.enabled === false) {
      return [];
    }

    const scopeLevels = tkgProjectionConfig.promotion?.applyScopes;
    if (!scopeLevels || scopeLevels.length === 0) {
      return [];
    }

    const projectKey = tkgProjectionConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      }))
    );
  }

  resolveTKGPromotionTriggers(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): TKGPromotionTrigger[] {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled || tkgProjectionConfig.promotion?.enabled === false) {
      return [];
    }

    const configuredTriggers = tkgProjectionConfig.promotion?.triggers;
    if (!configuredTriggers || configuredTriggers.length === 0) {
      return ["execution_end"];
    }

    return [...new Set(configuredTriggers)];
  }

  resolveTKGRollbackStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): TKGRollbackStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled || !tkgProjectionConfig.rollback?.enabled) {
      return undefined;
    }

    if (tkgProjectionConfig.rollback?.adapter === "custom") {
      return tkgProjectionConfig.rollback?.custom?.instance;
    }

    const basePath =
      tkgProjectionConfig.rollback?.file?.basePath ??
      join(process.cwd(), ".obora", "tkg-rollback");
    return new FileTKGRollbackStore(basePath);
  }

  resolveTKGReviewQueueStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): TKGReviewQueueStore | undefined {
    const tkgProjectionConfig = this.resolveTKGProjectionConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!tkgProjectionConfig?.enabled || !tkgProjectionConfig.reviewQueue?.enabled) {
      return undefined;
    }

    if (tkgProjectionConfig.reviewQueue?.adapter === "custom") {
      return tkgProjectionConfig.reviewQueue?.custom?.instance;
    }

    const basePath =
      tkgProjectionConfig.reviewQueue?.file?.basePath ??
      join(process.cwd(), ".obora", "tkg-review-queue");
    return new FileTKGReviewQueueStore(basePath);
  }

  private resolveSharedMemoryConfig(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): NonNullable<OboraConfig["sharedMemory"]> | undefined {
    const baseConfig = loadedConfig?.sharedMemory;
    const runtimeSharedMemory = runtimeConfig.sharedMemory;

    const merged: NonNullable<OboraConfig["sharedMemory"]> = {
      ...(baseConfig ?? {}),
      ...(runtimeSharedMemory ?? {}),
      file: {
        ...(baseConfig?.file ?? {}),
        ...(runtimeSharedMemory?.file ?? {}),
      },
      custom: runtimeSharedMemory?.custom ?? baseConfig?.custom,
    };

    if (workflow.sharedMemory) {
      merged.enabled = workflow.sharedMemory.enabled ?? merged.enabled;
      merged.file = {
        ...(merged.file ?? {}),
        ...(workflow.sharedMemory.projectKey !== undefined
          ? { projectKey: workflow.sharedMemory.projectKey }
          : {}),
        ...(workflow.sharedMemory.scopes !== undefined
          ? { scopes: workflow.sharedMemory.scopes }
          : {}),
      };
    }

    return merged;
  }

  async resolveSharedMemoryStore(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): Promise<SharedMemoryStore | undefined> {
    const sharedMemoryConfig = this.resolveSharedMemoryConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!sharedMemoryConfig?.enabled) return undefined;

    if (sharedMemoryConfig.adapter === "custom") {
      return sharedMemoryConfig.custom?.instance;
    }

    const basePath =
      sharedMemoryConfig.file?.basePath ?? join(process.cwd(), ".obora", "shared-memory");
    return new (await import("../shared-memory/store.js")).FileSharedMemoryStore(basePath);
  }

  resolveSharedMemoryScopes(
    workflow: WorkflowDef,
    runtimeConfig: OboraRuntimeConfig,
    loadedConfig: OboraConfig | undefined
  ): MemoryScope[] {
    const sharedMemoryConfig = this.resolveSharedMemoryConfig(
      workflow,
      runtimeConfig,
      loadedConfig
    );
    if (!sharedMemoryConfig?.enabled) {
      return [];
    }

    const scopeLevels =
      sharedMemoryConfig.file?.scopes ?? (["workflow", "project"] as MemoryScope["level"][]);
    const projectKey = sharedMemoryConfig.file?.projectKey ?? basename(process.cwd());

    return sortMemoryScopesByPriority(
      scopeLevels.map((level) => ({
        level,
        key: level === "workflow" ? workflow.name : level === "global" ? "global" : projectKey,
      }))
    );
  }

  private buildDeterministicTKGId(parts: unknown[]): string {
    return createHash("sha1").update(JSON.stringify(parts)).digest("hex");
  }
}

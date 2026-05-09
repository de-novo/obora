import { createHash } from "node:crypto";
import type { EventBus } from "../events/event-bus.js";
import type { AuditEvent, RuntimeExecution, TKGPromotionTrigger } from "../runtime-types.js";
import type { OboraConfig } from "../runtime-types.js";
import type {
  MemoryScope,
  SharedMemoryFact,
  SharedMemorySnapshot,
  SharedMemoryStore,
} from "../shared-memory/store.js";
import type {
  StagingTKGStore,
  ProjectableTKGEventType,
} from "../tkg/store.js";
import type { TKGRollbackEntry, TKGRollbackStore } from "../tkg/rollback.js";
import type { TKGReviewQueueStore } from "../tkg/review-queue.js";
import { projectAuditEventToTemporalNode } from "../tkg/projector.js";
import {
  evaluateTKGPromotion,
  summarizeTKGPromotionEvaluation,
} from "../tkg/promotion.js";
import {
  buildSharedMemorySnapshotFromTKGPromotion,
  summarizeTKGPromotionApply,
} from "../tkg/apply.js";
import { summarizeTKGRollbackEntries } from "../tkg/rollback.js";
import { DEFAULTS } from "../defaults.js";

export interface TKGPromotionEngineDeps {
  eventBus: EventBus;
}

/**
 * Manages TKG (Temporal Knowledge Graph) promotion and checkpointing.
 *
 * @description
 * Handles the evaluation and application of TKG promotion candidates:
 * - Builds deterministic IDs for TKG entities
 * - Persists shared memory snapshots to configured stores
 * - Flushes promotion checkpoints on configured triggers
 * - Manages rollback entries before applying promotions
 * - Enqueues review queue items for conflicting candidates
 * - Emits debug events when DEBUG_ENV_VAR is set
 */
export class TKGPromotionEngine {
  constructor(private readonly deps: TKGPromotionEngineDeps) {}

  buildDeterministicTKGId(parts: unknown[]): string {
    return createHash("sha1").update(JSON.stringify(parts)).digest("hex");
  }

  async persistSharedMemory(
    store: SharedMemoryStore | undefined,
    scopes: MemoryScope[],
    snapshot: SharedMemorySnapshot,
    _executionId: string
  ): Promise<void> {
    if (!store || scopes.length === 0) return;
    await scopes.reduce<Promise<void>>(
      (previous, scope) => previous.then(async () => {
        if (typeof store.merge === "function") {
          await store.merge(scope, snapshot);
        } else {
          await store.save(scope, snapshot);
        }
      }),
      Promise.resolve()
    );
  }

  async flushTKGPromotionCheckpoint(params: {
    trigger: TKGPromotionTrigger;
    execution: RuntimeExecution;
    executionId: string;
    workflowName: string;
    tkgProjectionConfig: NonNullable<OboraConfig["tkgProjection"]> | undefined;
    sharedMemoryStore: SharedMemoryStore | undefined;
    sharedMemoryScopes: MemoryScope[];
    stagingTKGStore: StagingTKGStore | undefined;
    tkgProjectionScopes: MemoryScope[];
    tkgPromotionApplyScopes: MemoryScope[];
    tkgRollbackStore: TKGRollbackStore | undefined;
    tkgReviewQueueStore: TKGReviewQueueStore | undefined;
    pendingEvent?: AuditEvent & { type: ProjectableTKGEventType };
  }): Promise<void> {
    const {
      trigger,
      execution,
      executionId,
      workflowName,
      tkgProjectionConfig,
      sharedMemoryStore,
      sharedMemoryScopes,
      stagingTKGStore,
      tkgProjectionScopes,
      tkgPromotionApplyScopes,
      tkgRollbackStore,
      tkgReviewQueueStore,
      pendingEvent,
    } = params;

    if (!stagingTKGStore || tkgProjectionScopes.length === 0) {
      return;
    }

    const evaluationScope = tkgProjectionScopes.at(-1)!;
    const loadedStagingSnapshot = await stagingTKGStore.load(evaluationScope);
    const stagingSnapshot = pendingEvent
      ? (() => {
        const pendingNode = projectAuditEventToTemporalNode(pendingEvent, workflowName);
        return {
        nodes: [
          ...(loadedStagingSnapshot?.nodes ?? []).filter((node) => node.id !== pendingNode.id),
          pendingNode,
        ],
        };
      })()
      : loadedStagingSnapshot;

    if (!stagingSnapshot) {
      return;
    }

    const evaluationMode =
      tkgProjectionConfig?.promotion?.evaluationMode ??
      (trigger === "execution_end" ? "full_history" : "latest_effective");

    const promotionEvaluation = evaluateTKGPromotion(stagingSnapshot, {
      minConfidence: tkgProjectionConfig?.promotion?.minConfidence,
      confidenceSpreadThreshold: tkgProjectionConfig?.promotion?.confidenceSpreadThreshold,
      confidenceConflictMode: tkgProjectionConfig?.promotion?.confidenceConflictMode,
      executionId,
      evaluationMode,
    });
    const promotionSummary = summarizeTKGPromotionEvaluation(promotionEvaluation);

    if (process.env[DEFAULTS.DEBUG_ENV_VAR] === "1") {
      await this.deps.eventBus.emit("tkg.checkpoint", executionId, {
        trigger,
        evaluationMode,
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        candidateCount: promotionSummary.candidateCount,
        promotableCount: promotionSummary.promotableCount,
        reviewQueueCount: promotionSummary.reviewQueueCount,
        candidateNodeIds: promotionEvaluation.candidates.map((candidate) => candidate.nodeId),
      });
    }

    execution.outputs.__tkg_promotion__ = {
      trigger,
      scope: `${evaluationScope.level}:${evaluationScope.key}`,
      minConfidence: tkgProjectionConfig?.promotion?.minConfidence ?? 0.8,
      allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes ?? [
        "workflow.validation_passed",
        "workflow.repair_completed",
      ],
      ...promotionSummary,
    };

    const promotionApplyScopes =
      tkgPromotionApplyScopes.length > 0 ? tkgPromotionApplyScopes : sharedMemoryScopes;
    if (
      sharedMemoryStore &&
      promotionApplyScopes.length > 0 &&
      tkgProjectionConfig?.promotion?.enabled !== false
    ) {
      const promotionSnapshot = buildSharedMemorySnapshotFromTKGPromotion(
        stagingSnapshot,
        promotionEvaluation,
        executionId,
        {
          allowedEventTypes: tkgProjectionConfig?.promotion?.allowedEventTypes,
        }
      );

      if (promotionSnapshot.knowledge.facts.length > 0) {
        const rollbackEntries = await promotionApplyScopes.reduce<Promise<TKGRollbackEntry[]>>(
          async (previous, scope) => {
            const entries = await previous;
            const existingSnapshot = tkgRollbackStore ? await sharedMemoryStore.load(scope) : undefined;
            const rollbackEntry: TKGRollbackEntry | undefined = existingSnapshot
              ? {
                id: this.buildDeterministicTKGId([
                  "rollback",
                  executionId,
                  scope.level,
                  scope.key,
                  promotionSnapshot.knowledge.facts.map((fact: SharedMemoryFact) => fact.id).sort(),
                ]),
                createdAt: new Date().toISOString(),
                executionId,
                workflowName,
                scope: `${scope.level}:${scope.key}`,
                reason: "pre-tkg-promotion-apply",
                snapshot: existingSnapshot,
              }
              : undefined;

            if (rollbackEntry && tkgRollbackStore) {
              if (typeof tkgRollbackStore.append === "function") {
                await tkgRollbackStore.append(scope, rollbackEntry);
              } else {
                const existing = await tkgRollbackStore.load(scope);
                await tkgRollbackStore.save(scope, {
                  entries: [...(existing?.entries ?? []), rollbackEntry],
                });
              }
            }

            if (typeof sharedMemoryStore.merge === "function") {
              await sharedMemoryStore.merge(scope, promotionSnapshot);
            } else {
              await sharedMemoryStore.save(scope, promotionSnapshot);
            }

            return rollbackEntry ? [...entries, rollbackEntry] : entries;
          },
          Promise.resolve([])
        );

        const applySummary = summarizeTKGPromotionApply(promotionSnapshot);
        execution.outputs.__tkg_promotion_apply__ = {
          trigger,
          scopes: promotionApplyScopes.map((scope) => `${scope.level}:${scope.key}`),
          ...applySummary,
        };

        if (process.env[DEFAULTS.DEBUG_ENV_VAR] === "1") {
          await this.deps.eventBus.emit("tkg.apply", executionId, {
            trigger,
            scopes: promotionApplyScopes.map((scope) => `${scope.level}:${scope.key}`),
            appliedFactCount: applySummary.appliedFactCount,
            appliedNodeIds: applySummary.appliedNodeIds,
          });
        }

        if (rollbackEntries.length > 0) {
          const rollbackSummary = summarizeTKGRollbackEntries(rollbackEntries);
          execution.outputs.__tkg_promotion_rollback__ = {
            trigger,
            ...rollbackSummary,
          };

          if (process.env[DEFAULTS.DEBUG_ENV_VAR] === "1") {
            await this.deps.eventBus.emit("tkg.rollback", executionId, {
              trigger,
              ...rollbackSummary,
            });
          }
        }
      }
    }

    if (tkgReviewQueueStore && promotionEvaluation.reviewQueue.length > 0) {
      const reviewItem = {
        id: this.buildDeterministicTKGId([
          "review-queue",
          executionId,
          evaluationScope.level,
          evaluationScope.key,
          promotionEvaluation.reviewQueue,
        ]),
        createdAt: new Date().toISOString(),
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        workflowName,
        status: "open" as const,
        candidateNodeIds: promotionEvaluation.candidates
          .filter((candidate) => candidate.requiresReview)
          .map((candidate) => candidate.nodeId),
        conflicts: promotionEvaluation.reviewQueue,
        summary: promotionSummary,
      };

      if (typeof tkgReviewQueueStore.enqueue === "function") {
        await tkgReviewQueueStore.enqueue(evaluationScope, reviewItem);
      } else {
        const existing = await tkgReviewQueueStore.load(evaluationScope);
        await tkgReviewQueueStore.save(evaluationScope, {
          items: [...(existing?.items ?? []), reviewItem],
        });
      }

      execution.outputs.__tkg_review_queue__ = {
        trigger,
        scope: `${evaluationScope.level}:${evaluationScope.key}`,
        queuedItems: promotionEvaluation.reviewQueue.length,
      };

      if (process.env[DEFAULTS.DEBUG_ENV_VAR] === "1") {
        await this.deps.eventBus.emit("tkg.review_queue", executionId, {
          trigger,
          scope: `${evaluationScope.level}:${evaluationScope.key}`,
          queuedItems: promotionEvaluation.reviewQueue.length,
        });
      }
    }
  }
}

import {
  mergeSharedMemorySnapshots,
  type MemoryScope,
  type SharedMemorySnapshot,
  type SharedMemoryStore,
} from "../shared-memory/store.js";
import type { TKGPromotionEvaluation } from "./promotion.js";
import type { TKGReviewQueueItem, TKGReviewQueueSnapshot, TKGReviewQueueStore } from "./review-queue.js";
import { estimateTemporalNodeConfidence } from "./promotion.js";
import type { ProjectableTKGEventType, StagingTKGSnapshot, StagingTKGStore } from "./store.js";

export interface TKGPromotionApplySummary {
  appliedFactCount: number;
  appliedNodeIds: string[];
}

export interface TKGApprovedReviewQueueApplySummary extends TKGPromotionApplySummary {
  approvedItemCount: number;
  approvedItemIds: string[];
  scopes?: string[];
}

export interface TKGPromotionApplyOptions {
  allowedEventTypes?: ProjectableTKGEventType[];
}

export interface ApprovedTKGReviewQueueReapplyRequest {
  sharedMemoryStore: SharedMemoryStore;
  stagingStore: StagingTKGStore;
  reviewQueueStore: TKGReviewQueueStore;
  queueScope: MemoryScope;
  applyScopes: MemoryScope[];
  sourceExecutionId?: string;
  allowedEventTypes?: ProjectableTKGEventType[];
}

export function buildSharedMemorySnapshotFromTKGPromotion(
  stagingSnapshot: StagingTKGSnapshot,
  evaluation: TKGPromotionEvaluation,
  sourceExecutionId?: string,
  options: TKGPromotionApplyOptions = {},
): SharedMemorySnapshot {
  const promotedNodeIds = new Set(
    evaluation.candidates.filter((candidate) => candidate.promote).map((candidate) => candidate.nodeId),
  );

  const allowedEventTypes = options.allowedEventTypes;

  const facts = stagingSnapshot.nodes
    .filter(
      (node) =>
        promotedNodeIds.has(node.id) &&
        (allowedEventTypes === undefined || allowedEventTypes.includes(node.eventType)),
    )
    .map((node) => {
      const candidate = evaluation.candidates.find((item) => item.nodeId === node.id)!;
      return {
        id: `tkg-promotion:${node.id}`,
        content: node.summary,
        category: "tkg-promotion",
        tags: [
          "tkg-promotion",
          node.workflowName,
          node.eventType,
          ...(node.stepName ? [node.stepName] : []),
        ],
        confidence: candidate.confidence,
        createdAt: node.timestamp,
        ...(sourceExecutionId ? { sourceExecutionId } : {}),
      };
    });

  return {
    knowledge: {
      facts,
    },
    decisions: {
      history: [],
    },
    context: {
      projectFacts: {
        promotedNodeIds: facts.map((fact) => fact.id),
      },
    },
  };
}

export function buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem(
  stagingSnapshot: StagingTKGSnapshot,
  reviewItem: TKGReviewQueueItem,
  sourceExecutionId?: string,
  options: TKGPromotionApplyOptions = {},
): SharedMemorySnapshot {
  if (reviewItem.status !== "approved") {
    throw new Error("Review queue item must be approved before apply.");
  }

  const allowedEventTypes = options.allowedEventTypes;
  const facts = stagingSnapshot.nodes
    .filter(
      (node) =>
        reviewItem.candidateNodeIds.includes(node.id) &&
        (allowedEventTypes === undefined || allowedEventTypes.includes(node.eventType)),
    )
    .map((node) => ({
      id: `tkg-promotion:${node.id}`,
      content: node.summary,
      category: "tkg-promotion",
      tags: [
        "tkg-promotion",
        "review-approved",
        reviewItem.workflowName,
        node.eventType,
        ...(node.stepName ? [node.stepName] : []),
      ],
      confidence: estimateTemporalNodeConfidence(node),
      createdAt: node.timestamp,
      ...(sourceExecutionId ? { sourceExecutionId } : {}),
    }));

  return {
    knowledge: { facts },
    decisions: { history: [] },
    context: {
      projectFacts: {
        promotedNodeIds: facts.map((fact) => fact.id),
        reviewQueueItemId: reviewItem.id,
      },
    },
  };
}

export function buildSharedMemorySnapshotFromApprovedTKGReviewQueueItems(
  stagingSnapshot: StagingTKGSnapshot,
  reviewQueueSnapshot: TKGReviewQueueSnapshot | null | undefined,
  sourceExecutionId?: string,
  options: TKGPromotionApplyOptions = {},
): SharedMemorySnapshot {
  let mergedSnapshot: SharedMemorySnapshot | null = null;

  for (const reviewItem of reviewQueueSnapshot?.items ?? []) {
    if (reviewItem.status !== "approved") continue;

    mergedSnapshot = mergeSharedMemorySnapshots(
      mergedSnapshot,
      buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem(
        stagingSnapshot,
        reviewItem,
        sourceExecutionId,
        options,
      ),
    );
  }

  return mergedSnapshot ?? {
    knowledge: { facts: [] },
    decisions: { history: [] },
    context: { projectFacts: {} },
  };
}

export async function applyApprovedTKGReviewQueueItemsToSharedMemory(
  store: SharedMemoryStore,
  scopes: MemoryScope[],
  stagingSnapshot: StagingTKGSnapshot,
  reviewQueueSnapshot: TKGReviewQueueSnapshot | null | undefined,
  sourceExecutionId?: string,
  options: TKGPromotionApplyOptions = {},
): Promise<TKGApprovedReviewQueueApplySummary> {
  const snapshot = buildSharedMemorySnapshotFromApprovedTKGReviewQueueItems(
    stagingSnapshot,
    reviewQueueSnapshot,
    sourceExecutionId,
    options,
  );

  if (snapshot.knowledge.facts.length > 0) {
    for (const scope of scopes) {
      if (typeof store.merge === "function") {
        await store.merge(scope, snapshot);
      } else {
        await store.save(scope, snapshot);
      }
    }
  }

  const approvedItems = (reviewQueueSnapshot?.items ?? []).filter((item) => item.status === "approved");

  return {
    ...summarizeTKGPromotionApply(snapshot),
    approvedItemCount: approvedItems.length,
    approvedItemIds: approvedItems.map((item) => item.id),
    scopes: scopes.map((scope) => `${scope.level}:${scope.key}`),
  };
}

export async function reapplyApprovedTKGReviewQueueItems(
  request: ApprovedTKGReviewQueueReapplyRequest,
): Promise<TKGApprovedReviewQueueApplySummary> {
  const stagingSnapshot = await request.stagingStore.load(request.queueScope);
  const reviewQueueSnapshot = await request.reviewQueueStore.load(request.queueScope);

  if (!stagingSnapshot) {
    return {
      appliedFactCount: 0,
      appliedNodeIds: [],
      approvedItemCount: 0,
      approvedItemIds: [],
      scopes: request.applyScopes.map((scope) => `${scope.level}:${scope.key}`),
    };
  }

  return applyApprovedTKGReviewQueueItemsToSharedMemory(
    request.sharedMemoryStore,
    request.applyScopes,
    stagingSnapshot,
    reviewQueueSnapshot,
    request.sourceExecutionId,
    {
      allowedEventTypes: request.allowedEventTypes,
    },
  );
}

export function summarizeTKGPromotionApply(
  snapshot: SharedMemorySnapshot,
): TKGPromotionApplySummary {
  return {
    appliedFactCount: snapshot.knowledge.facts.length,
    appliedNodeIds: snapshot.knowledge.facts.map((fact) => fact.id),
  };
}

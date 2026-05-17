import {
  mergeSharedMemorySnapshots,
  type MemoryScope,
  type SharedMemoryDecision,
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
  appliedDecisionCount: number;
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

function buildSharedMemoryDecisionFromApprovedTKGReviewQueueItem(
  reviewItem: TKGReviewQueueItem,
  sourceExecutionId?: string,
): SharedMemoryDecision | null {
  if (reviewItem.status !== "approved") {
    return null;
  }

  const resolution = reviewItem.resolution;
  if (!resolution) {
    return null;
  }

  const summaryParts = [
    `Approved TKG review queue item ${reviewItem.id}`,
    resolution.actor ? `by ${resolution.actor}` : undefined,
    resolution.note ? `— ${resolution.note}` : undefined,
  ].filter((part): part is string => Boolean(part));

  return {
    id: `tkg-review-resolution:${reviewItem.id}:${resolution.status}`,
    summary: summaryParts.join(" "),
    createdAt: resolution.resolvedAt,
    ...(sourceExecutionId ? { sourceExecutionId } : {}),
  };
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
  const resolutionDecision = buildSharedMemoryDecisionFromApprovedTKGReviewQueueItem(reviewItem, sourceExecutionId);

  return {
    knowledge: { facts },
    decisions: { history: resolutionDecision ? [resolutionDecision] : [] },
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
  const mergedSnapshot = (reviewQueueSnapshot?.items ?? [])
    .filter((reviewItem) => reviewItem.status === "approved")
    .reduce<SharedMemorySnapshot | null>(
      (snapshot, reviewItem) =>
        mergeSharedMemorySnapshots(
          snapshot,
          buildSharedMemorySnapshotFromApprovedTKGReviewQueueItem(
            stagingSnapshot,
            reviewItem,
            sourceExecutionId,
            options,
          ),
        ),
      null,
    );

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

  if (
    snapshot.knowledge.facts.length > 0
    || snapshot.decisions.history.length > 0
    || Object.keys(snapshot.context.projectFacts).length > 0
  ) {
    await scopes.reduce<Promise<void>>(
      (previous, scope) => previous.then(async () => {
        const existing = await store.load(scope);
        await store.save(scope, mergeSharedMemorySnapshots(existing, snapshot));
      }),
      Promise.resolve(),
    );
  }

  const approvedItems = (reviewQueueSnapshot?.items ?? []).filter((item) => item.status === "approved");

  return {
    ...summarizeTKGPromotionApply(snapshot),
    approvedItemCount: approvedItems.length,
    approvedItemIds: approvedItems.map((item) => item.id),
    appliedDecisionCount: snapshot.decisions.history.length,
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
      appliedDecisionCount: 0,
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

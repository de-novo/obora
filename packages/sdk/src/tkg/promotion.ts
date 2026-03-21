import type { StagingTKGSnapshot, TemporalNode } from "./store.js";

export type TKGConflictType = "contradiction" | "version" | "confidence";

export interface PromotionCandidate {
  nodeId: string;
  workflowName: string;
  stepName?: string;
  eventType: TemporalNode["eventType"];
  confidence: number;
  promote: boolean;
  requiresReview: boolean;
  rationale: string;
}

export interface TKGConflict {
  type: TKGConflictType;
  key: string;
  nodeIds: string[];
  severity: "low" | "medium" | "high";
  message: string;
}

export interface TKGPromotionEvaluation {
  candidates: PromotionCandidate[];
  conflicts: TKGConflict[];
  reviewQueue: TKGConflict[];
}

export interface TKGPromotionSummary {
  candidateCount: number;
  promotableCount: number;
  reviewCandidateCount: number;
  conflictCount: number;
  reviewQueueCount: number;
}

export interface TKGPromotionOptions {
  minConfidence?: number;
  confidenceSpreadThreshold?: number;
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function estimateTemporalNodeConfidence(node: TemporalNode): number {
  const explicitConfidence = node.attributes.confidence;
  if (typeof explicitConfidence === "number") {
    return clampConfidence(explicitConfidence);
  }

  switch (node.eventType) {
    case "workflow.validation_passed":
      return 0.95;
    case "workflow.repair_completed":
      return 0.8;
    case "workflow.repair_started":
      return 0.55;
    case "workflow.back_edge_triggered":
      return 0.45;
    case "workflow.validation_failed":
      return 0.35;
  }
}

function stepKey(node: TemporalNode): string {
  return `${node.workflowName}:${node.stepName ?? "__workflow__"}`;
}

export function detectTKGConflicts(
  snapshot: StagingTKGSnapshot,
  options: TKGPromotionOptions = {},
): TKGConflict[] {
  const conflicts: TKGConflict[] = [];
  const groups = new Map<string, TemporalNode[]>();
  const confidenceSpreadThreshold = options.confidenceSpreadThreshold ?? 0.35;

  for (const node of snapshot.nodes) {
    const key = stepKey(node);
    const bucket = groups.get(key) ?? [];
    bucket.push(node);
    groups.set(key, bucket);
  }

  for (const [key, nodes] of groups.entries()) {
    const validationFailed = nodes.filter((node) => node.eventType === "workflow.validation_failed");
    const validationPassed = nodes.filter((node) => node.eventType === "workflow.validation_passed");
    const repairCompleted = nodes.filter((node) => node.eventType === "workflow.repair_completed");

    if (validationFailed.length > 0 && validationPassed.length > 0) {
      conflicts.push({
        type: "contradiction",
        key,
        nodeIds: [...validationFailed, ...validationPassed].map((node) => node.id),
        severity: "high",
        message: "Both validation failure and validation success exist for the same step.",
      });
    }

    if (validationPassed.length > 1 || repairCompleted.length > 1) {
      conflicts.push({
        type: "version",
        key,
        nodeIds: [...validationPassed, ...repairCompleted].map((node) => node.id),
        severity: "medium",
        message: "Multiple promotable node versions exist for the same step.",
      });
    }

    const confidences = nodes.map(estimateTemporalNodeConfidence);
    if (confidences.length > 1) {
      const spread = Math.max(...confidences) - Math.min(...confidences);
      if (spread >= confidenceSpreadThreshold) {
        conflicts.push({
          type: "confidence",
          key,
          nodeIds: nodes.map((node) => node.id),
          severity: spread >= 0.5 ? "high" : "medium",
          message: `Confidence spread (${spread.toFixed(2)}) exceeds threshold.`,
        });
      }
    }
  }

  return conflicts;
}

export function evaluateTKGPromotion(
  snapshot: StagingTKGSnapshot,
  options: TKGPromotionOptions = {},
): TKGPromotionEvaluation {
  const minConfidence = options.minConfidence ?? 0.8;
  const conflicts = detectTKGConflicts(snapshot, options);
  const blockingNodeIds = new Set(
    conflicts
      .filter((conflict) => conflict.type === "contradiction" || conflict.type === "version")
      .flatMap((conflict) => conflict.nodeIds),
  );

  const candidates = snapshot.nodes
    .filter(
      (node) =>
        node.eventType === "workflow.validation_passed" ||
        node.eventType === "workflow.repair_completed",
    )
    .map((node) => {
      const confidence = estimateTemporalNodeConfidence(node);
      const requiresReview = blockingNodeIds.has(node.id);
      const promote = confidence >= minConfidence && !requiresReview;

      return {
        nodeId: node.id,
        workflowName: node.workflowName,
        ...(node.stepName ? { stepName: node.stepName } : {}),
        eventType: node.eventType,
        confidence,
        promote,
        requiresReview,
        rationale: promote
          ? "Confidence threshold met and no blocking conflicts detected."
          : requiresReview
            ? "Blocking contradiction/version conflict requires manual review."
            : "Confidence below promotion threshold.",
      } satisfies PromotionCandidate;
    });

  const reviewQueue = conflicts.filter((conflict) => conflict.severity === "high");

  return {
    candidates,
    conflicts,
    reviewQueue,
  };
}

export function summarizeTKGPromotionEvaluation(
  evaluation: TKGPromotionEvaluation,
): TKGPromotionSummary {
  return {
    candidateCount: evaluation.candidates.length,
    promotableCount: evaluation.candidates.filter((candidate) => candidate.promote).length,
    reviewCandidateCount: evaluation.candidates.filter((candidate) => candidate.requiresReview).length,
    conflictCount: evaluation.conflicts.length,
    reviewQueueCount: evaluation.reviewQueue.length,
  };
}

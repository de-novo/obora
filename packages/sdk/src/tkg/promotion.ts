import type {
  TKGConfidenceConflictMode,
  TKGPromotionEvaluationMode,
} from "./tkg-types.js";
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

function isAlwaysBlockingConflictType(type: TKGConflictType): boolean {
  return type === "contradiction" || type === "version";
}

function resolveConfidenceConflictMode(options: TKGPromotionOptions): TKGConfidenceConflictMode {
  return options.confidenceConflictMode ?? "signal_only";
}

function isBlockingConflict(
  conflict: TKGConflict,
  confidenceConflictMode: TKGConfidenceConflictMode,
): boolean {
  if (isAlwaysBlockingConflictType(conflict.type)) {
    return true;
  }

  return conflict.type === "confidence"
    && confidenceConflictMode === "blocking"
    && conflict.severity === "high";
}

function isReviewQueueConflict(
  conflict: TKGConflict,
  confidenceConflictMode: TKGConfidenceConflictMode,
): boolean {
  if (isAlwaysBlockingConflictType(conflict.type)) {
    return true;
  }

  return conflict.type === "confidence"
    && conflict.severity === "high"
    && confidenceConflictMode !== "signal_only";
}

export interface TKGPromotionOptions {
  minConfidence?: number;
  confidenceSpreadThreshold?: number;
  confidenceConflictMode?: TKGConfidenceConflictMode;
  executionId?: string;
  evaluationMode?: TKGPromotionEvaluationMode;
  latestEffectiveOnly?: boolean;
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

function normalizeTKGPromotionSnapshot(
  snapshot: StagingTKGSnapshot,
  options: TKGPromotionOptions = {},
): StagingTKGSnapshot {
  const evaluationMode = options.evaluationMode
    ?? (options.latestEffectiveOnly ? "latest_effective" : undefined)
    ?? (options.executionId ? "current_execution" : "full_history");

  const executionFilteredNodes = evaluationMode === "full_history"
    ? snapshot.nodes
    : options.executionId
      ? snapshot.nodes.filter((node) => node.executionId === options.executionId)
      : snapshot.nodes;

  if (evaluationMode !== "latest_effective") {
    return { nodes: executionFilteredNodes };
  }

  const groups = executionFilteredNodes.reduce((acc, node) => {
    const key = stepKey(node);
    const bucket = acc.get(key) ?? [];
    return new Map([...acc, [key, [...bucket, node]]]);
  }, new Map<string, TemporalNode[]>());

  const latestNode = (nodes: TemporalNode[], eventType: TemporalNode["eventType"]): TemporalNode | undefined =>
    nodes
      .filter((node) => node.eventType === eventType)
      .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
      .at(-1);

  const normalizedNodes = Array.from(groups.values()).flatMap((nodes) => {
    const latestValidationFailed = latestNode(nodes, "workflow.validation_failed");
    const latestValidationPassed = latestNode(nodes, "workflow.validation_passed");
    const latestRepairCompleted = latestNode(nodes, "workflow.repair_completed");
    const latestRepairStarted = latestNode(nodes, "workflow.repair_started");
    const latestBackEdge = latestNode(nodes, "workflow.back_edge_triggered");

    const validationNode =
      latestValidationPassed && latestValidationFailed
        ? latestValidationPassed.timestamp >= latestValidationFailed.timestamp
          ? latestValidationPassed
          : latestValidationFailed
        : latestValidationPassed ?? latestValidationFailed;

    return [
      ...(latestBackEdge ? [latestBackEdge] : []),
      ...(latestRepairStarted ? [latestRepairStarted] : []),
      ...(latestRepairCompleted ? [latestRepairCompleted] : []),
      ...(validationNode ? [validationNode] : []),
    ];
  });

  return {
    nodes: normalizedNodes,
  };
}

export function detectTKGConflicts(
  snapshot: StagingTKGSnapshot,
  options: TKGPromotionOptions = {},
): TKGConflict[] {
  const normalizedSnapshot = normalizeTKGPromotionSnapshot(snapshot, options);
  const conflicts: TKGConflict[] = [];
  const confidenceSpreadThreshold = options.confidenceSpreadThreshold ?? 0.35;

  const groups = normalizedSnapshot.nodes.reduce((acc, node) => {
    const key = stepKey(node);
    const bucket = acc.get(key) ?? [];
    return new Map([...acc, [key, [...bucket, node]]]);
  }, new Map<string, TemporalNode[]>());

  Array.from(groups.entries()).forEach(([key, nodes]) => {
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
  });

  return conflicts;
}

export function evaluateTKGPromotion(
  snapshot: StagingTKGSnapshot,
  options: TKGPromotionOptions = {},
): TKGPromotionEvaluation {
  const normalizedSnapshot = normalizeTKGPromotionSnapshot(snapshot, options);
  const minConfidence = options.minConfidence ?? 0.8;
  const confidenceConflictMode = resolveConfidenceConflictMode(options);
  const conflicts = detectTKGConflicts(normalizedSnapshot, options);
  const blockingNodeIds = new Set(
    conflicts
      .filter((conflict) => isBlockingConflict(conflict, confidenceConflictMode))
      .flatMap((conflict) => conflict.nodeIds),
  );

  const candidates = normalizedSnapshot.nodes
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
            ? "Promotion conflict policy requires manual review."
            : "Confidence below promotion threshold.",
      } satisfies PromotionCandidate;
    });

  const reviewQueue = conflicts.filter((conflict) => isReviewQueueConflict(conflict, confidenceConflictMode));

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

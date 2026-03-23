import { describe, expect, it } from "vitest";

import {
  detectTKGConflicts,
  estimateTemporalNodeConfidence,
  evaluateTKGPromotion,
  summarizeTKGPromotionEvaluation,
} from "../promotion.js";
import type { StagingTKGSnapshot } from "../store.js";

function makeSnapshot(): StagingTKGSnapshot {
  return {
    nodes: [
      {
        id: "n1",
        eventType: "workflow.validation_failed",
        executionId: "exec-1",
        workflowName: "demo",
        stepName: "validate",
        timestamp: new Date().toISOString(),
        summary: "TS failed",
        attributes: {},
        relations: [],
      },
      {
        id: "n2",
        eventType: "workflow.repair_completed",
        executionId: "exec-1",
        workflowName: "demo",
        stepName: "build",
        timestamp: new Date().toISOString(),
        summary: "Repair complete",
        attributes: {},
        relations: [],
      },
      {
        id: "n3",
        eventType: "workflow.validation_passed",
        executionId: "exec-1",
        workflowName: "demo",
        stepName: "validate",
        timestamp: new Date().toISOString(),
        summary: "All green",
        attributes: {},
        relations: [],
      },
    ],
  };
}

describe("TKG promotion evaluation", () => {
  it("estimates confidence by event type", () => {
    expect(estimateTemporalNodeConfidence(makeSnapshot().nodes[0]!)).toBe(0.35);
    expect(estimateTemporalNodeConfidence(makeSnapshot().nodes[1]!)).toBe(0.8);
    expect(estimateTemporalNodeConfidence(makeSnapshot().nodes[2]!)).toBe(0.95);
  });

  it("detects contradiction conflicts for the same step", () => {
    const conflicts = detectTKGConflicts(makeSnapshot());
    expect(conflicts.some((conflict) => conflict.type === "contradiction")).toBe(true);
  });

  it("builds promotion candidates and review queue summary", () => {
    const evaluation = evaluateTKGPromotion(makeSnapshot());
    const summary = summarizeTKGPromotionEvaluation(evaluation);

    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates.find((candidate) => candidate.nodeId === "n2")?.promote).toBe(true);
    expect(evaluation.candidates.find((candidate) => candidate.nodeId === "n3")?.requiresReview).toBe(true);
    expect(summary).toEqual({
      candidateCount: 2,
      promotableCount: 1,
      reviewCandidateCount: 1,
      conflictCount: 2,
      reviewQueueCount: 1,
    });
  });

  it("queues blocking version conflicts for manual review", () => {
    const evaluation = evaluateTKGPromotion({
      nodes: [
        {
          id: "n1",
          eventType: "workflow.validation_passed",
          executionId: "exec-1",
          workflowName: "demo",
          stepName: "validate",
          timestamp: new Date().toISOString(),
          summary: "Validation passed v1",
          attributes: {},
          relations: [],
        },
        {
          id: "n2",
          eventType: "workflow.validation_passed",
          executionId: "exec-1",
          workflowName: "demo",
          stepName: "validate",
          timestamp: new Date().toISOString(),
          summary: "Validation passed v2",
          attributes: {},
          relations: [],
        },
      ],
    });

    expect(evaluation.conflicts.some((conflict) => conflict.type === "version")).toBe(true);
    expect(evaluation.reviewQueue.some((conflict) => conflict.type === "version")).toBe(true);
    expect(evaluation.candidates.every((candidate) => candidate.requiresReview)).toBe(true);
  });

  it("keeps confidence conflicts as signal-only by default", () => {
    const evaluation = evaluateTKGPromotion({
      nodes: [
        {
          id: "n1",
          eventType: "workflow.validation_passed",
          executionId: "exec-1",
          workflowName: "demo",
          stepName: "review",
          timestamp: new Date().toISOString(),
          summary: "Validation passed",
          attributes: { confidence: 0.95 },
          relations: [],
        },
        {
          id: "n2",
          eventType: "workflow.repair_completed",
          executionId: "exec-1",
          workflowName: "demo",
          stepName: "review",
          timestamp: new Date().toISOString(),
          summary: "Repair completed",
          attributes: { confidence: 0.2 },
          relations: [],
        },
      ],
    });

    expect(evaluation.conflicts.some((conflict) => conflict.type === "confidence" && conflict.severity === "high")).toBe(true);
    expect(evaluation.reviewQueue).toHaveLength(0);
    expect(evaluation.candidates.every((candidate) => candidate.requiresReview === false)).toBe(true);
  });

  it("can route high confidence conflicts to review queue without blocking", () => {
    const evaluation = evaluateTKGPromotion(
      {
        nodes: [
          {
            id: "n1",
            eventType: "workflow.validation_passed",
            executionId: "exec-1",
            workflowName: "demo",
            stepName: "review",
            timestamp: new Date().toISOString(),
            summary: "Validation passed",
            attributes: { confidence: 0.95 },
            relations: [],
          },
          {
            id: "n2",
            eventType: "workflow.repair_completed",
            executionId: "exec-1",
            workflowName: "demo",
            stepName: "review",
            timestamp: new Date().toISOString(),
            summary: "Repair completed",
            attributes: { confidence: 0.2 },
            relations: [],
          },
        ],
      },
      { confidenceConflictMode: "review" },
    );

    expect(evaluation.reviewQueue).toEqual([
      expect.objectContaining({ type: "confidence", severity: "high" }),
    ]);
    expect(evaluation.candidates.every((candidate) => candidate.requiresReview === false)).toBe(true);
  });

  it("can escalate high confidence conflicts to blocking review", () => {
    const evaluation = evaluateTKGPromotion(
      {
        nodes: [
          {
            id: "n1",
            eventType: "workflow.validation_passed",
            executionId: "exec-1",
            workflowName: "demo",
            stepName: "review",
            timestamp: new Date().toISOString(),
            summary: "Validation passed",
            attributes: { confidence: 0.95 },
            relations: [],
          },
          {
            id: "n2",
            eventType: "workflow.repair_completed",
            executionId: "exec-1",
            workflowName: "demo",
            stepName: "review",
            timestamp: new Date().toISOString(),
            summary: "Repair completed",
            attributes: { confidence: 0.2 },
            relations: [],
          },
        ],
      },
      { confidenceConflictMode: "blocking" },
    );

    expect(evaluation.reviewQueue).toEqual([
      expect.objectContaining({ type: "confidence", severity: "high" }),
    ]);
    expect(evaluation.candidates.every((candidate) => candidate.requiresReview)).toBe(true);
    expect(evaluation.candidates.every((candidate) => candidate.promote === false)).toBe(true);
  });

  it("can evaluate only the current execution when requested", () => {
    const evaluation = evaluateTKGPromotion(
      {
        nodes: [
          ...makeSnapshot().nodes,
          {
            id: "n4",
            eventType: "workflow.validation_failed",
            executionId: "exec-2",
            workflowName: "demo",
            stepName: "validate",
            timestamp: new Date().toISOString(),
            summary: "Other execution failed",
            attributes: {},
            relations: [],
          },
        ],
      },
      {
        executionId: "exec-1",
        evaluationMode: "current_execution",
      },
    );

    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.conflicts.some((conflict) => conflict.nodeIds.includes("n4"))).toBe(false);
  });

  it("can evaluate only the latest effective state for a current execution", () => {
    const evaluation = evaluateTKGPromotion(makeSnapshot(), {
      executionId: "exec-1",
      evaluationMode: "latest_effective",
    });

    expect(evaluation.candidates).toHaveLength(2);
    expect(evaluation.candidates.every((candidate) => candidate.promote)).toBe(true);
    expect(evaluation.reviewQueue).toHaveLength(0);
    expect(summarizeTKGPromotionEvaluation(evaluation)).toEqual({
      candidateCount: 2,
      promotableCount: 2,
      reviewCandidateCount: 0,
      conflictCount: 0,
      reviewQueueCount: 0,
    });
  });
});

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
      reviewQueueCount: 2,
    });
  });
});

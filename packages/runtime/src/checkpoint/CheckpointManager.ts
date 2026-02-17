/**
 * M6-02: CheckpointManager — Creates and restores checkpoints for run resume.
 *
 * Responsibilities:
 * - Save checkpoint after each step completion
 * - Load latest checkpoint for a run
 * - Detect policy drift
 * - Determine step restoration policy
 */

import { randomUUID } from "node:crypto";

import type { StorageAdapter, CheckpointRecord, StepRecord, ResumeOptions } from "../storage/types.js";
import { computePolicyHash, type PolicyHashInput } from "./policy-hash.js";

export interface CheckpointStepPolicy {
  stepName: string;
  action: "restore" | "rerun" | "skip";
  output?: Record<string, unknown>;
}

export interface PolicyDriftResult {
  drifted: boolean;
  oldHash: string;
  newHash: string;
}

export class PolicyDriftError extends Error {
  constructor(
    public readonly oldHash: string,
    public readonly newHash: string,
  ) {
    super(`Policy drift detected: checkpoint hash ${oldHash} != current hash ${newHash}`);
    this.name = "PolicyDriftError";
  }
}

export class CheckpointManager {
  constructor(private readonly storage: StorageAdapter) {}

  async saveCheckpoint(
    runId: string,
    stepName: string,
    completedSteps: string[],
    stateSnapshot: unknown,
    policyConfig: PolicyHashInput,
  ): Promise<CheckpointRecord> {
    const record: CheckpointRecord = {
      id: randomUUID(),
      runId,
      stepName,
      stateSnapshot,
      completedSteps: [...completedSteps],
      policyHash: computePolicyHash(policyConfig),
      createdAt: new Date().toISOString(),
    };
    await this.storage.saveCheckpoint(record);
    return record;
  }

  async getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null> {
    return this.storage.getLatestCheckpoint(runId);
  }

  detectDrift(checkpoint: CheckpointRecord, currentPolicyConfig: PolicyHashInput): PolicyDriftResult {
    const newHash = computePolicyHash(currentPolicyConfig);
    return {
      drifted: checkpoint.policyHash !== newHash,
      oldHash: checkpoint.policyHash,
      newHash,
    };
  }

  /**
   * Determine step restoration policy per the design spec:
   * - completed → restore (use cached output)
   * - failed → rerun
   * - running → rerun
   * - skipped → skip
   */
  resolveStepPolicies(
    steps: StepRecord[],
    completedSteps: string[],
    allStepNames: string[],
    options: ResumeOptions = {},
  ): CheckpointStepPolicy[] {
    const stepMap = new Map(steps.map((s) => [s.stepName, s]));
    const completedSet = new Set(completedSteps);

    // If fromStep is specified, everything before it that was completed is restored
    const fromStepIdx = options.fromStep
      ? allStepNames.indexOf(options.fromStep)
      : -1;

    return allStepNames.map((stepName, idx) => {
      const step = stepMap.get(stepName);

      // If fromStep specified and this step is before it
      if (fromStepIdx >= 0 && idx < fromStepIdx && completedSet.has(stepName)) {
        return {
          stepName,
          action: "restore" as const,
          output: step?.output ?? undefined,
        };
      }

      // If fromStep specified and this step is at or after fromStep
      if (fromStepIdx >= 0 && idx >= fromStepIdx) {
        return { stepName, action: "rerun" as const };
      }

      // No fromStep: use step status-based policy
      if (!step) {
        return { stepName, action: "rerun" as const };
      }

      switch (step.status) {
        case "completed":
          return {
            stepName,
            action: "restore" as const,
            output: step.output ?? undefined,
          };
        case "skipped":
          return { stepName, action: "skip" as const };
        case "failed":
        case "running":
        default:
          return { stepName, action: "rerun" as const };
      }
    });
  }
}

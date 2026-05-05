/**
 * @module execution-orchestrator
 * @description High-level orchestrator facade delegating to RunOrchestrator and ResumeOrchestrator.
 */

import type { StorageAdapter, PolicyHashInput } from "@obora/runtime";
import type { RunOptions, RuntimeExecution } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import type { WorkflowRunnerDeps } from "./workflow-runner.js";
import type { TKGService } from "./tkg-service.js";
import type { TKGPromotionEngine } from "./tkg-promotion-engine.js";
import type { EngineBuilder } from "./engine-builder.js";
import type { StepExecutionEngine } from "./step-execution-engine.js";
import type { RepairLoopTracker } from "./repair-loop-tracker.js";
import { RunOrchestrator } from "./run-orchestrator.js";
import { ResumeOrchestrator } from "./resume-orchestrator.js";

export interface ExecutionOrchestratorDeps {
  deps: WorkflowRunnerDeps;
  tkgService: TKGService;
  tkgPromotionEngine: TKGPromotionEngine;
  stepExecutionEngine: StepExecutionEngine;
  engineBuilder: EngineBuilder;
  repairLoopTracker: RepairLoopTracker;
}

/**
 * Orchestrates workflow execution and resume operations.
 *
 * @description
 * Thin facade that delegates to RunOrchestrator and ResumeOrchestrator.
 * Preserves the existing facade contract for all current callers.
 */
export class ExecutionOrchestrator {
  private readonly runOrchestrator: RunOrchestrator;
  private readonly resumeOrchestrator: ResumeOrchestrator;

  constructor(readonly deps: ExecutionOrchestratorDeps) {
    this.runOrchestrator = new RunOrchestrator(deps);
    this.resumeOrchestrator = new ResumeOrchestrator(deps);
  }

  async executeRun(
    executionId: string,
    workflowName: string,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    options: RunOptions,
    isSettledFn: () => boolean
  ): Promise<void> {
    return this.runOrchestrator.executeRun(
      executionId,
      workflowName,
      workflow,
      execution,
      options,
      isSettledFn
    );
  }

  async executeResume(
    runId: string,
    workflowName: string,
    workflow: WorkflowDef,
    runInput: unknown,
    rerunSteps: string[],
    stepPolicies: Array<{ stepName: string; action: string; output?: unknown }>,
    currentPolicyConfig: PolicyHashInput,
    adapter: StorageAdapter
  ): Promise<RuntimeExecution> {
    return this.resumeOrchestrator.executeResume(
      runId,
      workflowName,
      workflow,
      runInput,
      rerunSteps,
      stepPolicies,
      currentPolicyConfig,
      adapter
    );
  }

  getPersistedRepairLoopSummary(executionId: string) {
    return this.deps.repairLoopTracker.getSummary(executionId);
  }

  clearPersistedRepairLoopSummary(executionId: string): void {
    this.deps.repairLoopTracker.clearSummary(executionId);
  }
}

/**
 * @module resume-orchestrator
 * @description Resume execution orchestration for checkpoint-based recovery.
 */

import type { StorageAdapter, PolicyHashInput } from "@obora/runtime";
import { OboraError, OboraErrorCode } from "../runtime-types.js";
import type { RuntimeExecution } from "../runtime-types.js";
import type { WorkflowDef } from "../workflow.js";
import { topologicalSort } from "../dependency-resolver.js";
import type { WorkflowRunnerDeps } from "./workflow-runner.js";
import type { EngineBuilder } from "./engine-builder.js";
import type { StepExecutionEngine } from "./step-execution-engine.js";
import type { RepairLoopTracker } from "./repair-loop-tracker.js";
import { BudgetExceededError } from "../cost-tracker.js";
import { getValidationStepConfig } from "../validation-repair.js";
import type { HookExecutionResult, WorkflowHookLifecycle } from "../hooks.js";

export interface ResumeOrchestratorDeps {
  deps: WorkflowRunnerDeps;
  engineBuilder: EngineBuilder;
  stepExecutionEngine: StepExecutionEngine;
  repairLoopTracker: RepairLoopTracker;
}

/**
 * Orchestrates re-execution of selected steps from a checkpoint.
 */
export class ResumeOrchestrator {
  constructor(private readonly deps: ResumeOrchestratorDeps) {}

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
    const { eventBus, config } = this.deps.deps;
    const executionId = runId;

    const execution: RuntimeExecution = {
      id: executionId,
      workflowName,
      status: "running",
      input: runInput,
      startedAt: new Date(),
      stepOrder: workflow.steps.map((s) => s.name),
      completedSteps: [],
      stepRecords: {},
      outputs: {},
    };

    const completedStepsSet = new Set<string>();

    // Restore completed / skip step outputs
    for (const policy of stepPolicies) {
      if (policy.action === "restore") {
        if (policy.output !== undefined) {
          execution.outputs[policy.stepName] = policy.output;
        }
        completedStepsSet.add(policy.stepName);
        execution.completedSteps = [...completedStepsSet];
      } else if (policy.action === "skip") {
        completedStepsSet.add(policy.stepName);
        execution.completedSteps = [...completedStepsSet];
      }
    }

    const persistenceEnabled = config.persistence?.enabled ?? false;
    const persistenceConfig = config.persistence;

    const engine = await this.deps.engineBuilder.build(
      executionId,
      persistenceEnabled,
      persistenceConfig,
      workflow
    );

    // Import CheckpointManager here to avoid top-level circular deps
    const { CheckpointManager } = await import("@obora/runtime");
    const mgr = new CheckpointManager(adapter);

    const sortedStepDefs = topologicalSort(workflow.steps).filter((s) =>
      rerunSteps.includes(s.name)
    );

    await eventBus.emit("execution_start", executionId, {
      workflowName,
      input: runInput,
      resume: true,
      rerunSteps,
    });

    for (const step of sortedStepDefs) {
      if (engine.costTracker) {
        await engine.costTracker.preStepGate(step.name);
      }
      await eventBus.emit("step_start", executionId, { stepName: step.name, agent: step.agent });

      const stepStartedAt = Date.now();
      const startedAtIso = new Date(stepStartedAt).toISOString();
      const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

      await adapter.saveStep({
        id: `${runId}:${step.name}`,
        runId,
        stepName: step.name,
        status: "running",
        startedAt: startedAtIso,
      });

      try {
        const preStepHook = await this.deps.stepExecutionEngine.runStepHook(workflow, step, "pre_step", executionId);
        if (preStepHook) {
          hookOutputs.pre_step = preStepHook;
        }

        if (getValidationStepConfig(step.config)?.enabled) {
          const preValidationHook = await this.deps.stepExecutionEngine.runStepHook(
            workflow,
            step,
            "pre_validation",
            executionId
          );
          if (preValidationHook) {
            hookOutputs.pre_validation = preValidationHook;
          }
        }

        if (!engine.stepExecutor) {
          throw OboraError.adapterUnavailable(new Error("No LLM adapter configured for resumed step execution"));
        }
        const result = await engine.stepExecutor.executeStep(step, {
          previousOutputs: execution.outputs,
          ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
        });

        const postStepHook = await this.deps.stepExecutionEngine.runStepHook(workflow, step, "post_step", executionId, {
          continueOnError: true,
        });
        if (postStepHook) {
          hookOutputs.post_step = postStepHook;
        }

        execution.outputs[step.name] = result.output;
        execution.stepRecords[step.name] =
          Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
        completedStepsSet.add(step.name);
        execution.completedSteps = [...completedStepsSet];

        const completedAtIso = new Date().toISOString();
        await adapter.saveStep({
          id: `${runId}:${step.name}`,
          runId,
          stepName: step.name,
          status: "completed",
          output:
            result.output && typeof result.output === "object"
              ? (result.output as Record<string, unknown>)
              : ({ value: result.output } as Record<string, unknown>),
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs: Date.now() - stepStartedAt,
        });

        await mgr.saveCheckpoint(
          runId,
          step.name,
          execution.completedSteps,
          execution.outputs,
          currentPolicyConfig
        );

        await eventBus.emit("step_end", executionId, {
          stepName: step.name,
          status: "completed",
          durationMs: Date.now() - stepStartedAt,
        });
      } catch (stepErr) {
        const completedAtIso = new Date().toISOString();
        await adapter.saveStep({
          id: `${runId}:${step.name}`,
          runId,
          stepName: step.name,
          status: "failed",
          error: {
            code:
              stepErr instanceof BudgetExceededError
                ? OboraErrorCode.POLICY_RESOURCE_EXCEEDED
                : stepErr instanceof OboraError
                  ? stepErr.code
                  : OboraErrorCode.SDK_UNKNOWN_ERROR,
            message: stepErr instanceof Error ? stepErr.message : String(stepErr),
            stack: stepErr instanceof Error ? stepErr.stack : undefined,
          },
          startedAt: startedAtIso,
          completedAt: completedAtIso,
          durationMs: Date.now() - stepStartedAt,
        });

        await mgr.saveCheckpoint(
          runId,
          step.name,
          execution.completedSteps,
          execution.outputs,
          currentPolicyConfig
        );

        throw stepErr;
      }
    }

    execution.status = "completed";
    execution.endedAt = new Date();
    await eventBus.emit("execution_end", executionId, {
      workflowName,
      status: "completed",
      resume: true,
    });
    await adapter.saveRun({
      id: runId,
      workflowName,
      status: "completed",
      input: { value: runInput ?? null },
      startedAt: execution.startedAt.toISOString(),
      completedAt: execution.endedAt.toISOString(),
      ...(this.deps.repairLoopTracker.getSummary(executionId)
        ? { metadata: { repairLoop: this.deps.repairLoopTracker.getSummary(executionId) } }
        : {}),
    });

    this.deps.repairLoopTracker.clearSummary(executionId);

    return execution;
  }
}

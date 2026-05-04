import type { WorkflowDef, WorkflowStep, MergeStrategy } from "../workflow.js";
import { ParallelScheduler } from "./parallel-scheduler.js";
import type {
  AgentFactory,
  OboraRuntimeConfig,
  RuntimeExecution,
} from "../runtime-types.js";
import type { EventBus } from "../events/event-bus.js";
import type { StorageAdapter } from "@obora/runtime";
import { StepExecutor } from "../step-executor.js";
import type { StepResult } from "../step-executor.js";
import { CostTracker } from "../cost-tracker.js";
import type { BlackboardManager } from "../blackboard/blackboard-manager.js";
import type { ExecutionObserver, ExecutionMetrics } from "../blackboard/execution-observer.js";
import type { BlackboardSnapshot } from "../blackboard/blackboard-manager.js";
import { RepairLoopTracker } from "./repair-loop-tracker.js";
import {
  executeWorkflowHook,
  resolveWorkflowHook,
  type HookExecutionResult,
  type WorkflowHookLifecycle,
} from "../hooks.js";
import {
  getRepairLoopConfig,
  getValidationStepConfig,
  normalizeValidationResult,
  type RepairContext,
  type ValidationResult,
} from "../validation-repair.js";
import { OboraError } from "../runtime-types.js";
import { DEFAULTS } from "../defaults.js";
import type { RouteResolution } from "../conditional-routing.js";

/** Duck-type for reflector: both ExecutionReflector and ReflectorEngine implement this. */
type ReflectorLike = {
  analyzeFailures(failures: unknown[], currentStepName?: string): string | undefined;
};

export interface StepExecutionEngineDeps {
  eventBus: EventBus;
  config: OboraRuntimeConfig;
  repairLoopTracker: RepairLoopTracker;
}

export class StepExecutionEngine {
  constructor(private readonly deps: StepExecutionEngineDeps) {}

  extractFailurePatterns(blackboard: BlackboardManager, reflector: ReflectorLike): string[] {
    const failures = blackboard.getFailureHistory();
    if (failures.length === 0) return [];
    const hint = reflector.analyzeFailures(failures);
    return hint ? [hint] : [];
  }

  summarizeBlackboardSnapshot(snapshot: BlackboardSnapshot): Record<string, unknown> {
    return {
      facts: snapshot.facts.length,
      failures: snapshot.failures.length,
      stepOutputs: Object.keys(snapshot.stepOutputs),
      stepTimings: Object.keys(snapshot.stepTimings),
      lastFailure: snapshot.failures.at(-1)
        ? {
            stepName: snapshot.failures.at(-1)!.stepName,
            attempt: snapshot.failures.at(-1)!.attempt,
            summary: snapshot.failures.at(-1)!.validation.summary,
          }
        : undefined,
    };
  }

  summarizeObserverMetrics(metrics?: ExecutionMetrics): Record<string, unknown> | undefined {
    if (!metrics) return undefined;
    return {
      totalSteps: metrics.stepMetrics.size,
      totalBackEdges: metrics.totalBackEdges,
      totalRepairs: metrics.totalRepairs,
      totalValidationFailures: metrics.totalValidationFailures,
      totalValidationPasses: metrics.totalValidationPasses,
      steps: [...metrics.stepMetrics.values()].map((step) => ({
        stepName: step.stepName,
        status: step.status,
        retryCount: step.retryCount,
        validationFailures: step.validationFailures,
        validationPasses: step.validationPasses,
      })),
    };
  }

  buildRepairContext(
    step: WorkflowStep,
    repairLoopStates: Map<string, { latestValidation?: ValidationResult; history: ValidationResult[]; attempt: number; repeatedSignatureCount: number; lastSignature?: string }>
  ): RepairContext | undefined {
    const repairConfig = getRepairLoopConfig(step.config);
    if (!repairConfig?.enabled) {
      return undefined;
    }

    const state = repairLoopStates.get(step.name);
    if (!state) {
      return {
        mode: "initial_build",
        attempt: 1,
        validationStep: repairConfig.validation_step,
        maxNoProgressIterations: repairConfig.max_no_progress_iterations,
        repeatedCriticalIssueCeiling: repairConfig.repeated_critical_issue_ceiling,
      };
    }

    return {
      mode: "repair",
      attempt: state.attempt,
      latestValidation: state.latestValidation,
      previousValidationResults: state.history,
      validationStep: repairConfig.validation_step,
      repeatedSignatureCount: state.repeatedSignatureCount,
      maxNoProgressIterations: repairConfig.max_no_progress_iterations,
      repeatedCriticalIssueCeiling: repairConfig.repeated_critical_issue_ceiling,
    };
  }

  resolveValidationResult(step: WorkflowStep, output: unknown): ValidationResult | undefined {
    const validationConfig = getValidationStepConfig(step.config);
    if (!validationConfig?.enabled) {
      return undefined;
    }

    const normalized = normalizeValidationResult(output);
    if (normalized) {
      return normalized;
    }

    if (validationConfig.emit_structured_result) {
      throw new Error(`Validation step '${step.name}' must emit a structured ValidationResult`);
    }

    return undefined;
  }

  async runStepHook(
    workflow: WorkflowDef,
    step: WorkflowStep,
    lifecycle: WorkflowHookLifecycle,
    executionId: string,
    options: {
      signal?: AbortSignal;
      continueOnError?: boolean;
      bestEffort?: boolean;
    } = {}
  ): Promise<HookExecutionResult | undefined> {
    const hook = resolveWorkflowHook(workflow.hooks, step.hooks, lifecycle);
    if (!hook) {
      return undefined;
    }

    const result = await executeWorkflowHook(hook, lifecycle, {
      cwd: process.cwd(),
      signal: options.signal,
    });

    if (result.success) {
      return result;
    }

    const failureDetails = {
      stepName: step.name,
      lifecycle,
      command: result.command,
      exitCode: result.exitCode,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
    };

    if (options.continueOnError || options.bestEffort) {
      await this.deps.eventBus.emit("warning", executionId, {
        message: `Hook '${lifecycle}' failed for step '${step.name}'`,
        bestEffort: options.bestEffort ?? false,
        ...failureDetails,
      });
      return result;
    }

    const exitText = result.exitCode === null ? "unknown" : String(result.exitCode);
    const detailText = result.stderr.trim() || result.stdout.trim() || `exit code ${exitText}`;
    throw new Error(`Hook '${lifecycle}' failed for step '${step.name}': ${detailText}`);
  }

  async executeSingleStep(
    step: WorkflowStep,
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    blackboard?: BlackboardManager
  ): Promise<{ output: unknown; raw?: unknown }> {
    const { eventBus, config } = this.deps;

    if (costTracker) {
      await costTracker.preStepGate(step.name);
    }

    const stepStartedAt = Date.now();
    if (blackboard) {
      blackboard.recordStepStart(step.name);
    }
    await eventBus.emit("step_start", executionId, {
      stepName: step.name,
      agent: step.agent,
    });

    const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

    const preStepHook = await this.runStepHook(workflow, step, "pre_step", executionId, {
      signal,
    });
    if (preStepHook) {
      hookOutputs.pre_step = preStepHook;
    }

    if (getValidationStepConfig(step.config)?.enabled) {
      const preValidationHook = await this.runStepHook(
        workflow,
        step,
        "pre_validation",
        executionId,
        { signal }
      );
      if (preValidationHook) {
        hookOutputs.pre_validation = preValidationHook;
      }
    }

    // Handle explicit parallel branches within a single step
    let result: { output: unknown; raw?: unknown };
    if (step.parallel && step.parallel.length > 0) {
      result = await this.executeParallelBranches(step, execution, stepExecutor, signal);
    } else {
      if (!stepExecutor) {
        throw OboraError.adapterUnavailable(new Error("No LLM adapter configured for step execution"));
      }
      result = await stepExecutor.executeStep(step, {
        previousOutputs: execution.outputs,
        signal,
        ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
      });
    }

    const postStepHook = await this.runStepHook(workflow, step, "post_step", executionId, {
      signal,
      continueOnError: true,
    });
    if (postStepHook) {
      hookOutputs.post_step = postStepHook;
    }

    // Record output
    execution.outputs[step.name] = result.output;
    execution.stepRecords[step.name] =
      Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
    execution.completedSteps.push(step.name);

    if (blackboard) {
      blackboard.recordStepOutput(step.name, result.output);
      blackboard.recordStepEnd(step.name);
    }

    // Persist
    if (persistenceEnabled && persistenceAdapter) {
      try {
        const outputValue =
          typeof result.output === "object" && result.output !== null
            ? (result.output as Record<string, unknown>)
            : { value: result.output };
        await persistenceAdapter.saveStep({
          id: `${executionId}:${step.name}`,
          runId: executionId,
          stepName: step.name,
          status: "completed",
          output: outputValue,
          startedAt: new Date(stepStartedAt).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - stepStartedAt,
        });
      } catch (err) {
        config.logger?.warn?.("[persistence] Failed to save step:", err);
      }
    }

    await eventBus.emit("step_end", executionId, {
      stepName: step.name,
      status: "completed",
      durationMs: Date.now() - stepStartedAt,
      outputPreview:
        typeof result.output === "string"
          ? result.output.slice(0, DEFAULTS.OUTPUT_PREVIEW_LENGTH)
          : JSON.stringify(result.output).slice(0, DEFAULTS.OUTPUT_PREVIEW_LENGTH),
    });

    return result;
  }

  async executeParallelBranches(
    step: WorkflowStep,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    signal?: AbortSignal
  ): Promise<{ output: unknown; raw?: unknown }> {
    const branches = step.parallel!;
    const mergeStrategy: MergeStrategy = step.merge ?? "concat";
    const scheduler = new ParallelScheduler();

    const settled = await Promise.allSettled(
      branches.map(async (branch) => {
        const branchStep: WorkflowStep = {
          ...step,
          agent: branch.agent,
          input: branch.input ?? step.input,
          parallel: undefined,
          merge: undefined,
        };

        if (!stepExecutor) {
          throw OboraError.adapterUnavailable(new Error("No LLM adapter configured for parallel branch execution"));
        }

        return stepExecutor.executeStep(branchStep, {
          previousOutputs: execution.outputs,
          signal,
        });
      })
    );

    const successResults = settled
      .filter((r): r is PromiseFulfilledResult<StepResult> => r.status === "fulfilled")
      .map((r) => r.value);

    if (successResults.length === 0) {
      const errors = settled
        .filter((r): r is PromiseRejectedResult => r.status === "rejected")
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));
      throw new Error(`All parallel branches failed for step '${step.name}': ${errors.join("; ")}`);
    }

    const merged = scheduler.mergeResults(successResults, mergeStrategy);
    return { output: merged, raw: { branches: settled } };
  }
}

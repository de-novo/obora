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
import { resolveFailureRoute } from "../conditional-routing.js";
import type { RouteResolution } from "../conditional-routing.js";
import { ReflectorEngine } from "../reflector/reflector-engine.js";

interface RepairLoopRuntimeState {
  latestValidation?: ValidationResult;
  history: ValidationResult[];
  attempt: number;
  repeatedSignatureCount: number;
  lastSignature?: string;
}

const DEFAULT_MAX_CONCURRENCY = 3;

/** Duck-type for reflector: both ExecutionReflector and ReflectorEngine implement this. */
type ReflectorLike = {
  analyzeFailures(failures: unknown[], currentStepName?: string): string | undefined;
};

export interface StepExecutionEngineDeps {
  eventBus: EventBus;
  config: OboraRuntimeConfig;
  repairLoopTracker: RepairLoopTracker;
}

/**
 * Core step execution logic for workflow runs.
 *
 * @description
 * Handles the execution of individual workflow steps including:
 * - Sequential and parallel step execution loops
 * - Back-edge routing (on_fail.goto with retry limits)
 * - Validation and repair loop management
 * - Workflow hook execution (pre_step, post_step, pre_validation, post_cycle)
 * - Blackboard snapshot summarization and failure pattern extraction
 * - Cost tracking integration
 */
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
  async executeStepLoop(
    sortedSteps: WorkflowStep[],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver
  ): Promise<void> {
    const { eventBus, config } = this.deps;

    const stepIndexByName = new Map(sortedSteps.map((step, idx) => [step.name, idx]));
    const backEdgeIterations = new Map<string, number>();
    const repairLoopStates = new Map<string, RepairLoopRuntimeState>();
    /** Reflector v2 force_target overrides, keyed by validation/failing step name. */
    const forcedRouteTargets = new Map<string, string>();
    /** Global repair attempt counter — not reset by back-edges */
    let globalRepairAttempts = 0;
    let cursor = 0;

    const triggerBackEdge = async (
      step: WorkflowStep,
      reason: string,
      overrides?: {
        noProgress?: boolean;
        category?: "no_progress" | "repeated_critical_issue";
        cause?: unknown;
        targetResolution?: RouteResolution;
      }
    ): Promise<number> => {
      const onFail = step.on_fail;

      if (!onFail?.goto) {
        throw overrides?.cause ?? new Error(reason);
      }

      const targetStepName =
        overrides?.targetResolution?.target ??
        (typeof onFail.goto === "string" ? onFail.goto : onFail.goto[0]?.target);

      if (!targetStepName) {
        throw overrides?.cause ?? new Error(reason);
      }

      const targetIndex = stepIndexByName.get(targetStepName);
      if (targetIndex === undefined) {
        throw overrides?.cause ?? new Error(reason);
      }

      const maxIterations =
        typeof onFail.max_iterations === "number" &&
        Number.isFinite(onFail.max_iterations) &&
        onFail.max_iterations > 0
          ? onFail.max_iterations
          : 1;
      const key = `${step.name}->${targetStepName}`;
      const nextIteration = (backEdgeIterations.get(key) ?? 0) + 1;
      backEdgeIterations.set(key, nextIteration);

      if (overrides?.noProgress) {
        this.deps.repairLoopTracker.recordRepairNoProgress(executionId, reason, overrides.category ?? "no_progress");
        await eventBus.emit("workflow.repair_no_progress", executionId, {
          sourceStep: step.name,
          targetStep: targetStepName,
          iteration: nextIteration,
          reason,
          category: overrides.category ?? "no_progress",
        });
      }

      if (nextIteration > maxIterations || overrides?.noProgress) {
        this.deps.repairLoopTracker.recordBackEdgeExhausted(executionId, reason);
        await eventBus.emit("workflow.back_edge_exhausted", executionId, {
          sourceStep: step.name,
          targetStep: targetStepName,
          iteration: nextIteration,
          maxIterations,
          escalation: onFail.escalate_on_exhaust ?? "fail",
          reason,
        });
        throw overrides?.cause ?? new Error(reason);
      }

      const invalidated = sortedSteps.slice(targetIndex).map((s) => s.name);
      const invalidatedSet = new Set(invalidated);
      execution.completedSteps = execution.completedSteps.filter(
        (name) => !invalidatedSet.has(name)
      );
      for (const name of invalidated) {
        delete execution.outputs[name];
        delete execution.stepRecords[name];
      }

      this.deps.repairLoopTracker.recordBackEdgeTriggered(executionId);
      await eventBus.emit("workflow.back_edge_triggered", executionId, {
        sourceStep: step.name,
        targetStep: targetStepName,
        iteration: nextIteration,
        maxIterations,
        reason,
        ...(overrides?.targetResolution ? { routeResolution: overrides.targetResolution } : {}),
      });

      await this.runStepHook(workflow, step, "post_cycle", executionId, {
        signal,
        continueOnError: true,
        bestEffort: true,
      });

      return targetIndex;
    };

    while (cursor < sortedSteps.length) {
      const step = sortedSteps[cursor]!;

      if (isSettledFn?.()) return;

      if (signal?.aborted) return;

      if (costTracker) {
        await costTracker.preStepGate(step.name);
      }

      const repairContext = this.buildRepairContext(step, repairLoopStates);
      if (repairContext?.mode === "repair") {
        // Inject reflector hint from blackboard failure history
        if (reflector && blackboard) {
          const failures = blackboard.getFailureHistory();
          config?.logger?.info?.(
            `[reflector] analyzing ${failures.length} failures for step ${step.name}`
          );
          const hint = reflector.analyzeFailures(failures, step.name);
          config?.logger?.info?.(
            `[reflector] hint result: ${hint ? hint.slice(0, DEFAULTS.REFLECTOR_HINT_PREVIEW_LENGTH) + "..." : "(none)"}`
          );
          if (hint) {
            repairContext.reflectorHint = hint;
            config?.logger?.info?.(
              `[reflector] ${step.name} attempt ${repairContext.attempt}: ${hint}`
            );
          }
          // Execute Reflector v2 actions (force_target, abort, switch_model)
          if (reflector instanceof ReflectorEngine) {
            const lastOutput = reflector.getLastOutput();
            if (lastOutput) {
              for (const ar of lastOutput.actions) {
                const pending = (ar.metadata as Record<string, unknown>)?.pendingAction as
                  | { type: string; payload: Record<string, unknown> }
                  | undefined;
                if (!pending) continue;
                if (pending.type === "abort") {
                  const reason = String(
                    pending.payload?.reason ?? "Reflector abort action triggered"
                  );
                  config?.logger?.warn?.(`[reflector] ABORT: ${reason}`);
                  throw OboraError.executionFailed(reason);
                }
                if (pending.type === "force_target") {
                  const target = String(pending.payload?.target ?? "");
                  if (target && stepIndexByName.has(target)) {
                    config?.logger?.info?.(`[reflector] force_target → ${target}`);
                    repairContext.forceTarget = target;
                    const validationStepName = repairContext.validationStep;
                    if (validationStepName) {
                      forcedRouteTargets.set(validationStepName, target);
                      config?.logger?.info?.(
                        `[reflector] queued force_target for validation step ${validationStepName} → ${target}`
                      );
                    }
                  }
                }
              }
            }
          }
        }
        this.deps.repairLoopTracker.recordRepairStarted(executionId, step.name, repairContext.attempt);
        await eventBus.emit("workflow.repair_started", executionId, {
          stepName: step.name,
          attempt: repairContext.attempt,
          latestValidation: repairContext.latestValidation,
          reflectorHint: repairContext.reflectorHint,
          ...(blackboard || observer
            ? {
                debugState: {
                  ...(blackboard
                    ? {
                        blackboard: this.summarizeBlackboardSnapshot(blackboard.getSnapshot()),
                      }
                    : {}),
                  ...(observer
                    ? {
                        observer: this.summarizeObserverMetrics(observer.getMetrics(executionId)),
                      }
                    : {}),
                },
              }
            : {}),
        });
      }

      const stepStartedAt = Date.now();
      if (blackboard) {
        blackboard.recordStepStart(step.name);
      }
      await eventBus.emit("step_start", executionId, {
        stepName: step.name,
        agent: step.agent,
      });

      let result: { output: unknown; raw?: unknown } | undefined;
      const hookOutputs: Partial<Record<WorkflowHookLifecycle, HookExecutionResult>> = {};

      try {
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

        if (!stepExecutor) {
          throw OboraError.adapterUnavailable(new Error("No LLM adapter configured for step execution"));
        }
        result = await stepExecutor.executeStep(step, {
          previousOutputs: execution.outputs,
          signal,
          ...(Object.keys(hookOutputs).length > 0 ? { hookOutputs } : {}),
          ...(repairContext ? { repairContext } : {}),
        });

        const postStepHook = await this.runStepHook(workflow, step, "post_step", executionId, {
          signal,
          continueOnError: true,
        });
        if (postStepHook) {
          hookOutputs.post_step = postStepHook;
        }
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        cursor = await triggerBackEdge(step, reason, { cause: error });
        continue;
      }

      if (isSettledFn?.() || !result) return;

      const validationResult = this.resolveValidationResult(step, result.output);
      if (validationResult) {
        if (blackboard) {
          const repairState = repairLoopStates.get(step.name);
          blackboard.recordValidation(step.name, validationResult, repairState?.attempt ?? 1);
        }

        if (validationResult.passed) {
          this.deps.repairLoopTracker.recordValidationPass(executionId, step.name, validationResult);
          await eventBus.emit("workflow.validation_passed", executionId, {
            stepName: step.name,
            summary: validationResult.summary,
            signature: validationResult.signature,
          });
        } else {
          this.deps.repairLoopTracker.recordValidationFailure(executionId, step.name, validationResult);
          await eventBus.emit("workflow.validation_failed", executionId, {
            stepName: step.name,
            summary: validationResult.summary,
            errorCode: validationResult.errorCode,
            failedChecks: validationResult.failedChecks,
            signature: validationResult.signature,
            logPath: validationResult.logPath,
            ...(blackboard || observer
              ? {
                  debugState: {
                    ...(blackboard
                      ? {
                          blackboard: this.summarizeBlackboardSnapshot(blackboard.getSnapshot()),
                        }
                      : {}),
                    ...(observer
                      ? {
                          observer: this.summarizeObserverMetrics(observer.getMetrics(executionId)),
                        }
                      : {}),
                  },
                }
              : {}),
          });

          const goto = step.on_fail?.goto;
          if (goto) {
            globalRepairAttempts++;

            // Check global repair ceiling (prevents infinite loops across back-edges)
            // Reflector v2: forceTarget overrides route resolution
            const queuedForceTarget = forcedRouteTargets.get(step.name);
            const repairState = repairLoopStates.get(step.name);
            const forceTarget =
              queuedForceTarget ??
              (repairState ? undefined : (repairContext as RepairContext | undefined)?.forceTarget);
            const baseResolution = resolveFailureRoute(goto, validationResult);
            const routeResolution: RouteResolution =
              forceTarget && stepIndexByName.has(forceTarget)
                ? { target: forceTarget, matchReason: "default" as const }
                : baseResolution;
            if (queuedForceTarget) {
              forcedRouteTargets.delete(step.name);
            }
            const targetStepName = routeResolution.target;
            const repairConfigForCeiling = getRepairLoopConfig(
              sortedSteps.find((candidate) => candidate.name === targetStepName)?.config
            );
            const globalCeiling = repairConfigForCeiling?.max_total_repair_attempts;
            if (globalCeiling !== undefined && globalRepairAttempts > globalCeiling) {
              cursor = await triggerBackEdge(
                step,
                `Global repair ceiling exceeded (${globalRepairAttempts} total attempts across all back-edges). Stopping repair for step '${step.name}'.`,
                { noProgress: true, category: "no_progress", targetResolution: routeResolution }
              );
              continue;
            }

            const previousState = repairLoopStates.get(targetStepName);
            const repeatedSignatureCount =
              previousState?.lastSignature &&
              previousState.lastSignature === validationResult.signature
                ? previousState.repeatedSignatureCount + 1
                : 1;
            const nextState: RepairLoopRuntimeState = {
              latestValidation: validationResult,
              history: [...(previousState?.history ?? []), validationResult],
              attempt: (previousState?.attempt ?? 1) + 1,
              repeatedSignatureCount,
              lastSignature: validationResult.signature,
            };
            repairLoopStates.set(targetStepName, nextState);

            const repairConfig = getRepairLoopConfig(
              sortedSteps.find((candidate) => candidate.name === targetStepName)?.config
            );
            const noProgressLimit = repairConfig?.max_no_progress_iterations;
            const repeatedCriticalIssueCeiling = repairConfig?.repeated_critical_issue_ceiling;
            if (noProgressLimit !== undefined && repeatedSignatureCount > noProgressLimit) {
              cursor = await triggerBackEdge(
                step,
                `Validation for step '${step.name}' made no progress after ${repeatedSignatureCount} repeated failure signature(s): ${validationResult.summary}`,
                { noProgress: true, category: "no_progress", targetResolution: routeResolution }
              );
              continue;
            }
            if (
              repeatedCriticalIssueCeiling !== undefined &&
              repeatedSignatureCount > repeatedCriticalIssueCeiling
            ) {
              cursor = await triggerBackEdge(
                step,
                `Validation for step '${step.name}' exceeded repeated critical issue ceiling after ${repeatedSignatureCount} repeated failure signature(s): ${validationResult.summary}`,
                {
                  noProgress: true,
                  category: "repeated_critical_issue",
                  targetResolution: routeResolution,
                }
              );
              continue;
            }

            cursor = await triggerBackEdge(
              step,
              `Validation failed for step '${step.name}': ${validationResult.summary}`,
              { targetResolution: routeResolution }
            );
            continue;
          }

          cursor = await triggerBackEdge(
            step,
            `Validation failed for step '${step.name}': ${validationResult.summary}`
          );
          continue;
        }
      }

      execution.outputs[step.name] = result.output;
      execution.stepRecords[step.name] =
        Object.keys(hookOutputs).length > 0 ? { ...result, hooks: hookOutputs } : result;
      execution.completedSteps.push(step.name);

      // Record step output on blackboard
      if (blackboard) {
        blackboard.recordStepOutput(step.name, result.output);
        blackboard.recordStepEnd(step.name);
      }

      if (repairContext?.mode === "repair") {
        this.deps.repairLoopTracker.recordRepairCompleted(executionId, step.name, repairContext.attempt);
        await eventBus.emit("workflow.repair_completed", executionId, {
          stepName: step.name,
          attempt: repairContext.attempt,
        });
      }

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

      if (isSettledFn?.()) return;

      await eventBus.emit("step_end", executionId, {
        stepName: step.name,
        status: "completed",
        durationMs: Date.now() - stepStartedAt,
        outputPreview:
          typeof result.output === "string"
            ? result.output.slice(0, 200)
            : JSON.stringify(result.output).slice(0, 200),
      });

      if (isSettledFn?.()) return;

      cursor += 1;
    }
  }

  // ── Single-step execution (shared by sequential and parallel paths) ──────

  /**
   * Execute a single step with hooks, blackboard recording, persistence, and events.
   * Does NOT handle back-edges or repair loops — those are the caller's responsibility.
   * Throws on step failure.
   */

  // ── Parallel step-execution loop ───────────────────────────────────────

  /**
   * Executes steps layer by layer, running independent steps in parallel.
   *
   * For single-step layers, delegates to the existing sequential `executeStepLoop`
   * to preserve full back-edge and repair-loop support.
   *
   * For multi-step layers, runs all steps concurrently with `Promise.allSettled`.
   */

  async executeParallelStepLoop(
    layers: WorkflowStep[][],
    workflow: WorkflowDef,
    execution: RuntimeExecution,
    stepExecutor: StepExecutor | undefined,
    costTracker: CostTracker | undefined,
    executionId: string,
    persistenceEnabled: boolean,
    persistenceAdapter: StorageAdapter | null,
    signal?: AbortSignal,
    isSettledFn?: () => boolean,
    blackboard?: BlackboardManager,
    reflector?: ReflectorLike,
    observer?: ExecutionObserver,
    maxConcurrency: number = DEFAULT_MAX_CONCURRENCY
  ): Promise<void> {
    const { eventBus } = this.deps;
    const scheduler = new ParallelScheduler(maxConcurrency);

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      const layer = layers[layerIdx]!;

      if (isSettledFn?.() || signal?.aborted) return;

      // Single-step layer → delegate to the full sequential loop
      // (preserves back-edge, repair-loop, and validation handling)
      if (layer.length === 1) {
        await this.executeStepLoop(
          layer,
          workflow,
          execution,
          stepExecutor,
          costTracker,
          executionId,
          persistenceEnabled,
          persistenceAdapter,
          signal,
          isSettledFn,
          blackboard,
          reflector,
          observer
        );
        continue;
      }

      // Multi-step layer → parallel execution
      await eventBus.emit("parallel_layer_start", executionId, {
        layerIndex: layerIdx,
        stepNames: layer.map((s) => s.name),
        concurrency: Math.min(layer.length, scheduler.maxConcurrency),
      });

      const layerStartedAt = Date.now();
      const outcomes = await scheduler.executeParallelSteps(layer, async (step) => {
        const result = await this.executeSingleStep(
          step,
          workflow,
          execution,
          stepExecutor,
          costTracker,
          executionId,
          persistenceEnabled,
          persistenceAdapter,
          signal,
          blackboard
        );
        return result as StepResult;
      });

      const completed: string[] = [];
      const failed: string[] = [];
      for (const outcome of outcomes) {
        if (outcome.status === "fulfilled") {
          completed.push(outcome.stepName);
        } else {
          failed.push(outcome.stepName);
          await eventBus.emit("warning", executionId, {
            message: `Step '${outcome.stepName}' failed in parallel layer: ${
              outcome.error instanceof Error ? outcome.error.message : String(outcome.error)
            }`,
          });
        }
      }

      // Record parallel execution metrics on blackboard
      if (blackboard) {
        blackboard.recordStepOutput(`__parallel_layer_${layerIdx}`, {
          completed,
          failed,
          concurrency: Math.min(layer.length, scheduler.maxConcurrency),
          durationMs: Date.now() - layerStartedAt,
        });
      }

      await eventBus.emit("parallel_layer_end", executionId, {
        layerIndex: layerIdx,
        stepNames: layer.map((s) => s.name),
        completed,
        failed,
        durationMs: Date.now() - layerStartedAt,
      });

      if (isSettledFn?.()) return;
    }
  }

}

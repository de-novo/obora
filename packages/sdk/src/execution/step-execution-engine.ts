import type { WorkflowDef, WorkflowStep } from "../workflow.js";
import type {
  AgentFactory,
  OboraRuntimeConfig,
  RuntimeExecution,
} from "../runtime-types.js";
import type { EventBus } from "../events/event-bus.js";
import type { StorageAdapter } from "@obora/runtime";
import { StepExecutor } from "../step-executor.js";
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
}

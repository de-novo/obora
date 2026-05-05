import type { BlackboardSnapshot } from "../blackboard/blackboard-manager.js";
import type { ExecutionMetrics } from "../blackboard/execution-observer.js";

export function summarizeBlackboardSnapshot(
  snapshot: BlackboardSnapshot
): Record<string, unknown> {
  const lastFailure = snapshot.failures.at(-1);

  return {
    facts: snapshot.facts.length,
    failures: snapshot.failures.length,
    stepOutputs: Object.keys(snapshot.stepOutputs),
    stepTimings: Object.keys(snapshot.stepTimings),
    lastFailure: lastFailure
      ? {
          stepName: lastFailure.stepName,
          attempt: lastFailure.attempt,
          summary: lastFailure.validation.summary,
        }
      : undefined,
  };
}

export function summarizeObserverMetrics(
  metrics?: ExecutionMetrics
): Record<string, unknown> | undefined {
  if (!metrics) {
    return undefined;
  }

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

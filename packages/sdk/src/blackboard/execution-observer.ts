import type { EventBus } from "../events/event-bus.js";
import type { AuditEventType, AuditEvent, Unsubscribe } from "../runtime-types.js";

export interface StepMetrics {
  stepName: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  retryCount: number;
  validationFailures: number;
  validationPasses: number;
}

export interface ExecutionMetrics {
  executionId: string;
  startedAt: number;
  completedAt?: number;
  totalDurationMs?: number;
  stepMetrics: Map<string, StepMetrics>;
  totalBackEdges: number;
  totalRepairs: number;
  totalValidationFailures: number;
  totalValidationPasses: number;
}

/**
 * Subscribes to workflow events via the SDK EventBus and tracks
 * step durations, costs, failure counts, and retry counts.
 */
export class ExecutionObserver {
  private readonly metrics = new Map<string, ExecutionMetrics>();
  private readonly unsubscribes: Unsubscribe[] = [];

  constructor(private readonly eventBus: EventBus) {}

  /**
   * Start observing events for a given execution.
   */
  observe(executionId: string): void {
    this.metrics.set(executionId, {
      executionId,
      startedAt: Date.now(),
      stepMetrics: new Map(),
      totalBackEdges: 0,
      totalRepairs: 0,
      totalValidationFailures: 0,
      totalValidationPasses: 0,
    });

    const events: AuditEventType[] = [
      "step_start",
      "step_end",
      "workflow.validation_failed",
      "workflow.validation_passed",
      "workflow.back_edge_triggered",
      "workflow.repair_started",
      "workflow.repair_completed",
    ];

    for (const eventType of events) {
      const unsub = this.eventBus.on(eventType, (event: AuditEvent) => {
        if (event.executionId !== executionId) return;
        this.handleEvent(executionId, event);
      });
      this.unsubscribes.push(unsub);
    }
  }

  private handleEvent(executionId: string, event: AuditEvent): void {
    const exec = this.metrics.get(executionId);
    if (!exec) return;

    const data = event.data as Record<string, unknown> | undefined;
    const stepName = (data?.stepName as string) ?? "";

    switch (event.type) {
      case "step_start": {
        const existing = exec.stepMetrics.get(stepName);
        exec.stepMetrics.set(stepName, {
          stepName,
          startedAt: Date.now(),
          status: "running",
          retryCount: existing?.retryCount ?? 0,
          validationFailures: existing?.validationFailures ?? 0,
          validationPasses: existing?.validationPasses ?? 0,
        });
        break;
      }
      case "step_end": {
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.completedAt = Date.now();
          step.durationMs = step.completedAt - step.startedAt;
          step.status = "completed";
        }
        break;
      }
      case "workflow.validation_failed": {
        exec.totalValidationFailures += 1;
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.validationFailures += 1;
        }
        break;
      }
      case "workflow.validation_passed": {
        exec.totalValidationPasses += 1;
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.validationPasses += 1;
        }
        break;
      }
      case "workflow.back_edge_triggered": {
        exec.totalBackEdges += 1;
        break;
      }
      case "workflow.repair_started": {
        exec.totalRepairs += 1;
        const targetStep = exec.stepMetrics.get(stepName);
        if (targetStep) {
          targetStep.retryCount += 1;
        }
        break;
      }
      case "workflow.repair_completed": {
        // Tracked for metrics completeness; no additional counters needed.
        break;
      }
    }
  }

  /**
   * Get metrics for a specific execution.
   */
  getMetrics(executionId: string): ExecutionMetrics | undefined {
    return this.metrics.get(executionId);
  }

  /**
   * Mark execution as completed and finalize metrics.
   */
  finalize(executionId: string): ExecutionMetrics | undefined {
    const exec = this.metrics.get(executionId);
    if (!exec) return undefined;
    exec.completedAt = Date.now();
    exec.totalDurationMs = exec.completedAt - exec.startedAt;
    return exec;
  }

  /**
   * Stop observing and clean up subscriptions.
   */
  dispose(): void {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes.length = 0;
  }
}

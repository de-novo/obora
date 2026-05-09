import { createAgentId, type CostSummary } from "@obora/runtime";
import type { EventBus } from "../events/event-bus.js";
import type { AuditEventType, AuditEvent, Unsubscribe } from "../runtime-types.js";
import type { CostTracker } from "../cost-tracker.js";
import type { BlackboardManager } from "./blackboard-manager.js";

export interface StepMetrics {
  stepName: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  status: "running" | "completed" | "failed";
  retryCount: number;
  validationFailures: number;
  validationPasses: number;
  /** Per-step cost in USD (populated when CostTracker is attached). */
  costUsd?: number;
  /** Individual attempt durations in ms (for min/max/avg computation). */
  attemptDurations: number[];
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
  /** Cumulative cost in USD (populated when CostTracker is attached). */
  totalCostUsd?: number;
}

export interface ExecutionReportStepMetric {
  stepName: string;
  attempts: number;
  successCount: number;
  failureCount: number;
  totalDuration: number;
  avgDuration: number;
  minDuration?: number;
  maxDuration?: number;
  cost: number;
}

export interface ExecutionReport {
  workflowName: string;
  startedAt: Date;
  completedAt: Date;
  totalDuration: number;
  totalCost: number;
  totalSteps: number;
  totalRetries: number;
  totalBackEdges: number;
  stepMetrics: ExecutionReportStepMetric[];
  failurePatterns: string[];
  outcome: "success" | "failure" | "timeout";
}

/**
 * Subscribes to workflow events via the SDK EventBus and tracks
 * step durations, costs, failure counts, and retry counts.
 */
export class ExecutionObserver {
  private readonly metrics = new Map<string, ExecutionMetrics>();
  private readonly unsubscribes: Unsubscribe[] = [];
  private costTracker?: CostTracker;
  /** Snapshot of cumulative cost at step_start, keyed by `executionId:stepName`. */
  private readonly costSnapshots = new Map<string, number>();
  constructor(
    private readonly eventBus: EventBus,
    private readonly blackboard?: BlackboardManager,
    private readonly logger?: { warn?: (message: string, ...args: unknown[]) => void },
  ) {}

  /**
   * Attach a CostTracker to enable per-step and total cost recording.
   */
  attachCostTracker(tracker: CostTracker): void {
    this.costTracker = tracker;
  }

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

    events.forEach((eventType) => {
      const unsub = this.eventBus.on(eventType, (event: AuditEvent) => {
        if (event.executionId !== executionId) return;
        this.handleEvent(executionId, event);
      });
      this.unsubscribes.push(unsub);
    });
  }

  private handleEvent(executionId: string, event: AuditEvent): void {
    const exec = this.metrics.get(executionId);
    if (!exec) return;

    const data = event.data as Record<string, unknown> | undefined;
    const stepName = (data?.stepName as string) ?? "";

    switch (event.type) {
      case "step_start": {
        const existing = exec.stepMetrics.get(stepName);
        const startedAt = Date.now();
        exec.stepMetrics.set(stepName, {
          stepName,
          startedAt,
          status: "running",
          retryCount: existing?.retryCount ?? 0,
          validationFailures: existing?.validationFailures ?? 0,
          validationPasses: existing?.validationPasses ?? 0,
          costUsd: existing?.costUsd,
          attemptDurations: existing?.attemptDurations ?? [],
        });

        // Write to blackboard
        if (this.blackboard) {
          this.blackboard.board.write(
            `state.context.observer.steps.${stepName}.startedAt`,
            startedAt,
          );
          this.blackboard.board.write(
            `state.context.observer.steps.${stepName}.status`,
            "running",
          );
        }

        // Snapshot cumulative cost before this step runs
        if (this.costTracker) {
          const key = `${executionId}:${stepName}`;
          this.costTracker.runCost().then((summary: CostSummary) => {
            this.costSnapshots.set(key, summary.totalCostUsd);
          }).catch((err) => {
            if (this.logger?.warn) {
              this.logger.warn("[execution-observer] Failed to snapshot cost:", err);
            }
          });
        }
        break;
      }
      case "step_end": {
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.completedAt = Date.now();
          step.durationMs = step.completedAt - step.startedAt;
          step.attemptDurations.push(step.durationMs);

          const status = (data?.status as string) ?? "completed";
          step.status = status === "failed" ? "failed" : "completed";

          // Write to blackboard
          if (this.blackboard) {
            this.blackboard.board.write(
              `state.context.observer.steps.${stepName}.completedAt`,
              step.completedAt,
            );
            this.blackboard.board.write(
              `state.context.observer.steps.${stepName}.durationMs`,
              step.durationMs,
            );
            this.blackboard.board.write(
              `state.context.observer.steps.${stepName}.status`,
              step.status,
            );
          }

          // Compute per-step cost delta
          if (this.costTracker) {
            const key = `${executionId}:${stepName}`;
            const beforeCost = this.costSnapshots.get(key) ?? 0;
            this.costTracker.runCost().then((summary: CostSummary) => {
              const delta = summary.totalCostUsd - beforeCost;
              step.costUsd = (step.costUsd ?? 0) + delta;
              exec.totalCostUsd = summary.totalCostUsd;
              this.costSnapshots.delete(key);
            }).catch((err) => {
              if (this.logger?.warn) {
                this.logger.warn("[execution-observer] Failed to compute step cost delta:", err);
              }
            });
          }
        }
        break;
      }
      case "workflow.validation_failed": {
        exec.totalValidationFailures += 1;
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.validationFailures += 1;
        }

        // Write validation state + knowledge fact to blackboard
        if (this.blackboard) {
          this.blackboard.board.write(
            `state.context.observer.validations.${stepName}`,
            {
              failures: exec.totalValidationFailures,
              lastFailure: data?.summary ?? "validation failed",
              timestamp: Date.now(),
            },
          );
          this.blackboard.board.knowledge.addFact({
            content: `Validation failure in step "${stepName}": ${data?.summary ?? "validation failed"}`,
            source: createAgentId("execution-observer"),
            confidence: 1.0,
            category: "observer_validation_failure",
            tags: ["observer", "validation-failure", stepName],
          });
        }
        break;
      }
      case "workflow.validation_passed": {
        exec.totalValidationPasses += 1;
        const step = exec.stepMetrics.get(stepName);
        if (step) {
          step.validationPasses += 1;
        }

        // Write validation state to blackboard
        if (this.blackboard) {
          this.blackboard.board.write(
            `state.context.observer.validations.${stepName}`,
            {
              passes: exec.totalValidationPasses,
              lastPass: data?.summary ?? "validation passed",
              timestamp: Date.now(),
            },
          );
        }
        break;
      }
      case "workflow.back_edge_triggered": {
        exec.totalBackEdges += 1;

        // Write knowledge fact to blackboard
        if (this.blackboard) {
          this.blackboard.board.knowledge.addFact({
            content: `Back-edge triggered: "${data?.sourceStep ?? ""}" → "${data?.targetStep ?? ""}"`,
            source: createAgentId("execution-observer"),
            confidence: 1.0,
            category: "observer_back_edge",
            tags: ["observer", "back-edge", String(data?.sourceStep ?? ""), String(data?.targetStep ?? "")],
          });
        }
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
  finalize(
    executionId: string,
    outcome?: "success" | "failure" | "timeout",
  ): ExecutionMetrics | undefined {
    const exec = this.metrics.get(executionId);
    if (!exec) return undefined;
    exec.completedAt = Date.now();
    exec.totalDurationMs = exec.completedAt - exec.startedAt;
    // Store outcome for report generation
    (exec as ExecutionMetrics & { _outcome?: string })._outcome =
      outcome ?? "success";

    // Write execution report to blackboard
    if (this.blackboard) {
      const report = this.generateReport(executionId);
      if (report) {
        this.blackboard.board.write("state.context.observer.report", report);
      }
    }

    return exec;
  }

  /**
   * Generate a JSON-serializable execution report.
   */
  generateReport(
    executionId: string,
    options?: {
      workflowName?: string;
      failurePatterns?: string[];
    },
  ): ExecutionReport | undefined {
    const exec = this.metrics.get(executionId);
    if (!exec) return undefined;

    const reportMetrics = Array.from(exec.stepMetrics.values()).reduce<{
      stepMetrics: ExecutionReportStepMetric[];
      totalRetries: number;
    }>((acc, step) => {
      const attempts = 1 + step.retryCount;

      const durations = step.attemptDurations;
      const totalDuration = durations.reduce((sum, d) => sum + d, 0);
      const avgDuration = durations.length > 0 ? totalDuration / durations.length : 0;
      const minDuration = durations.length > 0 ? Math.min(...durations) : undefined;
      const maxDuration = durations.length > 0 ? Math.max(...durations) : undefined;

      return {
        totalRetries: acc.totalRetries + step.retryCount,
        stepMetrics: [...acc.stepMetrics, {
        stepName: step.stepName,
        attempts,
        successCount: step.validationPasses,
        failureCount: step.validationFailures,
        totalDuration,
        avgDuration,
        minDuration,
        maxDuration,
        cost: step.costUsd ?? 0,
        }],
      };
    }, { stepMetrics: [], totalRetries: 0 });

    const outcome =
      ((exec as ExecutionMetrics & { _outcome?: string })._outcome as
        | "success"
        | "failure"
        | "timeout") ?? "success";

    return {
      workflowName: options?.workflowName ?? "unknown",
      startedAt: new Date(exec.startedAt),
      completedAt: new Date(exec.completedAt ?? Date.now()),
      totalDuration: exec.totalDurationMs ?? Date.now() - exec.startedAt,
      totalCost: exec.totalCostUsd ?? 0,
      totalSteps: exec.stepMetrics.size,
      totalRetries: reportMetrics.totalRetries,
      totalBackEdges: exec.totalBackEdges,
      stepMetrics: reportMetrics.stepMetrics,
      failurePatterns: options?.failurePatterns ?? [],
      outcome,
    };
  }

  /**
   * Stop observing and clean up subscriptions.
   */
  dispose(): void {
    this.unsubscribes.forEach((unsub) => unsub());
    this.unsubscribes.length = 0;
  }
}

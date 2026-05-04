import type { ValidationResult } from "../validation-repair.js";
import type {
  PersistedRepairLoopSummary,
} from "../runtime-types.js";

/**
 * Tracks repair loop state for workflow executions.
 * 
 * @description
 * Maintains per-execution counters for validation failures/passes, repair attempts,
 * back-edge triggers, and recent failure history. Used by StepExecutionEngine to
 * detect repair loops that are stuck or exhausted.
 * 
 * @example
 * ```ts
 * const tracker = new RepairLoopTracker();
 * tracker.recordValidationFailure("exec-1", "step-a", validationResult);
 * tracker.recordRepairStarted("exec-1", "step-a", 2);
 * const summary = tracker.getSummary("exec-1");
 * ```
 */
export class RepairLoopTracker {
  private readonly repairLoopSummaries = new Map<string, PersistedRepairLoopSummary>();

  ensureSummary(executionId: string): PersistedRepairLoopSummary {
    const existing = this.repairLoopSummaries.get(executionId);
    if (existing) return existing;

    const created: PersistedRepairLoopSummary = {
      validationFailed: 0,
      validationPassed: 0,
      repairStarted: 0,
      repairCompleted: 0,
      repairNoProgress: 0,
      backEdgeTriggered: 0,
      backEdgeExhausted: 0,
      recentValidationFailures: [],
    };
    this.repairLoopSummaries.set(executionId, created);
    return created;
  }

  getSummary(executionId: string): PersistedRepairLoopSummary | undefined {
    const summary = this.repairLoopSummaries.get(executionId);
    if (!summary) return undefined;
    const hasActivity =
      summary.validationFailed > 0 ||
      summary.validationPassed > 0 ||
      summary.repairStarted > 0 ||
      summary.repairCompleted > 0 ||
      summary.repairNoProgress > 0 ||
      summary.backEdgeTriggered > 0 ||
      summary.backEdgeExhausted > 0;
    return hasActivity ? structuredClone(summary) : undefined;
  }

  clearSummary(executionId: string): void {
    this.repairLoopSummaries.delete(executionId);
  }

  recordValidationFailure(
    executionId: string,
    stepName: string,
    validationResult: ValidationResult
  ): void {
    const summary = this.ensureSummary(executionId);
    summary.validationFailed += 1;
    summary.lastValidationStep = stepName;
    summary.lastValidationSummary = validationResult.summary;
    summary.recentValidationFailures.push({
      stepName,
      summary: validationResult.summary,
      ...(validationResult.errorCode ? { errorCode: validationResult.errorCode } : {}),
      ...(validationResult.logPath ? { logPath: validationResult.logPath } : {}),
      failedChecks: validationResult.failedChecks.map((check) => ({
        ...(check.name ? { name: check.name } : {}),
        ...(check.message ? { message: check.message } : {}),
        ...(check.severity ? { severity: check.severity } : {}),
        ...(check.file ? { file: check.file } : {}),
      })),
    });
    if (summary.recentValidationFailures.length > 5) {
      summary.recentValidationFailures.shift();
    }
  }

  recordValidationPass(
    executionId: string,
    stepName: string,
    validationResult: ValidationResult
  ): void {
    const summary = this.ensureSummary(executionId);
    summary.validationPassed += 1;
    summary.lastValidationStep = stepName;
    summary.lastValidationSummary = validationResult.summary;
  }

  recordRepairStarted(executionId: string, stepName: string, attempt?: number): void {
    const summary = this.ensureSummary(executionId);
    summary.repairStarted += 1;
    summary.lastRepairStep = stepName;
    if (attempt !== undefined) summary.lastAttempt = attempt;
  }

  recordRepairCompleted(executionId: string, stepName: string, attempt?: number): void {
    const summary = this.ensureSummary(executionId);
    summary.repairCompleted += 1;
    summary.lastRepairStep = stepName;
    if (attempt !== undefined) summary.lastAttempt = attempt;
  }

  recordRepairNoProgress(
    executionId: string,
    reason: string,
    category: "no_progress" | "repeated_critical_issue" = "no_progress"
  ): void {
    const summary = this.ensureSummary(executionId);
    summary.repairNoProgress += 1;
    summary.lastNoProgressReason = reason;
    summary.lastStopCategory = category;
  }

  recordBackEdgeTriggered(executionId: string): void {
    const summary = this.ensureSummary(executionId);
    summary.backEdgeTriggered += 1;
  }

  recordBackEdgeExhausted(executionId: string, reason: string): void {
    const summary = this.ensureSummary(executionId);
    summary.backEdgeExhausted += 1;
    summary.lastExhaustReason = reason;
    summary.lastStopCategory ??= "exhausted";
  }
}

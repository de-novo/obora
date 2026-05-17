import type { AuditTrail } from "./AuditTrail.js";
import { createDiffReport, type ReExecutionDiffReport } from "./ReExecutionDiffReport.js";
import { type ReExecutionPlan, ReExecutionPlanner } from "./ReExecutionPlanner.js";
import type { AuditEvent } from "./types.js";

export interface ReExecutionOptions {
  executionId: string;
  mode: "full" | "from_checkpoint";
  checkpointStep?: string;
  detectNonDeterminism?: boolean;
  dryRun?: boolean;
  onStepComplete?: (stepName: string, result: StepReExecutionResult) => void | Promise<void>;
}

export interface StepReExecutionResult {
  stepName: string;
  status: "done" | "failed" | "skipped";
  output?: unknown;
  matchesOriginal?: boolean;
  diff?: string;
}

export interface ReExecutionResult {
  reExecutionId: string;
  originalExecutionId: string;
  workflowVersion?: string;
  snapshotRef?: string;
  plan: ReExecutionPlan;
  stepResults: StepReExecutionResult[];
  diffReport: ReExecutionDiffReport;
  success: boolean;
  completedAt: Date;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractLatestStepOutputs(events: AuditEvent[]): Map<string, unknown> {
  const outputs = new Map<string, unknown>();

  events.forEach((event) => {
    if (event.type !== "cell_end" || !isObject(event.data)) {
      return;
    }

    const stepName = event.data.stepName;
    if (typeof stepName !== "string" || stepName.length === 0) {
      return;
    }

    if ("output" in event.data) {
      outputs.set(stepName, event.data.output);
      return;
    }

    if ("metrics" in event.data) {
      outputs.set(stepName, event.data.metrics);
    }
  });

  return outputs;
}

function now(): Date {
  return new Date();
}

export class ReExecutionRuntime {
  constructor(
    private readonly auditTrail: AuditTrail,
    private readonly planner: ReExecutionPlanner
  ) {}

  async reexecute(options: ReExecutionOptions): Promise<ReExecutionResult> {
    const reExecutionId = `reexec-${crypto.randomUUID()}`;
    const originalEvents = await this.auditTrail.query({ executionId: options.executionId });

    const plan = await this.planner.createPlan(options.executionId, {
      mode: options.mode,
      checkpointStep: options.checkpointStep,
      detectNonDeterminism: options.detectNonDeterminism,
    });

    await this.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: reExecutionId,
      timestamp: now(),
      type: "reexecution_start",
      data: {
        originalExecutionId: options.executionId,
        reExecutionId,
        mode: plan.mode,
        plan,
        simulation: true,
        dryRun: options.dryRun ?? false,
      },
    });

    if (options.dryRun) {
      const diffReport: ReExecutionDiffReport = {
        executionId: plan.executionId,
        reExecutionId,
        plan,
        differences: [],
        summary: {
          total_steps: plan.stepsToRerun.length + plan.stepsToSkip.length,
          changed: 0,
          unchanged: 0,
          skipped: plan.stepsToSkip.length,
          new: 0,
          removed: 0,
        },
      };

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "reexecution_end",
        data: {
          reExecutionId,
          success: true,
          diffSummary: diffReport.summary,
          simulation: true,
          dryRun: true,
        },
      });

      return {
        reExecutionId,
        originalExecutionId: options.executionId,
        ...(plan.workflowVersion ? { workflowVersion: plan.workflowVersion } : {}),
        ...(plan.snapshotRef ? { snapshotRef: plan.snapshotRef } : {}),
        plan,
        stepResults: [],
        diffReport,
        success: true,
        completedAt: now(),
      };
    }

    await this.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: reExecutionId,
      timestamp: now(),
      type: "execution_start",
      data: {
        workflowName: plan.originalWorkflow,
        ...(plan.workflowVersion ? { workflowVersion: plan.workflowVersion } : {}),
        originalExecutionId: options.executionId,
        mode: "reexecution",
        simulation: true,
      },
    });

    if (plan.mode === "from_checkpoint") {
      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "snapshot_restore",
        data: {
          reason: "from_checkpoint",
          checkpointStep: plan.startFromStep,
          restoredState: plan.restoredState ?? {},
          ...(plan.snapshotRef ? { snapshotRef: plan.snapshotRef } : {}),
          simulation: true,
        },
      });
    }

    const originalOutputs = extractLatestStepOutputs(originalEvents);

    const skippedStepResults = await plan.stepsToSkip.reduce<Promise<StepReExecutionResult[]>>(
      async (previousResults, stepName) => {
        const results = await previousResults;
      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "reexecution_step_start",
        data: { stepName, mode: "skip", simulation: true },
      });

      const result: StepReExecutionResult = {
        stepName,
        status: "skipped",
        matchesOriginal: true,
      };

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "reexecution_step_end",
        data: { stepName, matchesOriginal: true, simulation: true },
      });

      if (options.onStepComplete) {
        await options.onStepComplete(stepName, result);
      }
        return [...results, result];
      },
      Promise.resolve([])
    );

    const stepResults = await plan.stepsToRerun.reduce<Promise<StepReExecutionResult[]>>(
      async (previousResults, stepName) => {
        const results = await previousResults;
      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "reexecution_step_start",
        data: { stepName, mode: "rerun", simulation: true },
      });

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "step_start",
        data: { stepName, agent: "reexecution-simulator" },
      });

      const originalOutput = originalOutputs.get(stepName);

      if (originalOutput === undefined) {
        const failed: StepReExecutionResult = {
          stepName,
          status: "failed",
          matchesOriginal: false,
          diff: "No original step output found in audit trail.",
        };

        await this.auditTrail.record({
          id: crypto.randomUUID(),
          executionId: reExecutionId,
          timestamp: now(),
          type: "step_end",
          data: { stepName, status: "failed", simulation: true },
        });

        await this.auditTrail.record({
          id: crypto.randomUUID(),
          executionId: reExecutionId,
          timestamp: now(),
          type: "reexecution_step_end",
          data: {
            stepName,
            matchesOriginal: false,
            diff: failed.diff,
            simulation: true,
          },
        });

        if (options.onStepComplete) {
          await options.onStepComplete(stepName, failed);
        }

        return [...results, failed];
      }

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "cell_end",
        data: {
          stepName,
          output: originalOutput,
          simulation: {
            type: "audit_log_replay",
            liveExecution: false,
            originalExecutionId: options.executionId,
          },
        },
      });

      // Simulation mode: replaying original output, matchesOriginal is always true by definition
      const matchesOriginal = true;
      const completed: StepReExecutionResult = {
        stepName,
        status: "done",
        output: originalOutput,
        matchesOriginal,
      };

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "step_end",
        data: { stepName, status: "done", simulation: true },
      });

      await this.auditTrail.record({
        id: crypto.randomUUID(),
        executionId: reExecutionId,
        timestamp: now(),
        type: "reexecution_step_end",
        data: {
          stepName,
          matchesOriginal,
          simulation: true,
        },
      });

      if (options.onStepComplete) {
        await options.onStepComplete(stepName, completed);
      }
        return [...results, completed];
      },
      Promise.resolve(skippedStepResults)
    );

    await this.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: reExecutionId,
      timestamp: now(),
      type: "execution_end",
      data: {
        status: stepResults.some((result) => result.status === "failed") ? "failed" : "done",
        simulation: true,
      },
    });

    const reExecutionEvents = await this.auditTrail.query({ executionId: reExecutionId });
    const diffReport = createDiffReport(plan, originalEvents, reExecutionEvents);
    const success =
      !stepResults.some((result) => result.status === "failed") &&
      diffReport.summary.changed === 0 &&
      diffReport.summary.new === 0 &&
      diffReport.summary.removed === 0;

    await this.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: reExecutionId,
      timestamp: now(),
      type: "reexecution_diff",
      data: {
        reExecutionId,
        originalExecutionId: options.executionId,
        diffReport,
        simulation: true,
      },
    });

    await this.auditTrail.record({
      id: crypto.randomUUID(),
      executionId: reExecutionId,
      timestamp: now(),
      type: "reexecution_end",
      data: {
        reExecutionId,
        success,
        diffSummary: diffReport.summary,
        simulation: true,
      },
    });

    return {
      reExecutionId,
      originalExecutionId: options.executionId,
      ...(plan.workflowVersion ? { workflowVersion: plan.workflowVersion } : {}),
      ...(plan.snapshotRef ? { snapshotRef: plan.snapshotRef } : {}),
      plan,
      stepResults,
      diffReport,
      success,
      completedAt: now(),
    };
  }
}

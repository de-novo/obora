export interface ReExecutionOptions {
  executionId: string;
  mode: "full" | "from_checkpoint";
  startFromStep?: string;
  detectNonDeterminism?: boolean;
  dryRun?: boolean;
  onStepComplete?: (stepName: string, result: StepReExecutionResult) => void | Promise<void>;
}

export interface StepReExecutionResult {
  stepName: string;
  status: "completed" | "failed" | "skipped";
  output?: unknown;
  matchesOriginal?: boolean;
  diff?: string;
}

export interface NonDeterminismWarning {
  type: "model_change" | "time_drift" | "policy_change" | "state_external" | "tool_output";
  description: string;
  stepName?: string;
  severity: "info" | "warning" | "critical";
}

export interface ReExecutionResult {
  reExecutionId: string;
  originalExecutionId: string;
  plan: ReExecutionPlan;
  stepResults: StepReExecutionResult[];
  diffReport: ReExecutionDiffReport;
  success: boolean;
  completedAt: Date;
}

export interface ReExecutionPlan {
  executionId: string;
  originalWorkflow: string;
  mode: "full" | "from_checkpoint";
  startFromStep?: string;
  restoredState?: Record<string, unknown>;
  stepsToRerun: string[];
  stepsToSkip: string[];
  nonDeterminismWarnings: NonDeterminismWarning[];
  createdAt: Date;
}

export interface ReExecutionDiffReport {
  executionId: string;
  reExecutionId?: string;
  plan: ReExecutionPlan;
  differences: StepDiff[];
  summary: {
    total_steps: number;
    changed: number;
    unchanged: number;
    skipped: number;
  };
}

export interface StepDiff {
  stepName: string;
  status: "unchanged" | "changed" | "new" | "removed" | "skipped";
  originalOutput?: unknown;
  reExecutionOutput?: unknown;
  diffDetails?: string;
}

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
  status: "completed" | "failed" | "skipped";
  output?: unknown;
  matchesOriginal?: boolean;
  diff?: string;
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
  stepsToRerun: string[];
  stepsToSkip: string[];
  checkpointStep?: string;
  estimatedDuration?: number;
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

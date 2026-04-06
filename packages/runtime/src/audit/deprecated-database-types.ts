export interface Project {
  id?: number;
  name: string;
  path: string;
  created_at?: string;
  updated_at?: string;
}

export interface WorkflowRun {
  id?: number;
  project_id: number;
  feature: string;
  workflow: string;
  mode: "auto" | "supervised" | "gated";
  status: "pending" | "running" | "paused" | "completed" | "failed" | "cancelled";
  current_step?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

export interface StepExecution {
  id?: number;
  run_id: number;
  step_name: string;
  step_index: number;
  agent: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  retry_count?: number;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  output_path?: string;
}

export interface Metric {
  id?: number;
  run_id: number;
  step_id?: number;
  metric_name: string;
  metric_value: number;
  recorded_at?: string;
}

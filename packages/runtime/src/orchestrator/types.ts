import type { Step, Workflow } from "@obora/core";
import type { CellResult } from "../cell/types.js";
import type { PolicyDecision } from "../policy/types.js";

export type ExecutionStatus = "running" | "completed" | "failed" | "waiting" | "suspended";
export type ExecutionStepStatus = "pending" | "running" | "completed" | "failed" | "waiting";

export interface StepExecutionRecord {
  stepName: string;
  status: ExecutionStepStatus;
  startedAt?: Date;
  endedAt?: Date;
  policyDecision?: PolicyDecision;
  result?: CellResult;
  error?: string;
}

export interface Execution {
  id: string;
  workflowName: string;
  status: ExecutionStatus;
  input: unknown;
  startedAt: Date;
  endedAt?: Date;
  stepOrder: string[];
  completedSteps: string[];
  stepRecords: Record<string, StepExecutionRecord>;
  outputs: Record<string, unknown>;
  error?: string;
}

export interface ExecutionFilter {
  status?: ExecutionStatus;
  workflowName?: string;
}

export interface RuntimeOrchestrator {
  define(name: string, workflow: Workflow | string): void;
  run(name: string, input: unknown): Promise<Execution>;
  getExecution(id: string): Execution;
  listExecutions(filter?: ExecutionFilter): Execution[];
}

export interface RuntimeOrchestratorOptions {
  createExecutionId?: () => string;
  now?: () => Date;
  onGate?: (execution: Execution, step: Step, decision: Extract<PolicyDecision, { type: "gate" }>) => Promise<"approved" | "rejected"> | "approved" | "rejected";
}

export * from "../_legacy/cli-runtime/runtime/types.js";

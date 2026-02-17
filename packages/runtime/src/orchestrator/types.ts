import type { Step, Workflow } from "../_legacy/workflow/index.js";
import type { CellResult } from "../cell/types.js";
import type { ConsensusConfig, ConsensusVoteInput, GateConsensusResult } from "../consensus/ConsensusGate.js";
import type { PolicyDecision } from "../policy/types.js";
import type { RecoveryResult, RecoveryStrategy } from "../recovery/types.js";

export type ExecutionStatus = "running" | "completed" | "failed" | "waiting" | "suspended";
export type ExecutionStepStatus = "pending" | "running" | "completed" | "failed" | "waiting" | "skipped";

export interface GateWaitState {
  executionId: string;
  stepName: string;
  gateType: "human-approval" | "consensus" | "external";
  status: "waiting" | "approved" | "rejected" | "timeout";
  createdAt: Date;
  timeout?: string;
  fallback?: "fail" | "escalate" | "auto-approve";
  persisted: true;
}

export interface GateWaitStateStore {
  save(state: GateWaitState): Promise<void>;
  get(executionId: string): Promise<GateWaitState | undefined>;
  delete(executionId: string): Promise<void>;
}

export interface StepExecutionRecord {
  stepName: string;
  status: ExecutionStepStatus;
  startedAt?: Date;
  endedAt?: Date;
  policyDecision?: PolicyDecision;
  result?: CellResult;
  error?: string;
  recovery?: RecoveryResult;
  consensus?: GateConsensusResult;
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
  waitingGate?: GateWaitState;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionFilter {
  status?: ExecutionStatus;
  workflowName?: string;
}

export interface ResumeResult {
  execution: Execution;
  restoredSteps: string[];
  rerunSteps: string[];
  driftDetected: boolean;
}

export interface RuntimeOrchestrator {
  define(name: string, workflow: Workflow | string): void;
  run(name: string, input: unknown): Promise<Execution>;
  resume(runId: string, options?: import("../storage/types.js").ResumeOptions): Promise<ResumeResult>;
  approve(executionId: string): Promise<Execution>;
  reject(executionId: string, reason?: string): Promise<Execution>;
  onGateTimeout(executionId: string): Promise<Execution>;
  getExecution(id: string): Execution;
  listExecutions(filter?: ExecutionFilter): Execution[];
}

export interface RuntimeOrchestratorOptions {
  createExecutionId?: () => string;
  now?: () => Date;
  onGate?: (execution: Execution, step: Step, decision: Extract<PolicyDecision, { type: "gate" }>) => Promise<"approved" | "rejected"> | "approved" | "rejected";
  consensusVoteProvider?: (step: Step, execution: Execution, config: ConsensusConfig) => Promise<ConsensusVoteInput[]> | ConsensusVoteInput[];
  defaultRecoveryStrategy?: RecoveryStrategy;
}

export * from "../_legacy/cli-runtime/runtime/types.js";

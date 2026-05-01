export type AuditEventType = string;

export interface AuditEvent {
  id: string;
  executionId: string;
  cellId?: string;
  timestamp: Date;
  type: AuditEventType;
  data: unknown;
  metadata?: {
    model?: string;
    tokens?: number;
    durationMs?: number;
    costUsd?: number;
  };
}

export interface AuditFilter {
  executionId?: string;
  cellId?: string;
  type?: AuditEventType | AuditEventType[];
  from?: Date;
  to?: Date;
  limit?: number;
}

export interface RunRecord {
  id: string;
  workflowName: string;
  status: "running" | "completed" | "failed" | "suspended" | "aborted";
  input: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface StepRecord {
  id: string;
  runId: string;
  stepName: string;
  status: "running" | "completed" | "failed" | "skipped";
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: { code: string; message: string; stack?: string };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
}

export interface ArtifactRecord {
  id: string;
  runId: string;
  stepName: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  storageRef: string;
  createdAt: string;
  deletedAt?: string;
}

export interface RunFilter {
  status?: RunRecord["status"];
  workflowName?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface CheckpointRecord {
  id: string;
  runId: string;
  stepName: string;
  stateSnapshot: unknown;
  completedSteps: string[];
  policyHash: string;
  createdAt: string;
}

export interface CostRecord {
  id: string;
  runId: string;
  stepName: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  latencyMs: number;
  createdAt: string;
}

export interface CostSummary {
  totalTokens: number;
  totalCostUsd: number;
  byStep: Array<{ stepName: string; tokens: number; costUsd: number }>;
  byModel: Array<{ model: string; tokens: number; costUsd: number }>;
}

export interface StructuredAuditEvent {
  id: string;
  runId: string;
  stepName: string;
  timestamp: string;
  category: "consensus" | "policy" | "execution" | "recovery";
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  vote?: {
    decision: "approve" | "reject" | "abstain";
    confidence?: number;
    reasoning?: string;
  };
}

export interface StorageAdapter {
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;
  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;
  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  deleteArtifact(artifactId: string): Promise<void>;
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;
  saveCost(record: CostRecord): Promise<void>;
  getCosts(runId: string, stepName?: string): Promise<CostRecord[]>;
  getRunCostSummary(runId: string): Promise<CostSummary>;
  saveAuditEvent(event: StructuredAuditEvent): Promise<void>;
  getAuditTimeline(runId: string, stepName?: string): Promise<StructuredAuditEvent[]>;
}

export interface ArtifactStore {
  save(
    runId: string,
    stepName: string,
    name: string,
    data: Buffer,
    mime: string,
  ): Promise<ArtifactRecord>;
  get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }>;
  list(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  delete(artifactId: string): Promise<void>;
}

export interface PolicyHashInput {
  [key: string]: unknown;
}

export class SQLiteStorageAdapter implements StorageAdapter {
  constructor(config: { path: string });
  saveRun(record: RunRecord): Promise<void>;
  getRun(runId: string): Promise<RunRecord | null>;
  listRuns(filter: RunFilter): Promise<RunRecord[]>;
  saveStep(record: StepRecord): Promise<void>;
  getSteps(runId: string): Promise<StepRecord[]>;
  saveArtifact(record: ArtifactRecord): Promise<ArtifactRecord>;
  getArtifacts(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  deleteArtifact(artifactId: string): Promise<void>;
  saveCheckpoint(record: CheckpointRecord): Promise<void>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;
  saveCost(record: CostRecord): Promise<void>;
  getCosts(runId: string, stepName?: string): Promise<CostRecord[]>;
  getRunCostSummary(runId: string): Promise<CostSummary>;
  saveAuditEvent(event: StructuredAuditEvent): Promise<void>;
  getAuditTimeline(runId: string, stepName?: string): Promise<StructuredAuditEvent[]>;
}

export class InMemoryStorageAdapter extends SQLiteStorageAdapter {
  constructor();
}

export class LocalFileArtifactStore implements ArtifactStore {
  constructor(config: { basePath: string });
  save(
    runId: string,
    stepName: string,
    name: string,
    data: Buffer,
    mime: string,
  ): Promise<ArtifactRecord>;
  get(artifactId: string): Promise<{ record: ArtifactRecord; data: Buffer }>;
  list(runId: string, stepName?: string): Promise<ArtifactRecord[]>;
  delete(ref: string): Promise<void>;
}

export class CheckpointManager {
  constructor(adapter: StorageAdapter);
  saveCheckpoint(
    runId: string,
    stepName: string,
    completedSteps: string[],
    stateSnapshot: unknown,
    policyConfig: PolicyHashInput,
  ): Promise<CheckpointRecord>;
  getLatestCheckpoint(runId: string): Promise<CheckpointRecord | null>;
  detectDrift(
    checkpoint: CheckpointRecord,
    policy: PolicyHashInput,
  ): { drifted: boolean; oldHash: string; newHash: string };
  resolveStepPolicies(
    savedSteps: StepRecord[],
    completedSteps: string[],
    allStepNames: string[],
    options: { fromStep?: string; driftPolicy?: "reject" | "warn" | "ignore" },
  ): Array<{ stepName: string; action: "restore" | "rerun" | "skip"; output?: unknown }>;
}

export type AgentId = string & { readonly __brand: "AgentId" };
export type SessionId = string & { readonly __brand: "SessionId" };

export function createAgentId(value: string): AgentId;
export function createSessionId(value: string): SessionId;

export class BoardBlackboard {
  readonly sessionId: SessionId;
  readonly version: number;
  readonly state: unknown;
  readonly knowledge: {
    addFact(input: unknown): unknown;
    addInference(input: unknown): unknown;
    addPattern(input: unknown): unknown;
    findFacts(input?: unknown): Array<{ content: string; tags: string[]; [key: string]: unknown }>;
    [key: string]: unknown;
  };
  readonly decisions: unknown;
  constructor(options: { sessionId: SessionId });
  write(path: string, value: unknown): void;
  read(path: string, options?: { strict?: boolean }): unknown;
  on(eventName: string, handler: (...args: unknown[]) => void): () => void;
  createSnapshot(): unknown;
}

export const AgentRole: {
  readonly ANALYST: "analyst";
  readonly EXECUTOR: "executor";
  readonly VERIFIER: "verifier";
  readonly DIRECTOR: "director";
};
export type AgentRole = (typeof AgentRole)[keyof typeof AgentRole];

export interface AgentContext {
  sessionId: string;
  board: {
    read<T = unknown>(path: string, options?: { strict?: boolean }): T;
    write?(path: string, value: unknown): void;
  };
  currentTask?: Task;
  history: unknown[];
  signal?: AbortSignal;
}

export interface Task {
  id: string;
  type: string;
  description: string;
  input?: unknown;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface TaskResult {
  success: boolean;
  taskId: string;
  output: unknown;
  error?: Error;
  duration: number;
  tokensUsed: {
    prompt: number;
    completion: number;
    total: number;
  };
}

export interface BaseAgent {
  readonly id: string;
  readonly role: AgentRole;
  execute(task: Task, context: AgentContext): Promise<TaskResult>;
  subscribe?(listener: (event: unknown) => void): () => void;
  continue?(): Promise<void>;
  configureRuntimeExtensions?(input: { tools?: unknown[]; systemPromptAppend?: string }): void;
  clearRuntimeExtensions?(): void;
}

export function createAgent(config: {
  id: string;
  role: AgentRole;
  llm: unknown;
  toolRegistry?: unknown;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  enablePiRuntime?: boolean;
}): BaseAgent;

export interface Step {
  name: string;
  agent: string;
  description?: string;
  inputs?: string[];
  outputs?: string[];
  timeout?: string;
  skills?: string[];
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface Workflow {
  name: string;
  version?: string;
  steps: Step[];
  [key: string]: unknown;
}

export type ErrorCode = string;

export class OboraError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;
  constructor(code: ErrorCode, message?: string, details?: Record<string, unknown>);
}

export interface ValidationError {
  code: string;
  message: string;
  path?: string;
  suggestion?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export function parseAndValidate(content: string): ValidationResult;
export const ValidationErrorCode: Record<string, string>;

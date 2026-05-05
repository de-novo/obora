export class OboraError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  constructor(code: string, message?: string, details?: Record<string, unknown>);
}

export const OboraErrorCode: Record<string, string>;

export interface WorkflowStep {
  name: string;
  agent: string;
  description?: string;
  depends_on?: string[];
  inputs?: string[];
  outputs?: string[];
  timeout?: string;
  skills?: string[];
  config?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface WorkflowDef {
  name: string;
  version?: string;
  agents?: Record<string, unknown>;
  steps: WorkflowStep[];
  [key: string]: unknown;
}

export class Workflow {
  readonly name: string;
  readonly version?: string;
  readonly steps: WorkflowStep[];
  constructor(definition: WorkflowDef);
  static create(definition: unknown): Workflow;
  static fromYaml(path: string): Promise<any>;
  static getStopSemantics(workflow: unknown): any;
  toJSON(): WorkflowDef;
}

export class Policy {
  static create(definition: unknown): Policy;
  static fromYaml(path: string): Promise<Policy>;
}

export interface OboraConfig {
  defaults?: any;
  agents?: Record<string, any>;
  providers?: any;
  persistence?: any;
  artifacts?: any;
  dlq?: { filePath?: string };
  [key: string]: any;
}

export interface ResolvedProviderConfig {
  provider: string;
  model?: string;
  [key: string]: unknown;
}

export interface ModelPricing {
  model: string;
  prompt?: number;
  completion?: number;
  [key: string]: unknown;
}

export function loadConfig(path?: string): Promise<OboraConfig>;
export function resolveProviderConfig(config: OboraConfig, provider?: string): any;

export interface ResolutionSummary {
  provider: string | null;
  model: string | null;
  authSource: string;
  configSource: string;
  modelSource: string;
  chosenByPrecedence: string;
  nextPlaceToEdit: string;
  fallbackStub: boolean;
  warnings: string[];
}

export function detectLLMConfigFromEnv(...args: unknown[]): any;
export function resolveLLMConfig(...args: unknown[]): any;
export function buildResolutionSummary(...args: unknown[]): ResolutionSummary;
export function formatResolutionSummary(summary: ResolutionSummary): string;
export function buildBindingPreview(...args: unknown[]): unknown[];
export function formatBindingPreview(preview: unknown[]): string;
export function buildOutputPreview(...args: unknown[]): unknown[];
export function formatOutputPreview(preview: unknown[]): string;

export class OboraRuntime {
  constructor(config?: unknown);
  static fromConfig(config?: unknown): Promise<OboraRuntime>;
  define(...args: unknown[]): any;
  on(eventName: string, listener: (event: any) => void): () => void;
  run(...args: unknown[]): Promise<any>;
  loadWorkflow(...args: unknown[]): Promise<any>;
  resume(...args: unknown[]): Promise<any>;
  listRunRecords(...args: unknown[]): Promise<any[]>;
  getRunRecord(...args: unknown[]): Promise<any>;
  getRunSteps(...args: unknown[]): Promise<any[]>;
  getRunArtifacts(...args: unknown[]): Promise<any[]>;
  getRunCostSummary(...args: unknown[]): Promise<any>;
  getRunAuditTimeline(...args: unknown[]): Promise<any[]>;
  getArtifact(...args: unknown[]): Promise<any>;
  getArtifacts(...args: unknown[]): Promise<any[]>;
  getAuditTimeline(...args: unknown[]): Promise<any[]>;
}

export interface ExecutionAgentInventoryEntry {
  name: string;
  sources: {
    config: boolean;
    agentsPath: boolean;
    workflow: boolean;
    runtime: boolean;
  };
}

export type ExecutionAgentSourceKind = "agents-path" | "workflow-agents" | "runtime-registration";

export interface ExecutionAgentSource {
  kind: ExecutionAgentSourceKind;
  label: string;
  agentNames: string[];
  notes?: string[];
}

export interface ExecutionAgentSnapshot {
  base: import("@obora/adapters").AgentResolutionSnapshot;
  executionSources: ExecutionAgentSource[];
  effectiveExecutionView: {
    agentName: string;
    hasAgentsPathEntry: boolean;
    hasWorkflowAgentEntry: boolean;
    hasRuntimeRegistration: boolean;
  };
}

export function buildExecutionAgentInventory(input: {
  cwd: string;
  agentsPath?: string;
  workflow?: WorkflowDef;
  runtimeAgents: Map<string, unknown>;
}): Promise<ExecutionAgentInventoryEntry[]>;

export function buildExecutionAgentSnapshot(input: {
  cwd: string;
  agentName: string;
  agentsPath?: string;
  workflow?: WorkflowDef;
  runtimeAgents: Map<string, unknown>;
}): Promise<ExecutionAgentSnapshot>;

export class PluginLoader {
  constructor(...args: unknown[]);
  scan(...args: unknown[]): Promise<any[]>;
}

export class PluginManager {
  constructor(...args: unknown[]);
  loadAndRegister(...args: unknown[]): Promise<any>;
}

export interface DLQEntry {
  id: string;
  workflowName: string;
  status: string;
  reason?: string;
  createdAt: string;
  updatedAt?: string;
  repairAttempts: number;
  [key: string]: any;
}

export interface DLQSnapshot {
  entries: DLQEntry[];
  lastUpdated: string;
  [key: string]: any;
}

export class FileDLQStore {
  readonly filePath: string;
  constructor(filePath?: string);
  load(...args: unknown[]): Promise<DLQSnapshot>;
  save(snapshot: DLQSnapshot): Promise<void>;
}

export function summarizeDLQ(...args: unknown[]): any;
export function resolveDLQEntry(...args: unknown[]): DLQSnapshot;

export function configureKnowledgeProvider(...args: unknown[]): void;
export function queryKnowledge(...args: unknown[]): Promise<any>;
export function parseKnowledgeSchema(...args: unknown[]): any;

export class CostTracker {
  constructor(...args: unknown[]);
}

export class BudgetExceededError extends Error {}

export interface StepContext {
  [key: string]: unknown;
}
export interface StepExecutorConfig {
  [key: string]: unknown;
}
export interface LLMAdapterLike {
  [key: string]: unknown;
}
export interface ToolHandler {
  definition: unknown;
  handler: (...args: unknown[]) => unknown | Promise<unknown>;
}
export type StepToolHandler = ToolHandler;

export class StepExecutor {
  constructor(...args: unknown[]);
}

export const BUILTIN_TOOLS: Record<string, unknown>;

export type OneFileStopSemantics = Record<string, unknown>;
export type ValidationResult = Record<string, unknown>;

export function fixtureToTestCase(...args: unknown[]): any;
export function loadFixture(...args: unknown[]): any;
export function loadFixtures(...args: unknown[]): any[];
export function runWorkflowTest(...args: unknown[]): Promise<any>;

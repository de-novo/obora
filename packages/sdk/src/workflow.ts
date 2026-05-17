import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { OboraError, OboraErrorCode } from "./runtime-errors.js";
import type { RepairLoopConfig, ValidationStepConfig } from "./validation-repair.js";
import { expandOneFileWorkflow, getOneFileStopSemantics } from "./one-file-modes.js";
import type { OneFileStopSemantics } from "./one-file-modes.js";
import { validateRoutes } from "./conditional-routing.js";
import type { MemoryScopeLevel } from "./shared-memory/store.js";
import type { TKGConfidenceConflictMode, TKGPromotionTrigger, TKGPromotionEvaluationMode } from "./runtime-types.js";
import type { ProjectableTKGEventType } from "./tkg/store.js";

export interface HookDefinition {
  shell: string;
}

export interface WorkflowHooks {
  pre_step?: HookDefinition;
  post_step?: HookDefinition;
  pre_validation?: HookDefinition;
  post_cycle?: HookDefinition;
}

const WORKFLOW_HOOK_KEYS = ["pre_step", "post_step", "pre_validation", "post_cycle"] as const;

export interface ExecutionTraceConfig {
  /** Whether to generate execution traces for this workflow/step. Default: true. */
  enabled?: boolean;
  /** Trace validation behavior. Default: "strict". */
  validation?: "strict" | "warn" | "off";
  /** Enrichment mode for subjective fields. Default: "none". */
  enrichment?: "none" | "heuristic" | "llm";
  /** Maximum number of upstream traces to inject into context. Default: 3. */
  maxHistorySteps?: number;
}

export interface WorkflowStepConfig extends Record<string, unknown> {
  validation?: ValidationStepConfig;
  repair_loop?: RepairLoopConfig;
  /** Per-step execution trace overrides. */
  execution_traces?: ExecutionTraceConfig;
}

export interface WorkflowStepOutput {
  path?: string;
  schema?: string;
}

import type { OnFailRoute } from "./conditional-routing.js";

export type { OnFailRoute } from "./conditional-routing.js";

export type GotoTarget = string | OnFailRoute[];

export interface ParallelBranch {
  agent: string;
  prompt_file?: string;
  input?: Record<string, unknown>;
}

export type MergeStrategy = "concat" | "best_score" | "consensus" | "first_success";

export interface WorkflowStep<TInput extends Record<string, unknown> = Record<string, unknown>> {
  name: string;
  description?: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  participants?: string[];
  input?: TInput;
  output?: WorkflowStepOutput;
  config?: WorkflowStepConfig;
  hooks?: WorkflowHooks;
  depends_on?: string[];
  gate?: string | { type: string; [key: string]: unknown };
  /** Explicit parallel branches for fan-out-fan-in within this step. */
  parallel?: ParallelBranch[];
  /** Merge strategy for parallel branch results. Default: 'concat'. */
  merge?: MergeStrategy;
  on_fail?: {
    goto: GotoTarget;
    max_iterations: number;
    escalate_on_exhaust?: "human" | "dlq" | "fail";
    cooldown_ms?: number;
    reset_state?: boolean;
    max_cost?: number | null;
    max_cost_escalation?: "human" | "dlq" | "fail" | null;
  };
}

/** Reflector v2 configuration for the workflow. */
export interface WorkflowReflectorConfig {
  /** Path to persistent knowledge store directory. */
  knowledge_store?: string;
  /** Reflector analyzer configuration. */
  analyzers?: Array<{ builtin?: string; custom?: string }>;
  /** Reflector rules: condition → actions mapping. */
  rules?: Array<{
    name: string;
    when: {
      keywords_include?: string[];
      keywords_exclude?: string[];
      trend?: "worsening" | "stable" | "improving";
      min_failures?: number;
      max_failures?: number;
      signature_repeated?: number;
      category_includes?: string[];
      min_attempt?: number;
    };
    actions: Array<{
      type: string;
      [key: string]: unknown;
    }>;
  }>;
}

export interface WorkflowSharedMemoryConfig {
  enabled?: boolean;
  projectKey?: string;
  scopes?: MemoryScopeLevel[];
}

export interface WorkflowTKGProjectionConfig {
  enabled?: boolean;
  projectKey?: string;
  scopes?: MemoryScopeLevel[];
  promotion?: {
    enabled?: boolean;
    minConfidence?: number;
    confidenceSpreadThreshold?: number;
    confidenceConflictMode?: TKGConfidenceConflictMode;
    allowedEventTypes?: ProjectableTKGEventType[];
    applyScopes?: MemoryScopeLevel[];
    triggers?: TKGPromotionTrigger[];
    evaluationMode?: TKGPromotionEvaluationMode;
  };
  rollback?: {
    enabled?: boolean;
  };
  reviewQueue?: {
    enabled?: boolean;
  };
}

export interface WorkflowDef<
  TVariables extends Record<string, unknown> = Record<string, unknown>,
  TAgents extends Record<string, unknown> = Record<string, unknown>,
  TStep extends WorkflowStep = WorkflowStep,
> {
  name: string;
  version?: string;
  description?: string;
  steps: TStep[];
  hooks?: WorkflowHooks;
  variables?: TVariables;
  /** Optional workflow-local agent definitions. */
  agents?: TAgents;
  /** Maximum number of steps to execute concurrently. Default: 3. */
  maxConcurrency?: number;
  /** Reflector v2 configuration. */
  reflector?: WorkflowReflectorConfig;
  /** Shared memory import/export overrides for this workflow. */
  sharedMemory?: WorkflowSharedMemoryConfig;
  /** TKG staging projection overrides for this workflow. */
  tkgProjection?: WorkflowTKGProjectionConfig;
  /** Execution trace configuration for this workflow. */
  executionTraces?: ExecutionTraceConfig;
}

export interface OnFailConfig {
  goto: GotoTarget;
  maxIterations: number;
  escalateOnExhaust?: "human" | "dlq" | "fail";
  cooldownMs?: number;
  resetState?: boolean;
  maxCost?: number | null;
  maxCostEscalation?: "human" | "dlq" | "fail" | null;
}

export interface AddStepOptions<TInput extends Record<string, unknown> = Record<string, unknown>> {
  id: string;
  description?: string;
  actor?: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  participants?: string[];
  input?: TInput;
  output?: WorkflowStepOutput;
  config?: WorkflowStepConfig;
  hooks?: WorkflowHooks;
  depends?: string[];
  dependsOn?: string[];
  gate?: string | { type: string; [key: string]: unknown };
  onFail?: OnFailConfig;
}

export class Workflow {
  private readonly def: WorkflowDef;

  constructor(name: string, version?: string) {
    this.def = { name, version, steps: [] };
  }

  addStep(options: AddStepOptions): this {
    const onFail = options.onFail
      ? {
          goto: options.onFail.goto,
          max_iterations: options.onFail.maxIterations,
          escalate_on_exhaust: options.onFail.escalateOnExhaust,
          cooldown_ms: options.onFail.cooldownMs,
          reset_state: options.onFail.resetState,
          max_cost: options.onFail.maxCost,
          max_cost_escalation: options.onFail.maxCostEscalation ?? null,
        }
      : undefined;

    const step: WorkflowStep = {
      name: options.id,
      description: options.description,
      agent: options.agent ?? options.actor,
      tool: options.tool,
      pattern: options.pattern,
      participants: options.participants,
      input: options.input,
      output: undefined,
      config: options.config,
      hooks: options.hooks,
      depends_on: options.dependsOn ?? options.depends,
      gate: options.gate,
      on_fail: onFail,
    };

    this.def.steps.push(step);
    return this;
  }

  toDefinition(): WorkflowDef {
    return Workflow.create(this.def);
  }

  static async fromYaml(path: string): Promise<WorkflowDef> {
    const content = await readFile(path, "utf-8");
    const parsed = parseYaml(content);
    return Workflow.create(parsed);
  }

  static getStopSemantics(input: unknown): OneFileStopSemantics | undefined {
    return getOneFileStopSemantics(input);
  }

  static create(input: unknown): WorkflowDef {
    if (!input || typeof input !== "object") {
      throw OboraError.invalidWorkflow("Invalid workflow definition");
    }

    const compiled = Workflow.expandOneFileMode(input);
    const def = compiled as Record<string, unknown>;
    if (!def.name || typeof def.name !== "string") {
      throw OboraError.invalidWorkflow("Workflow must have a name");
    }

    if (!Array.isArray(def.steps)) {
      throw OboraError.invalidWorkflow("Workflow must have steps array");
    }

    Workflow.validateHooks(def.hooks, "workflow");

    const steps = def.steps as unknown[];
    const seenStepNames = steps.reduce<Set<string>>((seen, step) => {
      if (!step || typeof step !== "object") {
        throw OboraError.invalidWorkflow("Each workflow step must be an object");
      }
      const s = step as Record<string, unknown>;
      if (!s.name || typeof s.name !== "string") {
        throw OboraError.invalidWorkflow("Each workflow step must have a string name");
      }

      Workflow.validateHooks(s.hooks, `step '${s.name}'`);

      if (seen.has(s.name)) {
        throw OboraError.invalidWorkflow(`Duplicate workflow step name: ${s.name}`);
      }
      seen.add(s.name);
      return seen;
    }, new Set<string>());

    steps.forEach((step) => {
      const s = step as Record<string, unknown>;
      const onFail = s.on_fail as Record<string, unknown> | undefined;
      if (onFail?.goto !== undefined) {
        const routeError = validateRoutes(onFail.goto, seenStepNames, s.name as string);
        if (routeError) {
          throw OboraError.invalidWorkflow(routeError);
        }
      }
    });

    return compiled as WorkflowDef;
  }

  private static expandOneFileMode(input: unknown): unknown {
    return expandOneFileWorkflow(input) ?? input;
  }

  private static validateHooks(input: unknown, owner: string): void {
    if (input === undefined) {
      return;
    }

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw OboraError.invalidWorkflow(`${owner} hooks must be an object`);
    }

    const hooks = input as Record<string, unknown>;
    WORKFLOW_HOOK_KEYS.forEach((key) => {
      const hook = hooks[key];
      if (hook === undefined) {
        return;
      }
      if (
        !hook ||
        typeof hook !== "object" ||
        Array.isArray(hook) ||
        typeof (hook as Record<string, unknown>).shell !== "string"
      ) {
        throw OboraError.invalidWorkflow(`${owner} hook '${key}' must define a shell string`);
      }
    });
  }
}

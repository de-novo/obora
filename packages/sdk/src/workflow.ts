import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { OboraError, OboraErrorCode } from "./runtime.js";
import type { RepairLoopConfig, ValidationStepConfig } from "./validation-repair.js";
import { expandOneFileWorkflow, getOneFileStopSemantics } from "./one-file-modes.js";
import { validateRoutes } from "./conditional-routing.js";

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

export interface WorkflowStepConfig extends Record<string, unknown> {
  validation?: ValidationStepConfig;
  repair_loop?: RepairLoopConfig;
}

export interface OnFailRoute {
  when?: string;
  target: string;
}

export type GotoTarget = string | OnFailRoute[];

export interface ParallelBranch {
  agent: string;
  prompt_file?: string;
  input?: Record<string, unknown>;
}

export type MergeStrategy = "concat" | "best_score" | "consensus" | "first_success";

export interface WorkflowStep {
  name: string;
  description?: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  participants?: string[];
  input?: Record<string, unknown>;
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
  scopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
}

export interface WorkflowTKGProjectionConfig {
  enabled?: boolean;
  projectKey?: string;
  scopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
  promotion?: {
    enabled?: boolean;
    minConfidence?: number;
    confidenceSpreadThreshold?: number;
    allowedEventTypes?: import("./tkg/store.js").ProjectableTKGEventType[];
    applyScopes?: import("./shared-memory/store.js").MemoryScopeLevel[];
    triggers?: import("./runtime-types.js").TKGPromotionTrigger[];
  };
  rollback?: {
    enabled?: boolean;
  };
  reviewQueue?: {
    enabled?: boolean;
  };
}

export interface WorkflowDef {
  name: string;
  version?: string;
  steps: WorkflowStep[];
  hooks?: WorkflowHooks;
  variables?: Record<string, unknown>;
  /** Maximum number of steps to execute concurrently. Default: 3. */
  maxConcurrency?: number;
  /** Reflector v2 configuration. */
  reflector?: WorkflowReflectorConfig;
  /** Shared memory import/export overrides for this workflow. */
  sharedMemory?: WorkflowSharedMemoryConfig;
  /** TKG staging projection overrides for this workflow. */
  tkgProjection?: WorkflowTKGProjectionConfig;
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

export interface AddStepOptions {
  id: string;
  description?: string;
  actor?: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  participants?: string[];
  input?: Record<string, unknown>;
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

  static getStopSemantics(input: unknown): Record<string, unknown> | undefined {
    return getOneFileStopSemantics(input);
  }

  static create(input: unknown): WorkflowDef {
    if (!input || typeof input !== "object") {
      throw new OboraError("Invalid workflow definition", OboraErrorCode.SDK_INVALID_WORKFLOW);
    }

    const compiled = Workflow.expandOneFileMode(input);
    const def = compiled as Record<string, unknown>;
    if (!def.name || typeof def.name !== "string") {
      throw new OboraError("Workflow must have a name", OboraErrorCode.SDK_INVALID_WORKFLOW);
    }

    if (!Array.isArray(def.steps)) {
      throw new OboraError("Workflow must have steps array", OboraErrorCode.SDK_INVALID_WORKFLOW);
    }

    Workflow.validateHooks(def.hooks, "workflow");

    const steps = def.steps as unknown[];
    const seenStepNames = new Set<string>();
    for (const step of steps) {
      if (!step || typeof step !== "object") {
        throw new OboraError(
          "Each workflow step must be an object",
          OboraErrorCode.SDK_INVALID_WORKFLOW
        );
      }
      const s = step as Record<string, unknown>;
      if (!s.name || typeof s.name !== "string") {
        throw new OboraError(
          "Each workflow step must have a string name",
          OboraErrorCode.SDK_INVALID_WORKFLOW
        );
      }

      Workflow.validateHooks(s.hooks, `step '${s.name}'`);

      if (seenStepNames.has(s.name)) {
        throw new OboraError(
          `Duplicate workflow step name: ${s.name}`,
          OboraErrorCode.SDK_INVALID_WORKFLOW
        );
      }
      seenStepNames.add(s.name);
    }

    for (const step of steps) {
      const s = step as Record<string, unknown>;
      const onFail = s.on_fail as Record<string, unknown> | undefined;
      if (onFail?.goto !== undefined) {
        const routeError = validateRoutes(onFail.goto, seenStepNames, s.name as string);
        if (routeError) {
          throw new OboraError(routeError, OboraErrorCode.SDK_INVALID_WORKFLOW);
        }
      }
    }

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
      throw new OboraError(`${owner} hooks must be an object`, OboraErrorCode.SDK_INVALID_WORKFLOW);
    }

    const hooks = input as Record<string, unknown>;
    for (const key of WORKFLOW_HOOK_KEYS) {
      const hook = hooks[key];
      if (hook === undefined) {
        continue;
      }
      if (
        !hook ||
        typeof hook !== "object" ||
        Array.isArray(hook) ||
        typeof (hook as Record<string, unknown>).shell !== "string"
      ) {
        throw new OboraError(
          `${owner} hook '${key}' must define a shell string`,
          OboraErrorCode.SDK_INVALID_WORKFLOW
        );
      }
    }
  }
}

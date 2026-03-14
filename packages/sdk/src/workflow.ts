import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import { OboraError, OboraErrorCode } from "./runtime.js";
import type { RepairLoopConfig, ValidationStepConfig } from "./validation-repair.js";
import { expandOneFileWorkflow, getOneFileStopSemantics } from "./one-file-modes.js";

export interface WorkflowStepConfig extends Record<string, unknown> {
  validation?: ValidationStepConfig;
  repair_loop?: RepairLoopConfig;
}

export interface WorkflowStep {
  name: string;
  description?: string;
  agent?: string;
  tool?: string;
  pattern?: string;
  participants?: string[];
  input?: Record<string, unknown>;
  config?: WorkflowStepConfig;
  depends_on?: string[];
  gate?: string | { type: string; [key: string]: unknown };
  on_fail?: {
    goto: string;
    max_iterations: number;
    escalate_on_exhaust?: "human" | "dlq" | "fail";
    cooldown_ms?: number;
    reset_state?: boolean;
    max_cost?: number | null;
    max_cost_escalation?: "human" | "dlq" | "fail" | null;
  };
}

export interface WorkflowDef {
  name: string;
  version?: string;
  steps: WorkflowStep[];
  variables?: Record<string, unknown>;
}


export interface OnFailConfig {
  goto: string;
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

    const steps = def.steps as unknown[];
    const seenStepNames = new Set<string>();
    for (const step of steps) {
      if (!step || typeof step !== "object") {
        throw new OboraError("Each workflow step must be an object", OboraErrorCode.SDK_INVALID_WORKFLOW);
      }
      const s = step as Record<string, unknown>;
      if (!s.name || typeof s.name !== "string") {
        throw new OboraError("Each workflow step must have a string name", OboraErrorCode.SDK_INVALID_WORKFLOW);
      }

      if (seenStepNames.has(s.name)) {
        throw new OboraError(
          `Duplicate workflow step name: ${s.name}`,
          OboraErrorCode.SDK_INVALID_WORKFLOW,
        );
      }
      seenStepNames.add(s.name);
    }

    return compiled as WorkflowDef;
  }

  private static expandOneFileMode(input: unknown): unknown {
    return expandOneFileWorkflow(input) ?? input;
  }
}

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type { WorkflowDef, WorkflowStep, WorkflowStepOutput, WorkflowHooks, MergeStrategy } from "../workflow.js";
import { fileExists, readYamlFile, writeYamlFile } from "./yaml-utils.js";

export interface WorkflowListEntry {
  name: string;
  path: string;
  description?: string;
  stepCount: number;
}

export interface StepAddOptions {
  name: string;
  agent?: string;
  tool?: string;
  description?: string;
  dependsOn?: string[];
  pattern?: string;
  participants?: string[];
  input?: Record<string, unknown>;
  output?: WorkflowStepOutput;
  config?: Record<string, unknown>;
  hooks?: WorkflowHooks;
  gate?: string | { type: string; [key: string]: unknown };
  parallel?: Array<{ agent: string; promptFile?: string; input?: Record<string, unknown> }>;
  merge?: MergeStrategy;
  onFail?: {
    goto?: string | Array<{ when?: string; target: string }>;
    maxIterations: number;
    escalateOnExhaust?: "human" | "dlq" | "fail";
    cooldownMs?: number;
    resetState?: boolean;
    maxCost?: number | null;
    maxCostEscalation?: "human" | "dlq" | "fail" | null;
  };
}

export async function listWorkflows(workflowsDir: string): Promise<WorkflowListEntry[]> {
  if (!(await fileExists(workflowsDir))) {
    return [];
  }

  const { readdir } = await import("node:fs/promises");

  const scanDir = async (dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          return scanDir(path);
        }
        return entry.isFile() && entry.name.endsWith(".yaml") ? [path] : [];
      })
    );
    return nested.flat();
  };

  const files = await scanDir(workflowsDir);

  const entries = await Promise.all(
    files.map(async (file): Promise<WorkflowListEntry | undefined> => {
      const workflow = await readYamlFile<WorkflowDef>(file);
      if (!workflow) return undefined;
      return {
        name: workflow.name ?? file,
        path: file,
        description: workflow.description,
        stepCount: workflow.steps?.length ?? 0,
      };
    })
  );

  return entries.filter((e): e is WorkflowListEntry => e !== undefined);
}

export async function readWorkflow(path: string): Promise<WorkflowDef | undefined> {
  return readYamlFile<WorkflowDef>(path);
}

export async function createWorkflow(
  path: string,
  workflow: Partial<WorkflowDef>
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });

  const newWorkflow: WorkflowDef = {
    name: workflow.name ?? "untitled",
    version: workflow.version ?? "1.0",
    steps: workflow.steps ?? [],
    ...(workflow.description ? { description: workflow.description } : {}),
    ...(workflow.agents ? { agents: workflow.agents } : {}),
  };

  await writeYamlFile(path, newWorkflow);
}

export async function addStep(path: string, options: StepAddOptions): Promise<void> {
  const workflow = await readWorkflow(path);
  if (!workflow) {
    throw new Error(`Workflow not found: ${path}`);
  }

  const onFail = options.onFail
    ? {
        goto: options.onFail.goto ?? options.name,
        max_iterations: options.onFail.maxIterations,
        escalate_on_exhaust: options.onFail.escalateOnExhaust,
        cooldown_ms: options.onFail.cooldownMs,
        reset_state: options.onFail.resetState,
        max_cost: options.onFail.maxCost,
        max_cost_escalation: options.onFail.maxCostEscalation,
      }
    : undefined;

  const step: WorkflowStep = {
    name: options.name,
    ...(options.agent ? { agent: options.agent } : {}),
    ...(options.tool ? { tool: options.tool } : {}),
    ...(options.description ? { description: options.description } : {}),
    ...(options.dependsOn ? { depends_on: options.dependsOn } : {}),
    ...(options.pattern ? { pattern: options.pattern } : {}),
    ...(options.participants ? { participants: options.participants } : {}),
    ...(options.input ? { input: options.input } : {}),
    ...(options.output ? { output: options.output } : {}),
    ...(options.config ? { config: options.config } : {}),
    ...(options.hooks ? { hooks: options.hooks } : {}),
    ...(options.gate ? { gate: options.gate } : {}),
    ...(options.parallel ? { parallel: options.parallel } : {}),
    ...(options.merge ? { merge: options.merge } : {}),
    ...(onFail ? { on_fail: onFail } : {}),
  };

  workflow.steps = [...(workflow.steps ?? []), step];
  await writeYamlFile(path, workflow);
}

export async function removeStep(path: string, stepName: string): Promise<void> {
  const workflow = await readWorkflow(path);
  if (!workflow) {
    throw new Error(`Workflow not found: ${path}`);
  }

  const initialLength = workflow.steps?.length ?? 0;
  workflow.steps = workflow.steps?.filter((s) => s.name !== stepName) ?? [];

  if (workflow.steps.length === initialLength) {
    throw new Error(`Step not found: ${stepName}`);
  }

  await writeYamlFile(path, workflow);
}

export async function updateStep(
  path: string,
  stepName: string,
  updates: Partial<Omit<WorkflowStep, "name">>
): Promise<void> {
  const workflow = await readWorkflow(path);
  if (!workflow) {
    throw new Error(`Workflow not found: ${path}`);
  }

  const stepIndex = workflow.steps?.findIndex((s) => s.name === stepName) ?? -1;
  if (stepIndex === -1) {
    throw new Error(`Step not found: ${stepName}`);
  }

  workflow.steps[stepIndex] = {
    ...workflow.steps[stepIndex],
    ...updates,
    name: stepName, // Ensure name is preserved
  };

  await writeYamlFile(path, workflow);
}

export async function validateWorkflow(path: string): Promise<{ valid: boolean; errors: string[] }> {
  const workflow = await readWorkflow(path);
  if (!workflow) {
    return { valid: false, errors: ["Workflow file not found"] };
  }

  const errors: string[] = [];

  if (!workflow.name) {
    errors.push("Workflow name is required");
  }

  if (!workflow.steps || workflow.steps.length === 0) {
    errors.push("Workflow must have at least one step");
  }

  const stepNames = new Set<string>();

  const stepErrors = (workflow.steps ?? []).flatMap((step) => {
    const errs: string[] = [];

    if (!step.name) {
      errs.push("All steps must have a name");
      return errs;
    }

    if (stepNames.has(step.name)) {
      errs.push(`Duplicate step name: ${step.name}`);
    }
    stepNames.add(step.name);

    if (step.depends_on) {
      const missingDeps = step.depends_on.filter(
        (dep) => !workflow.steps?.some((s) => s.name === dep)
      );
      missingDeps.forEach((dep) => {
        errs.push(`Step '${step.name}' depends on non-existent step: ${dep}`);
      });
    }

    return errs;
  });

  return { valid: errors.length === 0 && stepErrors.length === 0, errors: [...errors, ...stepErrors] };
}

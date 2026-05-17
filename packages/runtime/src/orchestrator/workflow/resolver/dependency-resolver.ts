/**
 * Dependency resolver using Kahn's Algorithm
 */

import {
  type CycleResult,
  buildGraph,
  detectCycles,
  computeLevels,
  groupByLevel,
  topologicalSort as graphTopologicalSort,
} from "../graph/index.js";
import type { Step, Workflow } from "../types/workflow.js";

/**
 * Step group at a specific execution level
 */
export interface StepGroup {
  /** Execution level (0 = no dependencies, 1+ = depends on earlier levels) */
  level: number;
  /** Steps that can be executed in parallel at this level */
  steps: Step[];
  /** Whether steps in this group can be executed in parallel */
  parallelizable: boolean;
}

/**
 * Execution plan for a workflow
 */
export interface ExecutionPlan {
  /** Whether the plan is valid (no cycles) */
  isValid: boolean;
  /** Execution order of step names */
  executionOrder: string[];
  /** Cyclic dependency path (if any) */
  cyclicPath?: string[];
  /** Steps grouped by execution level */
  stepGroups: StepGroup[];
  /** Conditional back-edges (source -> target) */
  backEdges: Array<{ source: string; target: string }>;
  /** Non-fatal planning warnings */
  warnings: string[];
}

/**
 * Dependency graph representation
 */
export interface DependencyGraph {
  /** Map of step name to Step object */
  nodes: Map<string, Step>;
  /** Map of step name to list of dependency step names */
  edges: Map<string, string[]>;
  /** Conditional back-edges (source -> target) */
  backEdges: Map<string, string>;
}

/**
 * Build dependency graph from steps
 */
export function buildDependencyGraph(steps: Step[]): DependencyGraph {
  const graph = buildGraph(steps);

  return {
    nodes: new Map(steps.map((step) => [step.name, step])),
    edges: new Map([...graph.reverseEdges.entries()].map(([node, deps]) => [node, Array.from(deps)])),
    backEdges: new Map(
      steps
        .filter((step) => typeof step.on_fail?.goto === "string")
        .map((step) => [step.name, step.on_fail?.goto ?? ""])
    ),
  };
}

function analyzeBackEdges(steps: Step[]): { backEdges: Array<{ source: string; target: string }>; warnings: string[] } {
  const backEdges = steps
    .filter((step) => typeof step.on_fail?.goto === "string")
    .map((step) => ({ source: step.name, target: step.on_fail!.goto }));

  const byTarget = backEdges.reduce<Map<string, string[]>>(
    (targets, edge) => targets.set(edge.target, [...(targets.get(edge.target) ?? []), edge.source]),
    new Map<string, string[]>()
  );
  const warnings = [...byTarget.entries()]
    .filter(([, sources]) => sources.length >= 2)
    .map(([target, sources]) => `Multiple back-edges point to '${target}': ${sources.join(", ")}`);

  return { backEdges, warnings };
}

/**
 * Resolve execution order using topological sort (Kahn's Algorithm)
 */
export function resolveTopologicalOrder(steps: Step[]): string[] | null {
  const graph = buildGraph(steps);
  const result = graphTopologicalSort(graph);

  if (!result.success) {
    return null;
  }

  return result.order;
}

/**
 * Check for cycles using DFS
 */
export function detectCyclesDFS(steps: Step[]): CycleResult {
  const graph = buildGraph(steps);
  return detectCycles(graph);
}

/**
 * Calculate execution levels using BFS
 */
export function calculateExecutionLevels(steps: Step[]): Map<string, number> {
  const graph = buildGraph(steps);
  return computeLevels(graph);
}

/**
 * Group steps by execution level
 */
export function groupStepsByLevel(steps: Step[]): StepGroup[] {
  const groups = groupByLevel(steps);
  return [...groups.keys()]
    .sort((a, b) => a - b)
    .map((level) => {
      const stepsAtLevel = groups.get(level) ?? [];
      return {
      level,
      steps: stepsAtLevel,
      parallelizable: stepsAtLevel.length > 1,
      };
    });
}

/**
 * Generate full execution plan
 */
export function generateExecutionPlan(workflow: Workflow): ExecutionPlan {
  const backEdgeAnalysis = analyzeBackEdges(workflow.steps);

  // Check for cycles
  const cycleCheck = detectCyclesDFS(workflow.steps);

  if (cycleCheck.hasCycle) {
    return {
      isValid: false,
      executionOrder: [],
      cyclicPath: cycleCheck.cyclePath,
      stepGroups: [],
      backEdges: backEdgeAnalysis.backEdges,
      warnings: backEdgeAnalysis.warnings,
    };
  }

  // Get execution order
  const executionOrder = resolveTopologicalOrder(workflow.steps) || [];

  // Get step groups
  const stepGroups = groupStepsByLevel(workflow.steps);

  return {
    isValid: true,
    executionOrder,
    stepGroups,
    backEdges: backEdgeAnalysis.backEdges,
    warnings: backEdgeAnalysis.warnings,
  };
}

/**
 * Get next executable steps from current execution state
 */
export function getNextSteps(workflow: Workflow, completedSteps: Set<string>): Step[] {
  const graph = buildGraph(workflow.steps);
  return workflow.steps.filter((step) => {
    const deps = graph.reverseEdges.get(step.name) ?? new Set<string>();
    return !completedSteps.has(step.name) && [...deps].every((dep) => completedSteps.has(dep));
  });
}

/**
 * Validate execution order
 */
export function validateExecutionOrder(
  workflow: Workflow,
  order: string[]
): { valid: boolean; errors: string[] } {
  const stepNames = new Set(workflow.steps.map((s) => s.name));

  const missingStepErrors = workflow.steps
    .filter((step) => !order.includes(step.name))
    .map((step) => `Step '${step.name}' is missing from execution order`);
  const unknownStepErrors = order
    .filter((name) => !stepNames.has(name))
    .map((name) => `Execution order contains unknown step '${name}'`);
  const graph = buildGraph(workflow.steps);
  const dependencyOrderErrors = order.reduce<{ completed: Set<string>; errors: string[] }>(
    (state, name) => {
      const deps = graph.reverseEdges.get(name) ?? new Set<string>();
      return {
        completed: new Set([...state.completed, name]),
        errors: [
          ...state.errors,
          ...[...deps]
            .filter((dep) => !state.completed.has(dep))
            .map((dep) => `Step '${name}' comes before its dependency '${dep}'`),
        ],
      };
    },
    { completed: new Set<string>(), errors: [] }
  ).errors;
  const errors = [...missingStepErrors, ...unknownStepErrors, ...dependencyOrderErrors];

  return {
    valid: errors.length === 0,
    errors,
  };
}

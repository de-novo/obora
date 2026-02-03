/**
 * Dependency resolver using Kahn's Algorithm
 * @module @obora/core/resolver/dependency-resolver
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
}

/**
 * Dependency graph representation
 */
export interface DependencyGraph {
  /** Map of step name to Step object */
  nodes: Map<string, Step>;
  /** Map of step name to list of dependency step names */
  edges: Map<string, string[]>;
}

/**
 * Build dependency graph from steps
 */
export function buildDependencyGraph(steps: Step[]): DependencyGraph {
  const graph = buildGraph(steps);
  const stepMap = new Map<string, Step>();

  for (const step of steps) {
    stepMap.set(step.name, step);
  }

  // Extract edges from graph
  const edges = new Map<string, string[]>();
  for (const [node, deps] of graph.reverseEdges) {
    edges.set(node, Array.from(deps));
  }

  return {
    nodes: stepMap,
    edges,
  };
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
  const result: StepGroup[] = [];

  const sortedLevels = Array.from(groups.keys()).sort((a, b) => a - b);

  for (const level of sortedLevels) {
    const stepsAtLevel = groups.get(level)!;
    result.push({
      level,
      steps: stepsAtLevel,
      parallelizable: stepsAtLevel.length > 1,
    });
  }

  return result;
}

/**
 * Generate full execution plan
 */
export function generateExecutionPlan(workflow: Workflow): ExecutionPlan {
  // Check for cycles
  const cycleCheck = detectCyclesDFS(workflow.steps);

  if (cycleCheck.hasCycle) {
    return {
      isValid: false,
      executionOrder: [],
      cyclicPath: cycleCheck.cyclePath,
      stepGroups: [],
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
  };
}

/**
 * Get next executable steps from current execution state
 */
export function getNextSteps(workflow: Workflow, completedSteps: Set<string>): Step[] {
  const graph = buildGraph(workflow.steps);
  const nextSteps: Step[] = [];

  for (const step of workflow.steps) {
    // Skip already completed steps
    if (completedSteps.has(step.name)) {
      continue;
    }

    // Get all dependencies
    const deps = graph.reverseEdges.get(step.name) || new Set();

    // Check if all dependencies are completed
    const allDepsCompleted = Array.from(deps).every((dep) => completedSteps.has(dep));

    if (allDepsCompleted) {
      nextSteps.push(step);
    }
  }

  return nextSteps;
}

/**
 * Validate execution order
 */
export function validateExecutionOrder(
  workflow: Workflow,
  order: string[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const stepNames = new Set(workflow.steps.map((s) => s.name));

  // Check all steps are present
  for (const step of workflow.steps) {
    if (!order.includes(step.name)) {
      errors.push(`Step '${step.name}' is missing from execution order`);
    }
  }

  // Check order contains only valid steps
  for (const name of order) {
    if (!stepNames.has(name)) {
      errors.push(`Execution order contains unknown step '${name}'`);
    }
  }

  // Check dependencies come before dependents
  const completed = new Set<string>();
  const graph = buildGraph(workflow.steps);

  for (const name of order) {
    const deps = graph.reverseEdges.get(name) || new Set();
    for (const dep of deps) {
      if (!completed.has(dep)) {
        errors.push(`Step '${name}' comes before its dependency '${dep}'`);
      }
    }
    completed.add(name);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

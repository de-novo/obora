/**
 * Graph utilities for dependency resolution
 */

import type { Step } from "../types/workflow.js";

/**
 * Graph representation using adjacency list
 */
export interface Graph {
  /** Set of all node names */
  nodes: Set<string>;
  /** Edge map: node -> set of dependent nodes (forward direction) */
  edges: Map<string, Set<string>>;
  /** Reverse edge map: node -> set of nodes this node depends on */
  reverseEdges: Map<string, Set<string>>;
}

/**
 * Result of cycle detection
 */
export interface CycleResult {
  /** Whether a cycle exists */
  hasCycle: boolean;
  /** The path that forms the cycle (if any) */
  cyclePath?: string[];
}

/**
 * Result of topological sort
 */
export interface TopologicalResult {
  /** Whether sort was successful (no cycles) */
  success: boolean;
  /** Sorted node names in execution order */
  order: string[];
  /** Cycle path if cycle detected */
  cyclePath?: string[];
}

/**
 * Build a graph from steps
 */
export function buildGraph(steps: Step[]): Graph {
  const nodes = new Set<string>();
  const edges = new Map<string, Set<string>>();
  const reverseEdges = new Map<string, Set<string>>();

  // Initialize nodes
  for (const step of steps) {
    nodes.add(step.name);
    edges.set(step.name, new Set());
    reverseEdges.set(step.name, new Set());
  }

  // Add explicit dependencies
  for (const step of steps) {
    if (step.depends_on) {
      for (const dep of step.depends_on) {
        if (nodes.has(dep)) {
          edges.get(dep)!.add(step.name);
          reverseEdges.get(step.name)!.add(dep);
        }
      }
    }
  }

  // Add implicit dependencies from inputs/outputs
  const outputMap = new Map<string, string>();
  for (const step of steps) {
    if (step.outputs) {
      for (const output of step.outputs) {
        outputMap.set(output, step.name);
      }
    }
  }

  for (const step of steps) {
    if (step.inputs) {
      for (const input of step.inputs) {
        const producer = outputMap.get(input);
        if (producer && producer !== step.name) {
          edges.get(producer)!.add(step.name);
          reverseEdges.get(step.name)!.add(producer);
        }
      }
    }
  }

  return { nodes, edges, reverseEdges };
}

/**
 * Detect cycles using DFS
 */
export function detectCycles(graph: Graph): CycleResult {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const parent = new Map<string, string>();

  function dfs(node: string, path: string[]): string[] | null {
    visited.add(node);
    recStack.add(node);

    const deps = graph.reverseEdges.get(node) || [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        parent.set(dep, node);
        const cycle = dfs(dep, [...path, dep]);
        if (cycle) return cycle;
      } else if (recStack.has(dep)) {
        // Found cycle - reconstruct path
        const cycleStart = path.indexOf(dep);
        const cyclePath = [...path.slice(cycleStart), node, dep];
        return cyclePath;
      }
    }

    recStack.delete(node);
    return null;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      const cycle = dfs(node, [node]);
      if (cycle) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Topological sort using Kahn's Algorithm
 */
export function topologicalSort(graph: Graph): TopologicalResult {
  // First check for cycles
  const cycleCheck = detectCycles(graph);
  if (cycleCheck.hasCycle) {
    return {
      success: false,
      order: [],
      cyclePath: cycleCheck.cyclePath,
    };
  }

  // Kahn's Algorithm
  const indegree = new Map<string, number>();
  const order: string[] = [];

  // Initialize indegrees
  for (const node of graph.nodes) {
    indegree.set(node, 0);
  }

  // Calculate indegrees
  for (const node of graph.nodes) {
    const dependents = graph.edges.get(node) || [];
    for (const dependent of dependents) {
      indegree.set(dependent, (indegree.get(dependent) || 0) + 1);
    }
  }

  // Find nodes with indegree 0
  const queue: string[] = [];
  for (const [node, degree] of indegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  // Process queue
  while (queue.length > 0) {
    // Sort queue for deterministic ordering
    queue.sort();
    const current = queue.shift()!;
    order.push(current);

    const dependents = graph.edges.get(current) || [];
    for (const dependent of dependents) {
      const newDegree = (indegree.get(dependent) || 1) - 1;
      indegree.set(dependent, newDegree);
      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  return { success: true, order };
}

/**
 * Compute execution levels for each node
 * Level 0 = no dependencies, Level N = depends on nodes up to level N-1
 */
export function computeLevels(graph: Graph): Map<string, number> {
  const levels = new Map<string, number>();

  // Initialize all levels to 0
  for (const node of graph.nodes) {
    levels.set(node, 0);
  }

  // BFS to compute levels
  const sorted = topologicalSort(graph);
  if (!sorted.success) {
    return levels;
  }

  for (const node of sorted.order) {
    const deps = graph.reverseEdges.get(node) || [];
    let maxDepLevel = -1;

    for (const dep of deps) {
      const depLevel = levels.get(dep) || 0;
      if (depLevel > maxDepLevel) {
        maxDepLevel = depLevel;
      }
    }

    levels.set(node, maxDepLevel + 1);
  }

  return levels;
}

/**
 * Group nodes by execution level
 */
export function groupByLevel(steps: Step[]): Map<number, Step[]> {
  const graph = buildGraph(steps);
  const levels = computeLevels(graph);
  const groups = new Map<number, Step[]>();

  for (const step of steps) {
    const level = levels.get(step.name) || 0;
    if (!groups.has(level)) {
      groups.set(level, []);
    }
    groups.get(level)!.push(step);
  }

  return groups;
}

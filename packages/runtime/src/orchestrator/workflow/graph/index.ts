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
  const initialGraph = steps.reduce<Graph>(
    (graph, step) => {
      graph.nodes.add(step.name);
      graph.edges.set(step.name, new Set());
      graph.reverseEdges.set(step.name, new Set());
      return graph;
    },
    { nodes: new Set<string>(), edges: new Map<string, Set<string>>(), reverseEdges: new Map<string, Set<string>>() }
  );

  const addEdge = (graph: Graph, from: string, to: string): Graph => {
    graph.edges.get(from)?.add(to);
    graph.reverseEdges.get(to)?.add(from);
    return graph;
  };

  const graphWithExplicitDependencies = steps.reduce<Graph>(
    (graph, step) =>
      (step.depends_on ?? []).reduce<Graph>(
        (currentGraph, dependency) =>
          currentGraph.nodes.has(dependency)
            ? addEdge(currentGraph, dependency, step.name)
            : currentGraph,
        graph
      ),
    initialGraph
  );

  const outputMap = steps.reduce<Map<string, string>>(
    (outputs, step) =>
      (step.outputs ?? []).reduce<Map<string, string>>(
        (currentOutputs, output) => currentOutputs.set(output, step.name),
        outputs
      ),
    new Map<string, string>()
  );

  return steps.reduce<Graph>(
    (graph, step) =>
      (step.inputs ?? []).reduce<Graph>((currentGraph, input) => {
        const producer = outputMap.get(input);
        return producer && producer !== step.name
          ? addEdge(currentGraph, producer, step.name)
          : currentGraph;
      }, graph),
    graphWithExplicitDependencies
  );
}

/**
 * Detect cycles using DFS
 */
export function detectCycles(graph: Graph): CycleResult {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(node: string, path: string[]): string[] | null {
    visited.add(node);
    recStack.add(node);

    const cycle = [...(graph.reverseEdges.get(node) ?? [])].reduce<string[] | null>(
      (foundCycle, dependency) => {
        if (foundCycle) {
          return foundCycle;
        }

        if (!visited.has(dependency)) {
          return dfs(dependency, [...path, dependency]);
        }

        if (recStack.has(dependency)) {
          const cycleStart = path.indexOf(dependency);
          return [...path.slice(cycleStart), node, dependency];
        }

        return null;
      },
      null
    );

    recStack.delete(node);
    return cycle;
  }

  const cycle = [...graph.nodes].reduce<string[] | null>(
    (foundCycle, node) => foundCycle ?? (visited.has(node) ? null : dfs(node, [node])),
    null
  );

  if (cycle) {
    return { hasCycle: true, cyclePath: cycle };
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

  const indegree = [...graph.nodes].reduce<Map<string, number>>(
    (degrees, node) => degrees.set(node, 0),
    new Map<string, number>()
  );

  [...graph.nodes].reduce<Map<string, number>>(
    (degrees, node) =>
      [...(graph.edges.get(node) ?? [])].reduce<Map<string, number>>(
        (currentDegrees, dependent) =>
          currentDegrees.set(dependent, (currentDegrees.get(dependent) ?? 0) + 1),
        degrees
      ),
    indegree
  );

  type SortState = {
    order: string[];
    queue: string[];
  };

  const initialQueue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([node]) => node);

  const sorted = Array.from({ length: graph.nodes.size }).reduce<SortState>(
    (state) => {
      const sortedQueue = [...state.queue].sort();
      const current = sortedQueue[0]!;
      const remainingQueue = sortedQueue.slice(1);

      const nextQueue = [...(graph.edges.get(current) ?? [])].reduce<string[]>(
        (queue, dependent) => {
          const newDegree = (indegree.get(dependent) ?? 1) - 1;
          indegree.set(dependent, newDegree);
          return newDegree === 0 ? [...queue, dependent] : queue;
        },
        remainingQueue
      );

      return {
        order: [...state.order, current],
        queue: nextQueue,
      };
    },
    { order: [], queue: initialQueue }
  );

  return { success: true, order: sorted.order };
}

/**
 * Compute execution levels for each node
 * Level 0 = no dependencies, Level N = depends on nodes up to level N-1
 */
export function computeLevels(graph: Graph): Map<string, number> {
  const levels = [...graph.nodes].reduce<Map<string, number>>(
    (currentLevels, node) => currentLevels.set(node, 0),
    new Map<string, number>()
  );

  // BFS to compute levels
  const sorted = topologicalSort(graph);
  if (!sorted.success) {
    return levels;
  }

  return sorted.order.reduce<Map<string, number>>((currentLevels, node) => {
    const maxDepLevel = [...(graph.reverseEdges.get(node) ?? [])].reduce(
      (maxLevel, dependency) => Math.max(maxLevel, currentLevels.get(dependency) ?? 0),
      -1
    );

    return currentLevels.set(node, maxDepLevel + 1);
  }, levels);
}

/**
 * Group nodes by execution level
 */
export function groupByLevel(steps: Step[]): Map<number, Step[]> {
  const graph = buildGraph(steps);
  const levels = computeLevels(graph);

  return steps.reduce<Map<number, Step[]>>((groups, step) => {
    const level = levels.get(step.name) || 0;
    groups.set(level, [...(groups.get(level) ?? []), step]);
    return groups;
  }, new Map<number, Step[]>());
}

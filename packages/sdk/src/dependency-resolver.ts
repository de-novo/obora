import { OboraError, OboraErrorCode } from "./runtime-errors.js";
import type { WorkflowStep } from "./workflow.js";

export function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const seenStepNames = new Set<string>();
  for (const step of steps) {
    if (seenStepNames.has(step.name)) {
      throw OboraError.invalidWorkflow(`Duplicate workflow step name: ${step.name}`);
    }
    seenStepNames.add(step.name);
  }

  const map = new Map(steps.map((step) => [step.name, step]));
  const inDegree = new Map<string, number>(steps.map((step) => [step.name, 0]));
  const graph = new Map<string, string[]>();

  for (const step of steps) {
    for (const dep of step.depends_on ?? []) {
      if (!map.has(dep)) {
        throw OboraError.invalidWorkflow(`Unknown dependency '${dep}' for step '${step.name}'`);
      }
      graph.set(dep, [...(graph.get(dep) ?? []), step.name]);
      inDegree.set(step.name, (inDegree.get(step.name) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [name, count] of inDegree.entries()) {
    if (count === 0) {
      queue.push(name);
    }
  }

  const result: WorkflowStep[] = [];
  while (queue.length > 0) {
    const name = queue.shift()!;
    result.push(map.get(name)!);

    for (const next of graph.get(name) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
      }
    }
  }

  if (result.length !== steps.length) {
    throw OboraError.circularDependency();
  }

  return result;
}

export function groupByParallelizableLevels(steps: WorkflowStep[]): WorkflowStep[][] {
  const sorted = topologicalSort(steps);
  const levelByStep = new Map<string, number>();

  for (const step of sorted) {
    const deps = step.depends_on ?? [];
    const level = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => levelByStep.get(dep) ?? 0)) + 1;
    levelByStep.set(step.name, level);
  }

  const maxLevel = Math.max(0, ...levelByStep.values());
  const groups: WorkflowStep[][] = Array.from({ length: maxLevel + 1 }, () => []);
  for (const step of sorted) {
    groups[levelByStep.get(step.name) ?? 0]!.push(step);
  }

  return groups.filter((group) => group.length > 0);
}

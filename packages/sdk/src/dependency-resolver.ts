import { OboraError, OboraErrorCode } from "./runtime-errors.js";
import type { WorkflowStep } from "./workflow.js";

export function topologicalSort(steps: WorkflowStep[]): WorkflowStep[] {
  const duplicate = steps.reduce<{ seen: Set<string>; duplicate?: string }>(
    (state, step) => {
      if (state.duplicate) {
        return state;
      }
      if (state.seen.has(step.name)) {
        return { ...state, duplicate: step.name };
      }
      state.seen.add(step.name);
      return state;
    },
    { seen: new Set<string>() }
  ).duplicate;

  if (duplicate) {
    throw OboraError.invalidWorkflow(`Duplicate workflow step name: ${duplicate}`);
  }

  const map = new Map(steps.map((step) => [step.name, step]));
  const inDegree = new Map<string, number>(steps.map((step) => [step.name, 0]));
  const graph = new Map<string, string[]>();

  steps.reduce((_, step) => {
    (step.depends_on ?? []).forEach((dep) => {
      if (!map.has(dep)) {
        throw OboraError.invalidWorkflow(`Unknown dependency '${dep}' for step '${step.name}'`);
      }
      graph.set(dep, [...(graph.get(dep) ?? []), step.name]);
      inDegree.set(step.name, (inDegree.get(step.name) ?? 0) + 1);
    });
    return undefined;
  }, undefined);

  type SortState = {
    queue: string[];
    result: WorkflowStep[];
  };

  const processQueue = (state: SortState): SortState => {
    const [name, ...queue] = state.queue;
    if (!name) {
      return state;
    }

    const step = map.get(name);
    if (!step) {
      return processQueue({ ...state, queue });
    }

    const nextQueue = (graph.get(name) ?? []).reduce<string[]>((currentQueue, next) => {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      return nextDegree === 0 ? [...currentQueue, next] : currentQueue;
    }, queue);

    return processQueue({
      queue: nextQueue,
      result: [...state.result, step],
    });
  };

  const result = processQueue({
    queue: [...inDegree.entries()]
      .filter(([, count]) => count === 0)
      .map(([name]) => name),
    result: [],
  }).result;

  if (result.length !== steps.length) {
    throw OboraError.circularDependency();
  }

  return result;
}

export function groupByParallelizableLevels(steps: WorkflowStep[]): WorkflowStep[][] {
  const sorted = topologicalSort(steps);
  const levelByStep = new Map<string, number>();

  sorted.forEach((step) => {
    const deps = step.depends_on ?? [];
    const level = deps.length === 0 ? 0 : Math.max(...deps.map((dep) => levelByStep.get(dep) ?? 0)) + 1;
    levelByStep.set(step.name, level);
  });

  const maxLevel = Math.max(0, ...levelByStep.values());
  return sorted
    .reduce<WorkflowStep[][]>(
      (groups, step) => {
        const level = levelByStep.get(step.name) ?? 0;
        return groups.map((group, index) => index === level ? [...group, step] : group);
      },
      Array.from({ length: maxLevel + 1 }, () => [])
    )
    .filter((group) => group.length > 0);
}

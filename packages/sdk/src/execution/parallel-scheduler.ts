import { groupByParallelizableLevels } from "../dependency-resolver.js";
import type { WorkflowStep, MergeStrategy } from "../workflow.js";
import type { StepResult } from "../step-executor.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ExecutionPlan {
  /** Ordered layers of steps. Steps within a layer can run in parallel. */
  layers: WorkflowStep[][];
  /** Whether any layer has multiple steps (i.e., parallel execution is useful). */
  isParallel: boolean;
}

export interface ParallelStepResult {
  stepName: string;
  result: StepResult;
  status: "fulfilled";
}

export interface ParallelStepFailure {
  stepName: string;
  status: "rejected";
  error: unknown;
}

export type ParallelStepOutcome = ParallelStepResult | ParallelStepFailure;

// ── ParallelScheduler ──────────────────────────────────────────────────────

const DEFAULT_MAX_CONCURRENCY = 3;

export class ParallelScheduler {
  readonly maxConcurrency: number;

  constructor(maxConcurrency: number = DEFAULT_MAX_CONCURRENCY) {
    this.maxConcurrency = Math.max(1, Math.floor(maxConcurrency));
  }

  /**
   * Analyze workflow steps and build an execution plan with parallelizable layers.
   *
   * Only uses layer-based execution when at least one step has explicit `depends_on`
   * or `parallel` branches. Otherwise, falls back to sequential (one step per layer)
   * to preserve backward compatibility.
   */
  buildExecutionPlan(steps: WorkflowStep[]): ExecutionPlan {
    const hasExplicitDeps = steps.some(
      (s) => s.depends_on !== undefined && s.depends_on.length > 0,
    );
    const hasParallelGroups = steps.some(
      (s) => s.parallel !== undefined && s.parallel.length > 0,
    );

    if (!hasExplicitDeps && !hasParallelGroups) {
      // No dependency info → preserve sequential ordering
      return {
        layers: steps.map((s) => [s]),
        isParallel: false,
      };
    }

    const layers = groupByParallelizableLevels(steps);
    const isParallel = layers.some((layer) => layer.length > 1);
    return { layers, isParallel };
  }

  /**
   * Execute a group of steps in parallel, respecting maxConcurrency.
   * Uses `Promise.allSettled` so one failure doesn't cancel others.
   */
  async executeParallelSteps(
    steps: WorkflowStep[],
    executeOne: (step: WorkflowStep) => Promise<StepResult>,
  ): Promise<ParallelStepOutcome[]> {
    const results: ParallelStepOutcome[] = [];
    const chunks = chunk(steps, this.maxConcurrency);

    for (const batch of chunks) {
      const settled = await Promise.allSettled(
        batch.map(async (step) => {
          const result = await executeOne(step);
          return { stepName: step.name, result };
        }),
      );

      for (let i = 0; i < settled.length; i++) {
        const entry = settled[i]!;
        if (entry.status === "fulfilled") {
          results.push({
            stepName: entry.value.stepName,
            result: entry.value.result,
            status: "fulfilled",
          });
        } else {
          results.push({
            stepName: batch[i]!.name,
            status: "rejected",
            error: entry.reason,
          });
        }
      }
    }

    return results;
  }

  /**
   * Merge results from parallel executions using the specified strategy.
   */
  mergeResults(results: StepResult[], strategy: MergeStrategy): unknown {
    if (results.length === 0) return null;

    switch (strategy) {
      case "concat":
        return results.map((r) => r.output);

      case "best_score":
        return bestScoreMerge(results);

      case "first_success":
        return results[0]!.output;

      case "consensus":
        return consensusMerge(results);

      default:
        return results.map((r) => r.output);
    }
  }
}

// ── Merge helpers ──────────────────────────────────────────────────────────

function bestScoreMerge(results: StepResult[]): unknown {
  let bestOutput: unknown = results[0]!.output;
  let bestScore = -Infinity;

  for (const r of results) {
    const output = r.output;
    if (output && typeof output === "object") {
      const score = (output as Record<string, unknown>).score;
      if (typeof score === "number" && score > bestScore) {
        bestScore = score;
        bestOutput = output;
      }
    }
  }

  return bestOutput;
}

function consensusMerge(results: StepResult[]): unknown {
  const counts = new Map<string, { count: number; output: unknown }>();

  for (const r of results) {
    const key = JSON.stringify(r.output);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, output: r.output });
    }
  }

  let best: { count: number; output: unknown } = { count: 0, output: null };
  for (const entry of counts.values()) {
    if (entry.count > best.count) {
      best = entry;
    }
  }

  return best.output;
}

// ── Utility ────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

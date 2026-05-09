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
    const chunks = chunk(steps, this.maxConcurrency);

    return chunks.reduce<Promise<ParallelStepOutcome[]>>(async (previous, batch) => {
      const results = await previous;
      const settled = await Promise.allSettled(
        batch.map(async (step) => {
          const result = await executeOne(step);
          return { stepName: step.name, result };
        }),
      );

      return [
        ...results,
        ...settled.map((entry, index): ParallelStepOutcome =>
          entry.status === "fulfilled"
            ? {
                stepName: entry.value.stepName,
                result: entry.value.result,
                status: "fulfilled",
              }
            : {
                stepName: batch[index]!.name,
                status: "rejected",
                error: entry.reason,
              }
        ),
      ];
    }, Promise.resolve([]));
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
  return results.reduce<{ output: unknown; score: number }>(
    (best, result) => {
      const output = result.output;
      if (output && typeof output === "object") {
        const score = (output as Record<string, unknown>).score;
        if (typeof score === "number" && score > best.score) {
          return { output, score };
        }
      }
      return best;
    },
    { output: results[0]!.output, score: -Infinity }
  ).output;
}

function consensusMerge(results: StepResult[]): unknown {
  const counts = results.reduce<Map<string, { count: number; output: unknown }>>((entries, result) => {
    const key = JSON.stringify(result.output);
    const existing = entries.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      entries.set(key, { count: 1, output: result.output });
    }
    return entries;
  }, new Map());

  const best = Array.from(counts.values()).reduce(
    (currentBest, entry) => (entry.count > currentBest.count ? entry : currentBest),
    { count: 0, output: null } as { count: number; output: unknown }
  );

  return best.output;
}

// ── Utility ────────────────────────────────────────────────────────────────

function chunk<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, index) =>
    arr.slice(index * size, index * size + size)
  );
}

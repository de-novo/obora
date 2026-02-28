import { OboraErrorCode } from "../../errors/OboraErrorCode.js";
import {
  CollaborationPatternBase,
  type BuiltinPatternKind,
  PATTERN_BLACKBOARD_DOMAIN_MAP,
  type PatternPayloadResult,
  type PatternRuntimeContext,
  type SupervisorPatternConfig,
} from "../types.js";

type SupervisorStrategy = "one_for_one" | "one_for_all";
type BackoffType = "linear" | "exponential";

type WorkerStatus = "completed" | "failed" | "restarting";

interface WorkerResultInput {
  success?: unknown;
  output?: unknown;
  error?: unknown;
}

interface SupervisorInput {
  tasks?: Record<string, unknown>;
  results?: Record<string, WorkerResultInput>;
}

interface NormalizedWorkerResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

interface WorkerState {
  status: WorkerStatus;
  restarts: number;
  output?: unknown;
}

const DEFAULT_STRATEGY: SupervisorStrategy = "one_for_one";
const DEFAULT_MAX_RESTARTS = 3;
const DEFAULT_BACKOFF: BackoffType = "linear";

/**
 * Internal safety guard to prevent infinite loops in the restart cycle.
 * This is NOT a user-facing config — it caps the total number of loop iterations
 * to protect against bugs in attempt-queue logic. In normal operation the loop
 * terminates via maxRestarts well before this limit.
 *
 * Rationale: maxRestarts × workers should always be << GUARD_LOOP_LIMIT.
 * If you hit this, it indicates a logic bug, not a config problem.
 */
const GUARD_LOOP_LIMIT = 10_000;

export class SupervisorPattern extends CollaborationPatternBase {
  readonly name = "supervisor";
  readonly kind: BuiltinPatternKind = "supervisor";

  validateConfig(config: SupervisorPatternConfig): void {
    if (config.strategy !== undefined && config.strategy !== "one_for_one" && config.strategy !== "one_for_all") {
      throw new Error("supervisor.strategy must be one of: one_for_one | one_for_all");
    }

    if (
      config.max_restarts !== undefined &&
      (!Number.isInteger(config.max_restarts) || config.max_restarts < 0)
    ) {
      throw new Error("supervisor.max_restarts must be an integer >= 0");
    }

    if (config.backoff !== undefined && config.backoff !== "linear" && config.backoff !== "exponential") {
      throw new Error("supervisor.backoff must be one of: linear | exponential");
    }
  }

  protected async onExecute(context: PatternRuntimeContext): Promise<PatternPayloadResult> {
    const workers = Object.keys(context.participants ?? {});
    if (workers.length === 0) {
      throw new Error("supervisor pattern requires at least one participant");
    }

    const config = (context.config ?? {}) as SupervisorPatternConfig;
    const strategy = (config.strategy ?? DEFAULT_STRATEGY) as SupervisorStrategy;
    const maxRestarts = config.max_restarts ?? DEFAULT_MAX_RESTARTS;
    const backoff = (config.backoff ?? DEFAULT_BACKOFF) as BackoffType;

    const input = this.getInput(context);
    const attemptQueues = this.buildAttemptQueues(workers, input.tasks);

    const currentResults: Record<string, NormalizedWorkerResult> = {};
    const workerStates: Record<string, WorkerState> = {};
    const backoffByWorker: Record<string, number[]> = {};

    for (const worker of workers) {
      currentResults[worker] =
        this.normalizeResult(input.results?.[worker]) ??
        this.shiftAttempt(worker, attemptQueues) ??
        { success: true };

      workerStates[worker] = {
        status: currentResults[worker].success ? "completed" : "failed",
        restarts: 0,
        output: currentResults[worker].output,
      };

      backoffByWorker[worker] = [];
    }

    let totalRestarts = 0;

    await context.emit?.({
      type: "supervisor_start",
      payload: {
        strategy,
        workers,
        max_restarts: maxRestarts,
        backoff,
      },
    });

    let guard = 0;
    while (guard < GUARD_LOOP_LIMIT) {
      guard += 1;

      for (const worker of workers) {
        const result = currentResults[worker];
        await context.emit?.({
          type: "worker_result",
          payload: {
            worker,
            success: result.success,
            output: result.output,
            error: result.error,
            restarts: workerStates[worker].restarts,
          },
        });
      }

      const failedWorkers = workers.filter((worker) => currentResults[worker].success === false);
      if (failedWorkers.length === 0) {
        return {
          success: true,
          output: {
            workers: workerStates,
            strategy,
            total_restarts: totalRestarts,
          },
          metadata: {
            blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP.supervisor,
            decision: "PASS",
            backoff,
            backoff_schedule: backoffByWorker,
            /** Audit integration: events are emit-only; no external audit sink is wired by default. */
            audit_emit_only: true,
          },
        };
      }

      if (strategy === "one_for_one") {
        for (const failedWorker of failedWorkers) {
          if (workerStates[failedWorker].restarts >= maxRestarts) {
            await context.emit?.({
              type: "supervisor_max_restarts",
              payload: {
                worker: failedWorker,
                strategy,
                max_restarts: maxRestarts,
                total_restarts: totalRestarts,
              },
            });

            workerStates[failedWorker].status = "failed";

            return {
              success: false,
              output: {
                reason: "max_restarts_exceeded",
                error_codes: [OboraErrorCode.RECOVERY_RETRY_EXHAUSTED],
                workers: workerStates,
                strategy,
                total_restarts: totalRestarts,
              },
              metadata: {
                blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP.supervisor,
                decision: "FAIL",
                backoff,
                backoff_schedule: backoffByWorker,
                /** Audit integration: events are emit-only; no external audit sink is wired by default. */
                audit_emit_only: true,
              },
            };
          }

          workerStates[failedWorker].restarts += 1;
          workerStates[failedWorker].status = "restarting";
          totalRestarts += 1;

          const waitStep = this.computeBackoff(workerStates[failedWorker].restarts, backoff);
          backoffByWorker[failedWorker].push(waitStep);

          await context.emit?.({
            type: "worker_restart",
            payload: {
              worker: failedWorker,
              strategy,
              restart_count: workerStates[failedWorker].restarts,
              total_restarts: totalRestarts,
              backoff,
              wait_step: waitStep,
            },
          });

          currentResults[failedWorker] =
            this.shiftAttempt(failedWorker, attemptQueues) ??
            currentResults[failedWorker];

          workerStates[failedWorker].status = currentResults[failedWorker].success ? "completed" : "failed";
          workerStates[failedWorker].output = currentResults[failedWorker].output;
        }

        continue;
      }

      if (totalRestarts >= maxRestarts) {
        await context.emit?.({
          type: "supervisor_max_restarts",
          payload: {
            worker: "*",
            strategy,
            max_restarts: maxRestarts,
            total_restarts: totalRestarts,
          },
        });

        for (const worker of workers) {
          if (!currentResults[worker].success) {
            workerStates[worker].status = "failed";
          }
        }

        return {
          success: false,
          output: {
            reason: "max_restarts_exceeded",
            error_codes: [OboraErrorCode.RECOVERY_RETRY_EXHAUSTED],
            workers: workerStates,
            strategy,
            total_restarts: totalRestarts,
          },
          metadata: {
            blackboard_domains: PATTERN_BLACKBOARD_DOMAIN_MAP.supervisor,
            decision: "FAIL",
            backoff,
            backoff_schedule: backoffByWorker,
            /** Audit integration: events are emit-only; no external audit sink is wired by default. */
            audit_emit_only: true,
          },
        };
      }

      totalRestarts += 1;

      for (const worker of workers) {
        workerStates[worker].restarts += 1;
        workerStates[worker].status = "restarting";

        const waitStep = this.computeBackoff(workerStates[worker].restarts, backoff);
        backoffByWorker[worker].push(waitStep);
      }

      await context.emit?.({
        type: "worker_restart",
        payload: {
          worker: failedWorkers[0],
          strategy,
          restart_all: true,
          affected_workers: workers,
          restart_count: totalRestarts,
          total_restarts: totalRestarts,
          backoff,
        },
      });

      for (const worker of workers) {
        currentResults[worker] = this.shiftAttempt(worker, attemptQueues) ?? currentResults[worker];
        workerStates[worker].status = currentResults[worker].success ? "completed" : "failed";
        workerStates[worker].output = currentResults[worker].output;
      }
    }

    throw new Error("supervisor pattern exceeded internal guard limit");
  }

  private getInput(context: PatternRuntimeContext): SupervisorInput {
    if (!context.input || typeof context.input !== "object") {
      return {};
    }

    return context.input as SupervisorInput;
  }

  private normalizeResult(result: WorkerResultInput | undefined): NormalizedWorkerResult | undefined {
    if (!result || typeof result !== "object") {
      return undefined;
    }

    return {
      success: result.success === true,
      output: result.output,
      error: typeof result.error === "string" ? result.error : undefined,
    };
  }

  private buildAttemptQueues(
    workers: string[],
    tasks: Record<string, unknown> | undefined
  ): Record<string, NormalizedWorkerResult[]> {
    const queues: Record<string, NormalizedWorkerResult[]> = {};

    for (const worker of workers) {
      const task = tasks?.[worker];
      const attempts = this.extractAttempts(task).map((attempt) => this.normalizeResult(attempt)).filter((item): item is NormalizedWorkerResult => !!item);
      queues[worker] = attempts;
    }

    return queues;
  }

  private extractAttempts(task: unknown): WorkerResultInput[] {
    if (!task || typeof task !== "object") {
      return [];
    }

    const attemptsValue = (task as { attempts?: unknown }).attempts;
    if (!Array.isArray(attemptsValue)) {
      return [];
    }

    return attemptsValue.filter((attempt): attempt is WorkerResultInput => !!attempt && typeof attempt === "object");
  }

  private shiftAttempt(
    worker: string,
    queues: Record<string, NormalizedWorkerResult[]>
  ): NormalizedWorkerResult | undefined {
    const queue = queues[worker];
    if (!queue || queue.length === 0) {
      return undefined;
    }

    return queue.shift();
  }

  private computeBackoff(restartCount: number, backoff: BackoffType): number {
    if (backoff === "exponential") {
      return 2 ** (restartCount - 1);
    }

    return restartCount;
  }
}

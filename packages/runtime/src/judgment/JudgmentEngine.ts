/**
 * JudgmentEngine — core state-transition and precedence logic.
 * TASK-M1-25
 */

import type {
  EngineOptions,
  EngineResult,
  HumanResolution,
  JudgmentStatus,
  RunState,
  StepInput,
  TransitionLog,
} from './types.js';

export interface JudgeFn {
  (stepId: string): Promise<JudgmentStatus>;
}

export interface EngineLogger {
  transition(log: TransitionLog): void;
}

const noopLogger: EngineLogger = { transition() {} };

export class JudgmentEngine {
  private readonly opts: EngineOptions;
  private readonly judge: JudgeFn;
  private readonly logger: EngineLogger;

  constructor(opts: EngineOptions, judge: JudgeFn, logger?: EngineLogger) {
    this.opts = opts;
    this.judge = judge;
    this.logger = logger ?? noopLogger;
  }

  async run(input: StepInput): Promise<EngineResult> {
    const runId = `run-${input.stepId}-${Date.now()}`;
    const trace: string[] = [];
    const state = {
      runState: 'queued' as RunState,
      retryCount: 0,
      consecutiveFails: 0,
      nextStep: undefined as string | undefined,
      errorCode: undefined as EngineResult['errorCode'],
      lastWasTimeout: false,
    };

    const transition = (to: RunState, reason: string) => {
      const from = state.runState;
      trace.push(`${from}->${to}: ${reason}`);
      this.logger.transition({ runId, from, to, reason, timestamp: Date.now() });
      state.runState = to;
    };

    const batchStart = Date.now();

    const isBatchExpired = () =>
      this.opts.batchDeadlineMs > 0 && Date.now() - batchStart >= this.opts.batchDeadlineMs;

    const applyBatchDeadline = (): boolean => {
      if (!isBatchExpired()) return false;
      // Only running|retried|timeout get converted
      if (state.runState === 'running' || state.runState === 'retried' || state.runState === 'timeout') {
        transition('timeout', 'batchDeadline exceeded');
        return true;
      }
      // skipped|needs-human-review|done|failed — keep as-is
      return true; // still expired, stop loop
    };

    // --- Skip check ---
    if (input.skipCondition) {
      transition('running', 'start');
      transition('skipped', 'skip_condition=true');
      return { runId, runState: state.runState, retryCount: state.retryCount, decisionTrace: trace };
    }

    transition('running', 'start');

    // Main execution loop
    while (true) {
      // Batch deadline check before each attempt
      if (applyBatchDeadline()) {
        state.errorCode = 'TIMEOUT';
        break;
      }

      // Execute judgment with timeout
      const attemptResult = await (async (): Promise<{ status: JudgmentStatus; timedOut: boolean }> => {
        try {
          return { status: await this.executeWithTimeout(input.stepId), timedOut: false };
        } catch {
          state.lastWasTimeout = true;
          transition('timeout', `step elapsed > timeoutMs(${this.opts.timeoutMs})`);
          return { status: 'fail', timedOut: true };
        }
      })();

      // Enforce batchDeadline AFTER judge execution (not only at loop-top)
      if (applyBatchDeadline()) {
        state.errorCode = 'TIMEOUT';
        break;
      }

      if (!attemptResult.timedOut && attemptResult.status === 'pass') {
        transition('done', 'judgmentStatus=pass');
        break;
      }

      if (!attemptResult.timedOut && attemptResult.status === 'fail') {
        state.consecutiveFails++;
        state.lastWasTimeout = false;
      }
      if (attemptResult.timedOut) {
        state.consecutiveFails++;
      }

      // Can retry?
      if (state.retryCount < this.opts.maxRetries) {
        state.retryCount++;
        transition('retried', `retry ${state.retryCount}/${this.opts.maxRetries}`);

        // Backoff
        if (this.opts.backoffMs > 0) {
          await this.sleep(this.opts.backoffMs);
        }

        // After backoff, set back to running for next attempt
        transition('running', 'retry attempt');
        continue;
      }

      // Retry exhausted — transition to failed first
      transition('failed', 'retries exhausted');

      // Set TIMEOUT errorCode if last attempt was a timeout
      if (state.lastWasTimeout) {
        state.errorCode = 'TIMEOUT';
      }

      // Precedence: goto > escalation
      if (this.opts.onFail?.goto) {
        const target = this.opts.onFail.goto;
        if (input.validTargets?.includes(target)) {
          state.nextStep = target;
          transition('done', `goto(${target})`);
        } else {
          state.errorCode = 'GOTO_TARGET_NOT_FOUND';
          trace.push(`goto target "${target}" not found in validTargets`);
        }
        break;
      }

      // Escalation check (only if goto not applied)
      const threshold = this.opts.onFail?.escalateAfterConsecutiveFails ?? 2;
      if (state.consecutiveFails >= threshold) {
        transition('needs-human-review', `consecutiveFails(${state.consecutiveFails}) >= threshold(${threshold})`);
      } else if (this.opts.onFail?.escalateAfterConsecutiveFails !== undefined) {
        // Escalation was configured but threshold not met
        state.errorCode = 'ESCALATION_FAILED';
      }

      break;
    }

    return {
      runId,
      runState: state.runState,
      retryCount: state.retryCount,
      nextStep: state.nextStep,
      errorCode: state.errorCode,
      decisionTrace: trace,
    };
  }

  /**
   * Resolve a needs-human-review state.
   */
  resolveHuman(result: EngineResult, resolution: HumanResolution): EngineResult {
    if (result.runState !== 'needs-human-review') return result;

    const trace = [...result.decisionTrace];
    const to: RunState = resolution.action === 'approve' ? 'done' : 'failed';
    trace.push(`needs-human-review->${to}: human ${resolution.action}`);
    this.logger.transition({
      runId: result.runId,
      from: 'needs-human-review',
      to,
      reason: `human ${resolution.action}`,
      timestamp: Date.now(),
    });

    return { ...result, runState: to, decisionTrace: trace };
  }

  private async executeWithTimeout(stepId: string): Promise<JudgmentStatus> {
    if (this.opts.timeoutMs <= 0) return this.judge(stepId);

    return new Promise<JudgmentStatus>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('TIMEOUT')), this.opts.timeoutMs);
      this.judge(stepId).then(
        (r) => { clearTimeout(timer); resolve(r); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}

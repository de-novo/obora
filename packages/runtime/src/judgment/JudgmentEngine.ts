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
    let runState: RunState = 'queued';
    let retryCount = 0;
    let consecutiveFails = 0;
    let nextStep: string | undefined;
    let errorCode: EngineResult['errorCode'];
    let lastWasTimeout = false;

    const transition = (to: RunState, reason: string) => {
      const from = runState;
      trace.push(`${from}->${to}: ${reason}`);
      this.logger.transition({ runId, from, to, reason, timestamp: Date.now() });
      runState = to;
    };

    const batchStart = Date.now();

    const isBatchExpired = () =>
      this.opts.batchDeadlineMs > 0 && Date.now() - batchStart >= this.opts.batchDeadlineMs;

    const applyBatchDeadline = (): boolean => {
      if (!isBatchExpired()) return false;
      // Only running|retried|timeout get converted
      if (runState === 'running' || runState === 'retried' || runState === 'timeout') {
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
      return { runId, runState, retryCount, decisionTrace: trace };
    }

    transition('running', 'start');

    // Main execution loop
    while (true) {
      // Batch deadline check before each attempt
      if (applyBatchDeadline()) {
        errorCode = 'TIMEOUT';
        break;
      }

      // Execute judgment with timeout
      let status: JudgmentStatus;
      let timedOut = false;

      try {
        status = await this.executeWithTimeout(input.stepId);
      } catch {
        timedOut = true;
        lastWasTimeout = true;
        status = 'fail';
        transition('timeout', `step elapsed > timeoutMs(${this.opts.timeoutMs})`);
      }

      // Enforce batchDeadline AFTER judge execution (not only at loop-top)
      if (applyBatchDeadline()) {
        errorCode = 'TIMEOUT';
        break;
      }

      if (!timedOut && status === 'pass') {
        transition('done', 'judgmentStatus=pass');
        break;
      }

      if (!timedOut && status === 'fail') {
        consecutiveFails++;
        lastWasTimeout = false;
      }
      if (timedOut) {
        consecutiveFails++;
      }

      // Can retry?
      if (retryCount < this.opts.maxRetries) {
        retryCount++;
        transition('retried', `retry ${retryCount}/${this.opts.maxRetries}`);

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
      if (lastWasTimeout) {
        errorCode = 'TIMEOUT';
      }

      // Precedence: goto > escalation
      if (this.opts.onFail?.goto) {
        const target = this.opts.onFail.goto;
        if (input.validTargets?.includes(target)) {
          nextStep = target;
          transition('done', `goto(${target})`);
        } else {
          errorCode = 'GOTO_TARGET_NOT_FOUND';
          trace.push(`goto target "${target}" not found in validTargets`);
        }
        break;
      }

      // Escalation check (only if goto not applied)
      const threshold = this.opts.onFail?.escalateAfterConsecutiveFails ?? 2;
      if (consecutiveFails >= threshold) {
        transition('needs-human-review', `consecutiveFails(${consecutiveFails}) >= threshold(${threshold})`);
      } else if (this.opts.onFail?.escalateAfterConsecutiveFails !== undefined) {
        // Escalation was configured but threshold not met
        errorCode = 'ESCALATION_FAILED';
      }

      break;
    }

    return { runId, runState, retryCount, nextStep, errorCode, decisionTrace: trace };
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

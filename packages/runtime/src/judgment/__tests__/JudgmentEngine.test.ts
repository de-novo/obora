import { describe, it, expect, vi } from 'vitest';
import { JudgmentEngine } from '../JudgmentEngine.js';
import type { EngineOptions, StepInput } from '../types.js';

function makeOpts(overrides: Partial<EngineOptions> = {}): EngineOptions {
  return {
    timeoutMs: 5000,
    batchDeadlineMs: 0,
    maxRetries: 2,
    backoffMs: 0,
    ...overrides,
  };
}

function step(overrides: Partial<StepInput> = {}): StepInput {
  return { stepId: 'step-1', ...overrides };
}

describe('JudgmentEngine', () => {
  // 1. pass: running -> done
  it('pass: running -> done', async () => {
    const engine = new JudgmentEngine(makeOpts(), async () => 'pass');
    const r = await engine.run(step());
    expect(r.runState).toBe('done');
    expect(r.retryCount).toBe(0);
    expect(r.decisionTrace.some(t => t.includes('->done: judgmentStatus=pass'))).toBe(true);
  });

  // 2. fail then pass: retried -> done
  it('fail then pass: retried -> done', async () => {
    let call = 0;
    const engine = new JudgmentEngine(makeOpts(), async () => {
      call++;
      return call <= 1 ? 'fail' : 'pass';
    });
    const r = await engine.run(step());
    expect(r.runState).toBe('done');
    expect(r.retryCount).toBe(1);
    expect(r.decisionTrace.some(t => t.includes('->retried'))).toBe(true);
  });

  // 3. timeout then pass: timeout -> retried -> done
  it('timeout then pass: timeout -> retried -> done', async () => {
    let call = 0;
    const engine = new JudgmentEngine(makeOpts({ timeoutMs: 10 }), async () => {
      call++;
      if (call === 1) {
        await new Promise(r => setTimeout(r, 50));
      }
      return 'pass';
    });
    const r = await engine.run(step());
    expect(r.runState).toBe('done');
    expect(r.retryCount).toBe(1);
    expect(r.decisionTrace.some(t => t.includes('->timeout'))).toBe(true);
  });

  // 4. retry exhausted + goto valid: failed -> done(nextStep)
  it('retry exhausted + goto valid: failed -> done(nextStep)', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 0, onFail: { goto: 'step-2' } }),
      async () => 'fail',
    );
    const r = await engine.run(step({ validTargets: ['step-2'] }));
    expect(r.runState).toBe('done');
    expect(r.nextStep).toBe('step-2');
    expect(r.decisionTrace.some(t => t.includes('->failed'))).toBe(true);
    expect(r.decisionTrace.some(t => t.includes('->done: goto(step-2)'))).toBe(true);
  });

  // 5. retry exhausted no goto: failed
  it('retry exhausted no goto: failed', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 0 }),
      async () => 'fail',
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('failed');
    expect(r.retryCount).toBe(0);
  });

  // 6. retry exhausted + goto invalid: failed(GOTO_TARGET_NOT_FOUND)
  it('retry exhausted + goto invalid: GOTO_TARGET_NOT_FOUND', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 0, onFail: { goto: 'nonexistent' } }),
      async () => 'fail',
    );
    const r = await engine.run(step({ validTargets: ['step-2'] }));
    expect(r.runState).toBe('failed');
    expect(r.errorCode).toBe('GOTO_TARGET_NOT_FOUND');
  });

  // 7. consecutive fails >= threshold: needs-human-review
  it('consecutive fails >= threshold: needs-human-review', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 1, onFail: { escalateAfterConsecutiveFails: 2 } }),
      async () => 'fail',
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('needs-human-review');
  });

  // 8. human approve/reject
  it('human approve: needs-human-review -> done', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 1, onFail: { escalateAfterConsecutiveFails: 2 } }),
      async () => 'fail',
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('needs-human-review');
    const resolved = engine.resolveHuman(r, { action: 'approve' });
    expect(resolved.runState).toBe('done');
  });

  it('human reject: needs-human-review -> failed', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ maxRetries: 1, onFail: { escalateAfterConsecutiveFails: 2 } }),
      async () => 'fail',
    );
    const r = await engine.run(step());
    const resolved = engine.resolveHuman(r, { action: 'reject' });
    expect(resolved.runState).toBe('failed');
  });

  // 9. skip condition: running -> skipped
  it('skip condition: running -> skipped', async () => {
    const engine = new JudgmentEngine(makeOpts(), async () => 'pass');
    const r = await engine.run(step({ skipCondition: true }));
    expect(r.runState).toBe('skipped');
  });

  // 10. batch deadline exceeded: deterministic timeout
  it('batch deadline exceeded: timeout', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ batchDeadlineMs: 1, timeoutMs: 5000, maxRetries: 0 }),
      async () => {
        // Sleep long enough to guarantee batchDeadline (1ms) is exceeded
        await new Promise(r => setTimeout(r, 20));
        return 'pass';
      },
    );
    const r = await engine.run(step());
    // Post-judge batchDeadline check catches running state -> timeout deterministically
    expect(r.runState).toBe('timeout');
    expect(r.errorCode).toBe('TIMEOUT');
  });

  // 11. goto takes precedence over escalation
  it('goto precedence over escalation', async () => {
    const engine = new JudgmentEngine(
      makeOpts({
        maxRetries: 1,
        onFail: { goto: 'step-3', escalateAfterConsecutiveFails: 2 },
      }),
      async () => 'fail',
    );
    const r = await engine.run(step({ validTargets: ['step-3'] }));
    expect(r.runState).toBe('done');
    expect(r.nextStep).toBe('step-3');
  });

  // 12. batchDeadline preserves failed state
  it('batchDeadline preserves failed state', async () => {
    let call = 0;
    const engine = new JudgmentEngine(
      makeOpts({ batchDeadlineMs: 5, maxRetries: 0 }),
      async () => {
        call++;
        return 'fail';
      },
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('failed');
  });

  // 13. structured transition logging
  it('logger receives transition events', async () => {
    const logs: any[] = [];
    const logger = { transition(log: any) { logs.push(log); } };
    const engine = new JudgmentEngine(makeOpts(), async () => 'pass', logger);
    await engine.run(step());
    expect(logs.length).toBeGreaterThanOrEqual(2);
    expect(logs[0]).toHaveProperty('from', 'queued');
    expect(logs[0]).toHaveProperty('to', 'running');
  });

  // 14. deterministic decisionTrace for same input
  it('deterministic trace for same input', async () => {
    const judge = async () => 'pass' as const;
    const e1 = new JudgmentEngine(makeOpts(), judge);
    const e2 = new JudgmentEngine(makeOpts(), judge);
    const r1 = await e1.run(step());
    const r2 = await e2.run(step());
    expect(r1.decisionTrace).toEqual(r2.decisionTrace);
  });

  // 15. ESCALATION_FAILED: escalation configured but threshold not met
  it('ESCALATION_FAILED when threshold not met', async () => {
    const engine = new JudgmentEngine(
      makeOpts({
        maxRetries: 0,
        onFail: { escalateAfterConsecutiveFails: 5 },
      }),
      async () => 'fail',
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('failed');
    expect(r.errorCode).toBe('ESCALATION_FAILED');
  });

  // 16. TIMEOUT errorCode on step timeout with retries exhausted
  it('step timeout sets TIMEOUT errorCode', async () => {
    const engine = new JudgmentEngine(
      makeOpts({ timeoutMs: 10, maxRetries: 0 }),
      async () => {
        await new Promise(r => setTimeout(r, 50));
        return 'pass';
      },
    );
    const r = await engine.run(step());
    // timeout is transient; retries exhausted -> failed, but errorCode distinguishes cause
    expect(r.runState).toBe('failed');
    expect(r.errorCode).toBe('TIMEOUT');
    expect(r.decisionTrace.some(t => t.includes('->timeout'))).toBe(true);
  });

  // 17. step timeout retried then pass has no TIMEOUT errorCode
  it('timeout retried then pass: no TIMEOUT errorCode', async () => {
    let call = 0;
    const engine = new JudgmentEngine(
      makeOpts({ timeoutMs: 10, maxRetries: 1 }),
      async () => {
        call++;
        if (call === 1) await new Promise(r => setTimeout(r, 50));
        return 'pass';
      },
    );
    const r = await engine.run(step());
    expect(r.runState).toBe('done');
    expect(r.errorCode).toBeUndefined();
  });
});

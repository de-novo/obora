import { describe, expect, it } from 'vitest';

import { formatRepairLoopBadge, getRepairLoopState, getRepairLoopSummary, getRepairLoopTone, truncateValidationSummary } from '../components/repair-loop-utils';

describe('repair-loop-utils', () => {
  it('extracts persisted repairLoop metadata from a run record', () => {
    const summary = getRepairLoopSummary({
      metadata: {
        repairLoop: {
          validationFailed: 1,
          validationPassed: 1,
          repairStarted: 1,
          repairCompleted: 1,
          repairNoProgress: 0,
          backEdgeTriggered: 1,
          backEdgeExhausted: 0,
          lastValidationSummary: 'Validation passed',
          recentValidationFailures: [],
        },
      },
    } as any);

    expect(summary).toMatchObject({
      validationFailed: 1,
      validationPassed: 1,
      repairStarted: 1,
      repairCompleted: 1,
      lastValidationSummary: 'Validation passed',
    });
  });

  it('formats repair-loop badges compactly', () => {
    const badge = formatRepairLoopBadge({
      validationFailed: 2,
      validationPassed: 1,
      repairStarted: 2,
      repairCompleted: 2,
      repairNoProgress: 1,
      backEdgeTriggered: 2,
      backEdgeExhausted: 0,
      recentValidationFailures: [],
    });

    expect(badge).toBe('fail 2 · repair 2 · pass 1 · stalled 1');
  });

  it('derives state and tone for stalled / exhausted / converged flows', () => {
    expect(
      getRepairLoopState({
        validationFailed: 2,
        validationPassed: 0,
        repairStarted: 2,
        repairCompleted: 1,
        repairNoProgress: 1,
        backEdgeTriggered: 2,
        backEdgeExhausted: 0,
        recentValidationFailures: [],
      }),
    ).toBe('stalled');

    expect(
      getRepairLoopTone({
        validationFailed: 3,
        validationPassed: 1,
        repairStarted: 3,
        repairCompleted: 3,
        repairNoProgress: 0,
        backEdgeTriggered: 3,
        backEdgeExhausted: 1,
        recentValidationFailures: [],
      })?.label,
    ).toBe('exhausted');

    expect(
      getRepairLoopState({
        validationFailed: 2,
        validationPassed: 1,
        repairStarted: 2,
        repairCompleted: 2,
        repairNoProgress: 0,
        backEdgeTriggered: 2,
        backEdgeExhausted: 0,
        recentValidationFailures: [],
      }),
    ).toBe('converged');
  });

  it('truncates long validation summaries', () => {
    expect(truncateValidationSummary('short summary', 20)).toBe('short summary');
    expect(truncateValidationSummary('this is a very long validation summary that should be trimmed', 20)).toBe('this is a very long…');
  });
});

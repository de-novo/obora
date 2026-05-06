import { describe, expect, it } from 'vitest';

import {
  formatRepairLoopBadge,
  getRepairLoopState,
  getRepairLoopSummary,
  getRepairLoopTone,
  truncateValidationSummary,
} from '../components/repair-loop-utils';
import type { PersistedRepairLoopSummary } from '../../shared/history-types';

const repairSummary = (overrides: Partial<PersistedRepairLoopSummary> = {}): PersistedRepairLoopSummary => ({
  validationFailed: 0,
  validationPassed: 0,
  repairStarted: 0,
  repairCompleted: 0,
  repairNoProgress: 0,
  backEdgeTriggered: 0,
  backEdgeExhausted: 0,
  recentValidationFailures: [],
  ...overrides,
});

describe('repair-loop-utils', () => {
  it('extracts persisted repairLoop metadata from a run record', () => {
    const summary = getRepairLoopSummary({
      metadata: {
        repairLoop: repairSummary({
          validationFailed: 1,
          validationPassed: 1,
          repairStarted: 1,
          repairCompleted: 1,
          lastValidationSummary: 'Validation passed',
        }),
      },
    });

    expect(summary).toMatchObject({
      validationFailed: 1,
      validationPassed: 1,
      repairStarted: 1,
      repairCompleted: 1,
      lastValidationSummary: 'Validation passed',
    });
  });

  it('prefers explicit repairLoop summaries and rejects invalid metadata shapes', () => {
    const direct = repairSummary({ validationPassed: 1 });

    expect(getRepairLoopSummary({ repairLoop: direct, metadata: { repairLoop: repairSummary({ validationFailed: 1 }) } })).toBe(
      direct,
    );
    expect(getRepairLoopSummary({})).toBeUndefined();
    expect(getRepairLoopSummary({ metadata: [] as unknown as Record<string, unknown> })).toBeUndefined();
    expect(getRepairLoopSummary({ metadata: { repairLoop: [] } })).toBeUndefined();
  });

  it('formats repair-loop badges compactly', () => {
    const badge = formatRepairLoopBadge(
      repairSummary({ validationFailed: 2, validationPassed: 1, repairStarted: 2, repairCompleted: 2, repairNoProgress: 1 }),
    );

    expect(badge).toBe('fail 2 · repair 2 · pass 1 · stalled 1');
    expect(formatRepairLoopBadge(repairSummary({ backEdgeExhausted: 1 }))).toBe('exhausted 1');
    expect(formatRepairLoopBadge(repairSummary())).toBeUndefined();
    expect(formatRepairLoopBadge(undefined)).toBeUndefined();
  });

  it('derives state and tone for stalled / exhausted / converged flows', () => {
    expect(
      getRepairLoopState(repairSummary({ validationFailed: 2, repairStarted: 2, repairCompleted: 1, repairNoProgress: 1 })),
    ).toBe('stalled');
    expect(
      getRepairLoopTone(
        repairSummary({ validationFailed: 3, validationPassed: 1, repairStarted: 3, repairCompleted: 3, backEdgeExhausted: 1 }),
      )?.label,
    ).toBe('exhausted');
    expect(getRepairLoopState(repairSummary({ validationFailed: 2, validationPassed: 1, repairStarted: 2, repairCompleted: 2 }))).toBe(
      'converged',
    );
  });

  it('derives state and tone for repaired and passed flows', () => {
    expect(getRepairLoopTone(repairSummary({ repairStarted: 1 }))?.label).toBe('repaired');
    expect(getRepairLoopTone(repairSummary({ repairCompleted: 1 }))?.label).toBe('repaired');
    expect(getRepairLoopTone(repairSummary())?.label).toBe('passed');
    expect(getRepairLoopState(undefined)).toBeUndefined();
    expect(getRepairLoopTone(undefined)).toBeUndefined();
  });

  it('truncates long validation summaries', () => {
    expect(truncateValidationSummary('short summary', 20)).toBe('short summary');
    expect(truncateValidationSummary('this is a very long validation summary that should be trimmed', 20)).toBe('this is a very long…');
    expect(truncateValidationSummary(undefined)).toBeUndefined();
    expect(truncateValidationSummary('exactly ten', 11)).toBe('exactly ten');
  });
});

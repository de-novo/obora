import { describe, expect, it } from 'vitest';

import type { HistoryRunSummaryItem, HistoryRunsResponse, PersistedRepairLoopSummary } from '../../shared/history-types';
import {
  buildHistoryRunRowView,
  buildHistoryRunsQuery,
  buildRepairLoopChips,
  getHistoryRunsPagination,
  getStatusBadgeColor,
} from '../pages/history-runs-view-model';

const repairLoop: PersistedRepairLoopSummary = {
  validationFailed: 2,
  validationPassed: 1,
  repairStarted: 2,
  repairCompleted: 1,
  repairNoProgress: 0,
  backEdgeTriggered: 2,
  backEdgeExhausted: 0,
  lastValidationSummary: 'x'.repeat(80),
  recentValidationFailures: [],
};

describe('history runs view model', () => {
  it('builds API query state while preserving invalid numeric input for server validation', () => {
    const query = buildHistoryRunsQuery({
      status: '',
      workflowName: 'daily-close',
      repairLoop: 'stalled',
      from: '2026-02-18',
      to: '',
      costMin: 'abc',
      costMax: '12.5',
      sortBy: 'validationFailed',
      sortOrder: 'asc',
      limit: 50,
      offset: 100,
    });

    expect(query).toMatchObject({
      workflowName: 'daily-close',
      repairLoop: 'stalled',
      from: '2026-02-18',
      costMax: 12.5,
      sortBy: 'validationFailed',
      sortOrder: 'asc',
      limit: 50,
      offset: 100,
    });
    expect(query.status).toBeUndefined();
    expect(query.to).toBeUndefined();
    expect(query.costMin).toBeNaN();
  });

  it('builds repair-loop chips and pagination labels from response counts', () => {
    const data: HistoryRunsResponse = {
      items: [],
      total: 9,
      limit: 3,
      offset: 3,
      repairLoopCounts: {
        all: 9,
        with: 4,
        without: 5,
        stalled: 2,
        exhausted: 1,
      },
    };

    const chips = buildRepairLoopChips(data, 'stalled');
    expect(chips.map((chip) => [chip.value, chip.count, chip.active])).toEqual([
      ['all', 9, false],
      ['with', 4, false],
      ['stalled', 2, true],
      ['exhausted', 1, false],
      ['without', 5, false],
    ]);
    expect(getHistoryRunsPagination(data)).toEqual({
      canPrev: true,
      canNext: true,
      label: 'showing 4-6 / 9',
    });
  });

  it('builds row repair-loop badges and status colors', () => {
    const item: HistoryRunSummaryItem = {
      run: {
        id: 'run-1',
        workflowName: 'wf',
        status: 'completed',
        input: {},
        startedAt: '2026-02-18T00:00:00.000Z',
      },
      repairLoop,
      stepCount: 2,
      costSummary: { totalTokens: 20, totalCostUsd: 0.2, byStep: [], byModel: [] },
    };

    const row = buildHistoryRunRowView(item);
    expect(row.repairBadge).toBe('fail 2 · repair 2 · pass 1');
    expect(row.repairTone?.label).toBe('converged');
    expect(row.lastValidation).toHaveLength(56);
    expect(getStatusBadgeColor('completed')).toBe('#15803d');
    expect(getStatusBadgeColor('running')).toBe('#1d4ed8');
  });
});

import type {
  HistoryRunSummaryItem,
  HistoryRunsQuery,
  HistoryRunsResponse,
  RepairLoopFilter,
} from '../../shared/history-types';
import {
  formatRepairLoopBadge,
  getRepairLoopSummary,
  getRepairLoopTone,
  truncateValidationSummary,
  type RepairLoopTone,
} from '../components/repair-loop-utils';

export type HistoryRunsRepairLoopSelection = 'all' | RepairLoopFilter;
export type HistoryRunsSortBy = NonNullable<HistoryRunsQuery['sortBy']>;
export type HistoryRunsSortOrder = NonNullable<HistoryRunsQuery['sortOrder']>;

export interface HistoryRunsFilterState {
  status: string;
  workflowName: string;
  repairLoop: HistoryRunsRepairLoopSelection;
  from: string;
  to: string;
  costMin: string;
  costMax: string;
  sortBy: HistoryRunsSortBy;
  sortOrder: HistoryRunsSortOrder;
  limit: number;
  offset: number;
}

export interface RepairLoopChipView {
  value: HistoryRunsRepairLoopSelection;
  label: string;
  count: number;
  tone: RepairLoopTone;
  active: boolean;
}

export interface HistoryRunRowView {
  repairLoop: ReturnType<typeof getRepairLoopSummary>;
  repairBadge: string | undefined;
  repairTone: RepairLoopTone | undefined;
  lastValidation: string | undefined;
}

export const DEFAULT_HISTORY_RUNS_RESPONSE: HistoryRunsResponse = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
};

const neutralTone: RepairLoopTone = {
  text: '#374151',
  background: '#f9fafb',
  border: '#d1d5db',
  label: 'all',
};

const withoutRepairLoopTone: RepairLoopTone = {
  text: '#4b5563',
  background: '#f3f4f6',
  border: '#d1d5db',
  label: 'without',
};

export const getStatusBadgeColor = (status: string): string => {
  switch (status) {
    case 'completed':
      return '#15803d';
    case 'failed':
      return '#b91c1c';
    case 'suspended':
      return '#92400e';
    default:
      return '#1d4ed8';
  }
};

const parseOptionalCost = (value: string): number | undefined => {
  const trimmed = value.trim();
  return trimmed ? Number(trimmed) : undefined;
};

export const buildHistoryRunsQuery = (state: HistoryRunsFilterState): HistoryRunsQuery => ({
  status: state.status || undefined,
  workflowName: state.workflowName || undefined,
  repairLoop: state.repairLoop === 'all' ? undefined : state.repairLoop,
  from: state.from || undefined,
  to: state.to || undefined,
  costMin: parseOptionalCost(state.costMin),
  costMax: parseOptionalCost(state.costMax),
  sortBy: state.sortBy,
  sortOrder: state.sortOrder,
  limit: state.limit,
  offset: state.offset,
});

export const buildRepairLoopChips = (
  data: HistoryRunsResponse,
  selected: HistoryRunsRepairLoopSelection,
): RepairLoopChipView[] => [
  {
    value: 'all',
    label: 'All runs',
    count: data.repairLoopCounts?.all ?? data.total,
    tone: neutralTone,
    active: selected === 'all',
  },
  {
    value: 'with',
    label: 'Repair loops',
    count: data.repairLoopCounts?.with ?? 0,
    tone: { text: '#1d4ed8', background: '#eff6ff', border: '#93c5fd', label: 'with' },
    active: selected === 'with',
  },
  {
    value: 'stalled',
    label: 'Stalled',
    count: data.repairLoopCounts?.stalled ?? 0,
    tone: { text: '#92400e', background: '#fffbeb', border: '#fcd34d', label: 'stalled' },
    active: selected === 'stalled',
  },
  {
    value: 'exhausted',
    label: 'Exhausted',
    count: data.repairLoopCounts?.exhausted ?? 0,
    tone: { text: '#991b1b', background: '#fef2f2', border: '#fecaca', label: 'exhausted' },
    active: selected === 'exhausted',
  },
  {
    value: 'without',
    label: 'No repair loop',
    count: data.repairLoopCounts?.without ?? 0,
    tone: withoutRepairLoopTone,
    active: selected === 'without',
  },
];

export const buildHistoryRunRowView = (item: HistoryRunSummaryItem): HistoryRunRowView => {
  const repairLoop = getRepairLoopSummary({ ...item.run, repairLoop: item.repairLoop });
  return {
    repairLoop,
    repairBadge: formatRepairLoopBadge(repairLoop),
    repairTone: getRepairLoopTone(repairLoop),
    lastValidation: truncateValidationSummary(repairLoop?.lastValidationSummary, 56),
  };
};

export const getHistoryRunsPagination = (
  data: Pick<HistoryRunsResponse, 'offset' | 'limit' | 'total'>,
): { canPrev: boolean; canNext: boolean; label: string } => ({
  canPrev: data.offset > 0,
  canNext: data.offset + data.limit < data.total,
  label:
    data.total === 0
      ? 'showing 0-0 / 0'
      : `showing ${data.offset + 1}-${Math.min(data.offset + data.limit, data.total)} / ${data.total}`,
});

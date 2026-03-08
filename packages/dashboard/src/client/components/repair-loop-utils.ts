import type { PersistedRepairLoopSummary, RunRecord } from '../../shared/history-types';

export type RepairLoopState = 'exhausted' | 'stalled' | 'converged' | 'repaired' | 'passed';

export interface RepairLoopTone {
  label: string;
  text: string;
  background: string;
  border: string;
}

export function getRepairLoopSummary(
  source: Pick<RunRecord, 'metadata'> & { repairLoop?: PersistedRepairLoopSummary },
): PersistedRepairLoopSummary | undefined {
  if (source.repairLoop) return source.repairLoop;
  const metadata = source.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const repairLoop = (metadata as Record<string, unknown>).repairLoop;
  if (!repairLoop || typeof repairLoop !== 'object' || Array.isArray(repairLoop)) return undefined;
  return repairLoop as PersistedRepairLoopSummary;
}

export function getRepairLoopState(summary: PersistedRepairLoopSummary | undefined): RepairLoopState | undefined {
  if (!summary) return undefined;
  if (summary.backEdgeExhausted > 0) return 'exhausted';
  if (summary.repairNoProgress > 0) return 'stalled';
  if (summary.validationFailed > 0 && summary.validationPassed > 0) return 'converged';
  if (summary.repairStarted > 0 || summary.repairCompleted > 0) return 'repaired';
  return 'passed';
}

export function getRepairLoopTone(summary: PersistedRepairLoopSummary | undefined): RepairLoopTone | undefined {
  const state = getRepairLoopState(summary);
  if (!state) return undefined;

  switch (state) {
    case 'exhausted':
      return { label: 'exhausted', text: '#991b1b', background: '#fef2f2', border: '#fecaca' };
    case 'stalled':
      return { label: 'stalled', text: '#92400e', background: '#fffbeb', border: '#fcd34d' };
    case 'converged':
      return { label: 'converged', text: '#065f46', background: '#ecfdf5', border: '#86efac' };
    case 'repaired':
      return { label: 'repaired', text: '#1d4ed8', background: '#eff6ff', border: '#93c5fd' };
    case 'passed':
      return { label: 'passed', text: '#374151', background: '#f9fafb', border: '#d1d5db' };
    default:
      return undefined;
  }
}

export function formatRepairLoopBadge(summary: PersistedRepairLoopSummary | undefined): string | undefined {
  if (!summary) return undefined;

  const parts: string[] = [];
  if (summary.validationFailed > 0) parts.push(`fail ${summary.validationFailed}`);
  if (summary.repairStarted > 0) parts.push(`repair ${summary.repairStarted}`);
  if (summary.validationPassed > 0) parts.push(`pass ${summary.validationPassed}`);
  if (summary.repairNoProgress > 0) parts.push(`stalled ${summary.repairNoProgress}`);
  if (summary.backEdgeExhausted > 0) parts.push(`exhausted ${summary.backEdgeExhausted}`);

  return parts.length > 0 ? parts.join(' · ') : undefined;
}

export function truncateValidationSummary(summary: string | undefined, max = 72): string | undefined {
  if (!summary) return undefined;
  return summary.length > max ? `${summary.slice(0, max - 1)}…` : summary;
}

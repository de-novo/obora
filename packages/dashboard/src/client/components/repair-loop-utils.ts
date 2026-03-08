import type { RunRecord } from '../../shared/history-types';

export interface ValidationFailureDetail {
  stepName?: string;
  summary?: string;
  errorCode?: string;
  logPath?: string;
  failedChecks: Array<{
    name?: string;
    message?: string;
    severity?: string;
    file?: string;
  }>;
}

export interface PersistedRepairLoopSummary {
  validationFailed: number;
  validationPassed: number;
  repairStarted: number;
  repairCompleted: number;
  repairNoProgress: number;
  backEdgeTriggered: number;
  backEdgeExhausted: number;
  lastValidationSummary?: string;
  lastValidationStep?: string;
  lastRepairStep?: string;
  lastAttempt?: number;
  lastNoProgressReason?: string;
  lastExhaustReason?: string;
  recentValidationFailures: ValidationFailureDetail[];
}

export function getRepairLoopSummary(run: Pick<RunRecord, 'metadata'>): PersistedRepairLoopSummary | undefined {
  const metadata = run.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
  const repairLoop = (metadata as Record<string, unknown>).repairLoop;
  if (!repairLoop || typeof repairLoop !== 'object' || Array.isArray(repairLoop)) return undefined;
  return repairLoop as PersistedRepairLoopSummary;
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

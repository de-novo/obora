import type {
  ArtifactPreviewResponse,
  ArtifactRecord,
  RunDetailResponse,
  StepRecord,
} from '../../shared/history-types';
import { formatArtifactPreview } from '../components/artifact-preview-utils';
import { filterAuditEvents } from '../components/history-utils';
import {
  formatRepairLoopBadge,
  getRepairLoopSummary,
  getRepairLoopTone,
} from '../components/repair-loop-utils';

export type HistoryAuditCategory = 'all' | 'consensus' | 'policy' | 'execution' | 'recovery';

export interface HistoryRunDetailViewModelOptions {
  data: RunDetailResponse;
  selectedStepId?: string;
  auditCategory: HistoryAuditCategory;
  auditActor: string;
  artifactStepFilter: string | null;
  artifactPreview: ArtifactPreviewResponse | null;
  auditOffset: number;
  auditLimit: number;
}

export const resolveSelectedStepId = (
  steps: StepRecord[],
  selectedStepId: string | undefined,
): string | undefined => {
  if (selectedStepId && steps.some((step) => step.id === selectedStepId)) {
    return selectedStepId;
  }
  return steps[0]?.id;
};

export const findSelectedStep = (
  steps: StepRecord[],
  selectedStepId: string | undefined,
): StepRecord | undefined => steps.find((step) => step.id === selectedStepId);

export const filterArtifactsByStep = (
  artifacts: ArtifactRecord[],
  artifactStepFilter: string | null,
): ArtifactRecord[] =>
  artifactStepFilter
    ? artifacts.filter((artifact) => artifact.stepName === artifactStepFilter)
    : artifacts;

export const resolveStepIdByName = (
  steps: StepRecord[],
  stepName?: string,
): string | undefined => {
  if (!stepName) {
    return undefined;
  }
  return steps.find((step) => step.stepName === stepName)?.id;
};

export const getArtifactSectionDescription = (artifactStepFilter: string | null): string =>
  artifactStepFilter
    ? `Showing artifacts for step: ${artifactStepFilter}`
    : 'Showing all persisted artifacts for this run';

export const getAuditPaginationView = (
  data: Pick<RunDetailResponse, 'pagination'>,
  auditOffset: number,
  auditLimit: number,
): { canPrev: boolean; canNext: boolean; label: string } | undefined => {
  if (!data.pagination) {
    return undefined;
  }

  return {
    canPrev: auditOffset > 0,
    canNext: auditOffset + auditLimit < data.pagination.auditTotal,
    label: `${auditOffset + 1}-${Math.min(auditOffset + auditLimit, data.pagination.auditTotal)} / ${data.pagination.auditTotal}`,
  };
};

export const buildHistoryRunDetailViewModel = ({
  data,
  selectedStepId,
  auditCategory,
  auditActor,
  artifactStepFilter,
  artifactPreview,
  auditOffset,
  auditLimit,
}: HistoryRunDetailViewModelOptions) => {
  const selectedStep = findSelectedStep(data.steps, selectedStepId);
  const repairLoop = getRepairLoopSummary({ ...data.run, repairLoop: data.repairLoop });

  return {
    selectedStep,
    filteredAudit: filterAuditEvents(data.auditTimeline, {
      category: auditCategory,
      actor: auditActor,
    }),
    repairLoop,
    repairBadge: formatRepairLoopBadge(repairLoop),
    repairTone: getRepairLoopTone(repairLoop),
    filteredArtifacts: filterArtifactsByStep(data.artifacts, artifactStepFilter),
    artifactDescription: getArtifactSectionDescription(artifactStepFilter),
    formattedArtifactPreview: artifactPreview?.supported ? formatArtifactPreview(artifactPreview) : null,
    auditPagination: getAuditPaginationView(data, auditOffset, auditLimit),
  };
};

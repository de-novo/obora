import { describe, expect, it } from 'vitest';

import type { RunDetailResponse } from '../../shared/history-types';
import {
  buildHistoryRunDetailViewModel,
  filterArtifactsByStep,
  getArtifactSectionDescription,
  getAuditPaginationView,
  resolveSelectedStepId,
  resolveStepIdByName,
} from '../pages/history-run-detail-view-model';

const detail: RunDetailResponse = {
  run: {
    id: 'run-1',
    workflowName: 'wf',
    status: 'suspended',
    input: {},
    startedAt: '2026-02-18T00:00:00.000Z',
  },
  repairLoop: {
    validationFailed: 1,
    validationPassed: 0,
    repairStarted: 1,
    repairCompleted: 0,
    repairNoProgress: 1,
    backEdgeTriggered: 1,
    backEdgeExhausted: 0,
    lastValidationSummary: 'needs repair',
    recentValidationFailures: [],
  },
  steps: [
    { id: 'step-1', runId: 'run-1', stepName: 'draft', status: 'completed', startedAt: '2026-02-18T00:00:00.000Z' },
    { id: 'step-2', runId: 'run-1', stepName: 'review', status: 'failed', startedAt: '2026-02-18T00:01:00.000Z' },
  ],
  artifacts: [
    {
      id: 'artifact-1',
      runId: 'run-1',
      stepName: 'draft',
      name: 'draft.json',
      mimeType: 'application/json',
      sizeBytes: 13,
      storageRef: '/tmp/draft.json',
      createdAt: '2026-02-18T00:00:10.000Z',
    },
    {
      id: 'artifact-2',
      runId: 'run-1',
      stepName: 'review',
      name: 'review.txt',
      mimeType: 'text/plain',
      sizeBytes: 4,
      storageRef: '/tmp/review.txt',
      createdAt: '2026-02-18T00:01:10.000Z',
    },
  ],
  costSummary: { totalTokens: 10, totalCostUsd: 0.1, byStep: [], byModel: [] },
  auditTimeline: [
    {
      id: 'audit-1',
      runId: 'run-1',
      stepName: 'draft',
      timestamp: '2026-02-18T00:00:00.000Z',
      category: 'execution',
      action: 'step_start',
      actor: 'system',
      detail: {},
    },
    {
      id: 'audit-2',
      runId: 'run-1',
      stepName: 'review',
      timestamp: '2026-02-18T00:01:00.000Z',
      category: 'policy',
      action: 'policy_check',
      actor: 'policy-engine',
      detail: {},
    },
  ],
  checkpoints: [],
  pagination: { auditTotal: 250, auditLimit: 100, auditOffset: 100 },
};

describe('history run detail view model', () => {
  it('resolves selected steps and step-name jump targets', () => {
    expect(resolveSelectedStepId(detail.steps, undefined)).toBe('step-1');
    expect(resolveSelectedStepId(detail.steps, 'step-2')).toBe('step-2');
    expect(resolveSelectedStepId(detail.steps, 'missing')).toBe('step-1');
    expect(resolveStepIdByName(detail.steps, 'review')).toBe('step-2');
    expect(resolveStepIdByName(detail.steps, undefined)).toBeUndefined();
  });

  it('filters artifacts and builds section copy', () => {
    expect(filterArtifactsByStep(detail.artifacts, null)).toHaveLength(2);
    expect(filterArtifactsByStep(detail.artifacts, 'review')).toEqual([detail.artifacts[1]]);
    expect(getArtifactSectionDescription('review')).toBe('Showing artifacts for step: review');
    expect(getArtifactSectionDescription(null)).toBe('Showing all persisted artifacts for this run');
  });

  it('builds derived repair, audit, artifact, and pagination state', () => {
    const view = buildHistoryRunDetailViewModel({
      data: detail,
      selectedStepId: 'step-2',
      auditCategory: 'policy',
      auditActor: 'policy-engine',
      artifactStepFilter: 'draft',
      artifactPreview: {
        artifact: detail.artifacts[0]!,
        supported: true,
        contentType: 'application/json',
        text: '{"ok":true}',
      },
      auditOffset: 100,
      auditLimit: 100,
    });

    expect(view.selectedStep?.id).toBe('step-2');
    expect(view.filteredAudit.map((event) => event.id)).toEqual(['audit-2']);
    expect(view.repairTone?.label).toBe('stalled');
    expect(view.repairBadge).toBe('fail 1 · repair 1 · stalled 1');
    expect(view.filteredArtifacts).toEqual([detail.artifacts[0]]);
    expect(view.formattedArtifactPreview?.mode).toBe('json');
    expect(view.auditPagination).toEqual({
      canPrev: true,
      canNext: true,
      label: '101-200 / 250',
    });
  });

  it('omits audit pagination when the API did not return pagination metadata', () => {
    expect(getAuditPaginationView({ pagination: undefined }, 0, 100)).toBeUndefined();
  });
});

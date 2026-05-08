import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';

import {
  fetchHistoryArtifactPreview,
  fetchHistoryRunDetail,
  getHistoryArtifactRawUrl,
  resumeHistoryRun,
  type ArtifactPreviewResponse,
  type ArtifactRecord,
  type RunDetailResponse,
} from '../api/history-client';
import { toPrettyJson } from '../components/history-utils';
import {
  buildHistoryRunDetailViewModel,
  resolveSelectedStepId,
  resolveStepIdByName,
  type HistoryAuditCategory,
} from './history-run-detail-view-model';

interface Props {
  runId: string;
  onBack: () => void;
}

export const HistoryRunDetailPage = ({ runId, onBack }: Props): ReactElement => {
  const [data, setData] = useState<RunDetailResponse | undefined>(undefined);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined);
  const [auditCategory, setAuditCategory] = useState<HistoryAuditCategory>('all');
  const [auditActor, setAuditActor] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [showDriftModal, setShowDriftModal] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [artifactStepFilter, setArtifactStepFilter] = useState<string | null>(null);
  const [artifactPreview, setArtifactPreview] = useState<ArtifactPreviewResponse | null>(null);
  const [artifactPreviewLoadingId, setArtifactPreviewLoadingId] = useState<string | null>(null);
  const [wrapArtifactPreview, setWrapArtifactPreview] = useState(true);
  const auditLimit = 100;

  useEffect(() => {
    let active = true;
    void fetchHistoryRunDetail(runId, { auditLimit, auditOffset })
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(undefined);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load run detail');
      });

    return () => {
      active = false;
    };
  }, [auditLimit, auditOffset, runId]);

  useEffect(() => {
    setAuditOffset(0);
    setSelectedStepId(undefined);
  }, [runId]);

  useEffect(() => {
    if (!data) return;
    const resolvedStepId = resolveSelectedStepId(data.steps, selectedStepId);
    if (resolvedStepId === selectedStepId) return;
    setSelectedStepId(resolvedStepId);
  }, [data, selectedStepId]);

  const resume = async (): Promise<void> => {
    try {
      await resumeHistoryRun(runId);
      const latest = await fetchHistoryRunDetail(runId, { auditLimit, auditOffset });
      setData(latest);
      setError(undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume run');
    }
  };

  if (error) {
    return (
      <section>
        <button type="button" onClick={onBack}>← Back</button>
        <p style={{ color: '#b91c1c' }}>{error}</p>
      </section>
    );
  }

  if (!data) {
    return <p>Loading run detail...</p>;
  }

  const run = data.run;
  const view = buildHistoryRunDetailViewModel({
    data,
    selectedStepId,
    auditCategory,
    auditActor,
    artifactStepFilter,
    artifactPreview,
    auditOffset,
    auditLimit,
  });

  const jumpToArtifactSection = (stepName?: string) => {
    setArtifactStepFilter(stepName ?? null);
    requestAnimationFrame(() => {
      document.getElementById('artifacts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openArtifactPreview = async (artifact: ArtifactRecord) => {
    setArtifactPreviewLoadingId(artifact.id);
    try {
      const preview = await fetchHistoryArtifactPreview(run.id, artifact.id);
      setWrapArtifactPreview(true);
      setArtifactPreview(preview);
    } catch (previewError) {
      setArtifactPreview({
        artifact,
        supported: false,
        reason: previewError instanceof Error ? previewError.message : 'Preview failed',
      });
    } finally {
      setArtifactPreviewLoadingId(null);
    }
  };

  const jumpToStep = (stepName?: string) => {
    const targetStepId = resolveStepIdByName(data.steps, stepName);
    if (!targetStepId) return;
    setSelectedStepId(targetStepId);
    requestAnimationFrame(() => {
      document.getElementById('step-drilldown-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <section>
      <button type="button" onClick={onBack}>← Back</button>
      <h2 style={{ marginBottom: '6px' }}>Run Detail / {run.id}</h2>
      <p style={{ color: '#6b7280', marginTop: 0 }}>{run.workflowName} · {run.status}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>Started<br />{new Date(run.startedAt).toLocaleString()}</div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>Completed<br />{run.completedAt ? new Date(run.completedAt).toLocaleString() : '-'}</div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>Total Cost<br />${data.costSummary.totalCostUsd.toFixed(4)}</div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px' }}>Total Tokens<br />{data.costSummary.totalTokens.toLocaleString()}</div>
      </div>

      {view.repairLoop ? (
        <div style={{ border: `1px solid ${view.repairTone?.border ?? '#e5e7eb'}`, borderRadius: '10px', padding: '12px', marginBottom: '12px', background: view.repairTone?.background ?? '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Repair Loop</h3>
                {view.repairTone ? (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: view.repairTone.text,
                      background: '#fff',
                      border: `1px solid ${view.repairTone.border}`,
                      borderRadius: '999px',
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {view.repairTone.label}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '4px 0 0', color: view.repairTone?.text ?? '#6b7280', fontSize: '13px', fontWeight: 600 }}>
                {view.repairBadge ?? 'validation-repair activity recorded'}
              </p>
            </div>
            {view.repairLoop.lastValidationSummary ? (
              <span style={{ fontSize: '12px', color: '#6b7280', maxWidth: '420px', textAlign: 'right' }}>
                {view.repairLoop.lastValidationSummary}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Validation Failed<br />{view.repairLoop.validationFailed}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Validation Passed<br />{view.repairLoop.validationPassed}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Repair Started<br />{view.repairLoop.repairStarted}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Repair Completed<br />{view.repairLoop.repairCompleted}</div>
          </div>

          <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '13px', color: '#374151' }}>
            {view.repairLoop.lastAttempt !== undefined ? <div>Last attempt: {view.repairLoop.lastAttempt}</div> : null}
            {view.repairLoop.lastValidationStep ? <div>Last validator: {view.repairLoop.lastValidationStep}</div> : null}
            {view.repairLoop.lastRepairStep ? <div>Last repair step: {view.repairLoop.lastRepairStep}</div> : null}
            {view.repairLoop.lastNoProgressReason ? <div>No-progress reason: {view.repairLoop.lastNoProgressReason}</div> : null}
            {view.repairLoop.lastExhaustReason ? <div>Exhaust reason: {view.repairLoop.lastExhaustReason}</div> : null}
          </div>

          {view.repairLoop.recentValidationFailures.length > 0 ? (
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ margin: '0 0 8px' }}>Recent Validation Failures</h4>
              <div style={{ display: 'grid', gap: '8px' }}>
                {view.repairLoop.recentValidationFailures.map((failure, index) => (
                  <div key={`${failure.stepName ?? 'validate'}-${index}`} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>
                    <div style={{ fontWeight: 600 }}>{failure.stepName ?? 'validate'}{failure.summary ? ` — ${failure.summary}` : ''}</div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' }}>
                      {failure.stepName ? (
                        <button type="button" onClick={() => jumpToStep(failure.stepName)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                          Jump to step
                        </button>
                      ) : null}
                      {failure.stepName ? (
                        <button type="button" onClick={() => jumpToArtifactSection(failure.stepName)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                          Show artifacts
                        </button>
                      ) : null}
                    </div>
                    {failure.logPath ? <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>log: {failure.logPath}</div> : null}
                    {failure.failedChecks.length > 0 ? (
                      <ul style={{ margin: '8px 0 0', paddingLeft: '18px' }}>
                        {failure.failedChecks.slice(0, 3).map((check, checkIndex) => (
                          <li key={`${failure.stepName ?? 'validate'}-${index}-${checkIndex}`} style={{ fontSize: '13px' }}>
                            {check.name ?? 'check'}{check.file ? ` [${check.file}]` : ''}{check.message ? `: ${check.message}` : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {run.status === 'suspended' ? (
        <div style={{ marginBottom: '12px' }}>
          <button type="button" onClick={() => setShowDriftModal(true)}>Resume run</button>
        </div>
      ) : null}

      {showDriftModal ? (
        <div style={{ border: '1px solid #f59e0b', borderRadius: '8px', background: '#fffbeb', padding: '12px', marginBottom: '12px' }}>
          <strong>Policy drift warning</strong>
          <p style={{ marginTop: '8px' }}>The checkpoint policy may differ from the current policy. Do you want to continue resuming?</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" onClick={() => { void resume().finally(() => setShowDriftModal(false)); }}>Yes, resume</button>
            <button type="button" onClick={() => setShowDriftModal(false)}>Cancel</button>
          </div>
        </div>
      ) : null}

      <div id="artifacts-section" style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <div>
            <h3 style={{ margin: 0 }}>Artifacts</h3>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '13px' }}>
              {view.artifactDescription}
            </p>
          </div>
          {artifactStepFilter ? (
            <button type="button" onClick={() => setArtifactStepFilter(null)} style={{ fontSize: '12px', cursor: 'pointer' }}>
              Clear filter
            </button>
          ) : null}
        </div>

        {view.filteredArtifacts.length === 0 ? (
          <p style={{ color: '#6b7280', margin: 0 }}>No artifacts found for the current selection.</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {view.filteredArtifacts.map((artifact: ArtifactRecord) => (
              <div key={artifact.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div>
                    <button
                      type="button"
                      onClick={() => void openArtifactPreview(artifact)}
                      style={{ fontWeight: 600, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: '#1d4ed8' }}
                    >
                      {artifact.name}
                    </button>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{artifact.stepName} · {artifact.mimeType} · {artifact.sizeBytes} bytes</div>
                  </div>
                  <button type="button" onClick={() => jumpToStep(artifact.stepName)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                    Jump to step
                  </button>
                </div>
                <div style={{ marginTop: '6px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" onClick={() => void openArtifactPreview(artifact)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                    {artifactPreviewLoadingId === artifact.id ? 'Loading preview…' : 'Preview'}
                  </button>
                  <a href={getHistoryArtifactRawUrl(run.id, artifact.id)} target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>
                    Open raw
                  </a>
                  <a href={getHistoryArtifactRawUrl(run.id, artifact.id, { download: true })} style={{ fontSize: '12px' }}>
                    Download
                  </a>
                  <span style={{ fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>
                    storage: {artifact.storageRef}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ marginBottom: '8px' }}>Step Timeline</h3>
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
          {data.steps.map((step) => (
            <button
              key={step.id}
              type="button"
              onClick={() => setSelectedStepId(step.id)}
              style={{
                minWidth: '140px',
                padding: '8px',
                borderRadius: '8px',
                border: step.id === selectedStepId ? '2px solid #2563eb' : '1px solid #d1d5db',
                background: '#fff',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 600 }}>{step.stepName}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{step.status}</div>
              <div style={{ fontSize: '11px', color: '#6b7280' }}>{step.durationMs ? `${step.durationMs}ms` : '-'}</div>
            </button>
          ))}
        </div>
      </div>

      {artifactPreview ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(17, 24, 39, 0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            zIndex: 50,
          }}
          onClick={() => setArtifactPreview(null)}
        >
          <div
            style={{
              width: 'min(1000px, 92vw)',
              maxHeight: '80vh',
              overflow: 'auto',
              background: '#fff',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
              padding: '16px',
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
              <div>
                <h3 style={{ margin: 0 }}>{artifactPreview.artifact.name}</h3>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '13px' }}>
                  {artifactPreview.artifact.stepName} · {artifactPreview.artifact.mimeType} · {artifactPreview.artifact.sizeBytes} bytes
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <a href={getHistoryArtifactRawUrl(run.id, artifactPreview.artifact.id)} target="_blank" rel="noreferrer" style={{ fontSize: '12px' }}>
                  Open raw
                </a>
                <a href={getHistoryArtifactRawUrl(run.id, artifactPreview.artifact.id, { download: true })} style={{ fontSize: '12px' }}>
                  Download
                </a>
                <button type="button" onClick={() => setArtifactPreview(null)} style={{ cursor: 'pointer' }}>
                  Close
                </button>
              </div>
            </div>

            {artifactPreview.supported && view.formattedArtifactPreview ? (
              <>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: view.formattedArtifactPreview.mode === 'json' ? '#1d4ed8' : '#374151', background: view.formattedArtifactPreview.mode === 'json' ? '#eff6ff' : '#f3f4f6', border: `1px solid ${view.formattedArtifactPreview.mode === 'json' ? '#93c5fd' : '#d1d5db'}`, borderRadius: '999px', padding: '2px 8px', textTransform: 'uppercase' }}>
                    {view.formattedArtifactPreview.mode}
                  </span>
                  <span style={{ fontSize: '12px', color: '#6b7280' }}>{view.formattedArtifactPreview.lineCount} lines</span>
                  <button type="button" onClick={() => setWrapArtifactPreview((current) => !current)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                    {wrapArtifactPreview ? 'Disable wrap' : 'Enable wrap'}
                  </button>
                </div>
                <div style={{ border: '1px solid #1f2937', borderRadius: '8px', overflow: 'hidden', background: '#0b1020' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px 1fr', alignItems: 'stretch' }}>
                    <div style={{ background: '#111827', color: '#94a3b8', fontSize: '12px', padding: '12px 8px', textAlign: 'right', userSelect: 'none' }}>
                      {view.formattedArtifactPreview.lines.map((_, index) => (
                        <div key={index} style={{ lineHeight: 1.5 }}>{index + 1}</div>
                      ))}
                    </div>
                    <pre style={{ whiteSpace: wrapArtifactPreview ? 'pre-wrap' : 'pre', overflowX: 'auto', wordBreak: wrapArtifactPreview ? 'break-word' : 'normal', margin: 0, padding: '12px', color: '#e5eefb', fontSize: '12px', lineHeight: 1.5 }}>
                      {view.formattedArtifactPreview.displayText}
                    </pre>
                  </div>
                </div>
                {artifactPreview.truncated ? (
                  <p style={{ margin: '8px 0 0', color: '#92400e', fontSize: '12px' }}>
                    Preview truncated for readability.
                  </p>
                ) : null}
              </>
            ) : (
              <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', background: '#fafafa' }}>
                <p style={{ margin: 0, color: '#6b7280' }}>{artifactPreview.reason ?? 'Preview unavailable'}</p>
                <p style={{ margin: '8px 0 0', fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>
                  storage: {artifactPreview.artifact.storageRef}
                </p>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {view.selectedStep ? (
        <div id="step-drilldown-section" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '12px' }}>
          <div>
            <h3>Step Drilldown</h3>
            <p style={{ marginBottom: '6px' }}>Input</p>
            <pre style={{ background: '#111827', color: '#f9fafb', padding: '10px', borderRadius: '8px', overflowX: 'auto' }}>{toPrettyJson(view.selectedStep.input)}</pre>
            <p style={{ marginBottom: '6px' }}>Output</p>
            <pre style={{ background: '#111827', color: '#f9fafb', padding: '10px', borderRadius: '8px', overflowX: 'auto' }}>{toPrettyJson(view.selectedStep.output)}</pre>
            {view.selectedStep.error ? (
              <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', padding: '10px', marginTop: '8px' }}>
                <strong>{view.selectedStep.error.code}</strong>
                <div>{view.selectedStep.error.message}</div>
              </div>
            ) : null}
          </div>
          <aside>
            <h3>Cost</h3>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
              {data.costSummary.byStep
                .filter((item) => item.stepName === view.selectedStep?.stepName)
                .map((item) => (
                  <div key={item.stepName}>
                    <div>Tokens: {item.tokens.toLocaleString()}</div>
                    <div>Cost: ${item.costUsd.toFixed(4)}</div>
                  </div>
                ))}
            </div>
            <h3>Checkpoints</h3>
            <ul>
              {data.checkpoints.map((cp) => (
                <li key={cp.id}>{cp.stepName} · {new Date(cp.createdAt).toLocaleString()}</li>
              ))}
            </ul>
          </aside>
        </div>
      ) : null}

      <div style={{ marginTop: '18px' }}>
        <h3>Audit Replay</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <select value={auditCategory} onChange={(event) => setAuditCategory(event.target.value as typeof auditCategory)}>
            <option value="all">all</option>
            <option value="consensus">consensus</option>
            <option value="policy">policy</option>
            <option value="execution">execution</option>
            <option value="recovery">recovery</option>
          </select>
          <input value={auditActor} placeholder="actor" onChange={(event) => setAuditActor(event.target.value)} />
        </div>

        <div style={{ display: 'grid', gap: '6px' }}>
          {view.filteredAudit.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>No audit events</p>
          ) : null}
          {view.filteredAudit.map((event) => (
            <article key={event.id} style={{ borderLeft: `4px solid ${event.category === 'consensus' ? '#2563eb' : event.category === 'policy' ? '#eab308' : event.category === 'recovery' ? '#dc2626' : '#6b7280'}`, background: '#f9fafb', padding: '8px 10px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>{new Date(event.timestamp).toLocaleString()} · {event.category} · {event.actor}</div>
              <div style={{ fontWeight: 600 }}>{event.action}</div>
              {event.vote ? (
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  vote: {event.vote.decision}
                  {typeof event.vote.confidence === 'number' ? ` (${Math.round(event.vote.confidence * 100)}%)` : ''}
                </div>
              ) : null}
              <pre style={{ margin: '6px 0 0', fontSize: '12px', whiteSpace: 'pre-wrap' }}>{toPrettyJson(event.detail)}</pre>
            </article>
          ))}
        </div>

        {view.auditPagination ? (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" disabled={!view.auditPagination.canPrev} onClick={() => setAuditOffset((prev) => Math.max(0, prev - auditLimit))}>Prev audit</button>
            <button
              type="button"
              disabled={!view.auditPagination.canNext}
              onClick={() => setAuditOffset((prev) => prev + auditLimit)}
            >
              Next audit
            </button>
            <span style={{ color: '#6b7280', fontSize: '12px' }}>
              {view.auditPagination.label}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
};

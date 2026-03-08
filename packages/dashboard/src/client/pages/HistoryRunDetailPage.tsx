import { useEffect, useMemo, useState } from 'react';

import { fetchHistoryRunDetail, resumeHistoryRun, type ArtifactRecord, type RunDetailResponse } from '../api/history-client';
import { filterAuditEvents, toPrettyJson } from '../components/history-utils';
import { formatRepairLoopBadge, getRepairLoopSummary, getRepairLoopTone } from '../components/repair-loop-utils';

interface Props {
  runId: string;
  onBack: () => void;
}

export const HistoryRunDetailPage = ({ runId, onBack }: Props): JSX.Element => {
  const [data, setData] = useState<RunDetailResponse | undefined>(undefined);
  const [selectedStepId, setSelectedStepId] = useState<string | undefined>(undefined);
  const [auditCategory, setAuditCategory] = useState<'all' | 'consensus' | 'policy' | 'execution' | 'recovery'>('all');
  const [auditActor, setAuditActor] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [showDriftModal, setShowDriftModal] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [artifactStepFilter, setArtifactStepFilter] = useState<string | null>(null);
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
    if (selectedStepId && data.steps.some((step) => step.id === selectedStepId)) return;
    setSelectedStepId(data.steps[0]?.id);
  }, [data, selectedStepId]);

  const selectedStep = useMemo(() => data?.steps.find((step) => step.id === selectedStepId), [data?.steps, selectedStepId]);

  const filteredAudit = useMemo(() => {
    if (!data) return [];
    return filterAuditEvents(data.auditTimeline, {
      category: auditCategory,
      actor: auditActor,
    });
  }, [auditActor, auditCategory, data]);

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
  const repairLoop = getRepairLoopSummary(run);
  const repairBadge = formatRepairLoopBadge(repairLoop);
  const repairTone = getRepairLoopTone(repairLoop);
  const filteredArtifacts = artifactStepFilter
    ? data.artifacts.filter((artifact) => artifact.stepName === artifactStepFilter)
    : data.artifacts;

  const jumpToArtifactSection = (stepName?: string) => {
    setArtifactStepFilter(stepName ?? null);
    requestAnimationFrame(() => {
      document.getElementById('artifacts-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const jumpToStep = (stepName?: string) => {
    if (!stepName) return;
    const target = data.steps.find((step) => step.stepName === stepName);
    if (!target) return;
    setSelectedStepId(target.id);
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

      {repairLoop ? (
        <div style={{ border: `1px solid ${repairTone?.border ?? '#e5e7eb'}`, borderRadius: '10px', padding: '12px', marginBottom: '12px', background: repairTone?.background ?? '#fafafa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h3 style={{ margin: 0 }}>Repair Loop</h3>
                {repairTone ? (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: repairTone.text,
                      background: '#fff',
                      border: `1px solid ${repairTone.border}`,
                      borderRadius: '999px',
                      padding: '2px 8px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.02em',
                    }}
                  >
                    {repairTone.label}
                  </span>
                ) : null}
              </div>
              <p style={{ margin: '4px 0 0', color: repairTone?.text ?? '#6b7280', fontSize: '13px', fontWeight: 600 }}>
                {repairBadge ?? 'validation-repair activity recorded'}
              </p>
            </div>
            {repairLoop.lastValidationSummary ? (
              <span style={{ fontSize: '12px', color: '#6b7280', maxWidth: '420px', textAlign: 'right' }}>
                {repairLoop.lastValidationSummary}
              </span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Validation Failed<br />{repairLoop.validationFailed}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Validation Passed<br />{repairLoop.validationPassed}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Repair Started<br />{repairLoop.repairStarted}</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>Repair Completed<br />{repairLoop.repairCompleted}</div>
          </div>

          <div style={{ marginTop: '10px', display: 'grid', gap: '4px', fontSize: '13px', color: '#374151' }}>
            {repairLoop.lastAttempt !== undefined ? <div>Last attempt: {repairLoop.lastAttempt}</div> : null}
            {repairLoop.lastValidationStep ? <div>Last validator: {repairLoop.lastValidationStep}</div> : null}
            {repairLoop.lastRepairStep ? <div>Last repair step: {repairLoop.lastRepairStep}</div> : null}
            {repairLoop.lastNoProgressReason ? <div>No-progress reason: {repairLoop.lastNoProgressReason}</div> : null}
            {repairLoop.lastExhaustReason ? <div>Exhaust reason: {repairLoop.lastExhaustReason}</div> : null}
          </div>

          {repairLoop.recentValidationFailures.length > 0 ? (
            <div style={{ marginTop: '12px' }}>
              <h4 style={{ margin: '0 0 8px' }}>Recent Validation Failures</h4>
              <div style={{ display: 'grid', gap: '8px' }}>
                {repairLoop.recentValidationFailures.map((failure, index) => (
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
              {artifactStepFilter ? `Showing artifacts for step: ${artifactStepFilter}` : 'Showing all persisted artifacts for this run'}
            </p>
          </div>
          {artifactStepFilter ? (
            <button type="button" onClick={() => setArtifactStepFilter(null)} style={{ fontSize: '12px', cursor: 'pointer' }}>
              Clear filter
            </button>
          ) : null}
        </div>

        {filteredArtifacts.length === 0 ? (
          <p style={{ color: '#6b7280', margin: 0 }}>No artifacts found for the current selection.</p>
        ) : (
          <div style={{ display: 'grid', gap: '8px' }}>
            {filteredArtifacts.map((artifact: ArtifactRecord) => (
              <div key={artifact.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', background: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '12px' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{artifact.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{artifact.stepName} · {artifact.mimeType} · {artifact.sizeBytes} bytes</div>
                  </div>
                  <button type="button" onClick={() => jumpToStep(artifact.stepName)} style={{ fontSize: '12px', cursor: 'pointer' }}>
                    Jump to step
                  </button>
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#6b7280', wordBreak: 'break-all' }}>
                  storage: {artifact.storageRef}
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

      {selectedStep ? (
        <div id="step-drilldown-section" style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '12px' }}>
          <div>
            <h3>Step Drilldown</h3>
            <p style={{ marginBottom: '6px' }}>Input</p>
            <pre style={{ background: '#111827', color: '#f9fafb', padding: '10px', borderRadius: '8px', overflowX: 'auto' }}>{toPrettyJson(selectedStep.input)}</pre>
            <p style={{ marginBottom: '6px' }}>Output</p>
            <pre style={{ background: '#111827', color: '#f9fafb', padding: '10px', borderRadius: '8px', overflowX: 'auto' }}>{toPrettyJson(selectedStep.output)}</pre>
            {selectedStep.error ? (
              <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: '8px', padding: '10px', marginTop: '8px' }}>
                <strong>{selectedStep.error.code}</strong>
                <div>{selectedStep.error.message}</div>
              </div>
            ) : null}
          </div>
          <aside>
            <h3>Cost</h3>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '10px' }}>
              {data.costSummary.byStep
                .filter((item) => item.stepName === selectedStep.stepName)
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
          {filteredAudit.length === 0 ? (
            <p style={{ margin: 0, color: '#6b7280' }}>No audit events</p>
          ) : null}
          {filteredAudit.map((event) => (
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

        {data.pagination ? (
          <div style={{ marginTop: '8px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" disabled={auditOffset === 0} onClick={() => setAuditOffset((prev) => Math.max(0, prev - auditLimit))}>Prev audit</button>
            <button
              type="button"
              disabled={auditOffset + auditLimit >= data.pagination.auditTotal}
              onClick={() => setAuditOffset((prev) => prev + auditLimit)}
            >
              Next audit
            </button>
            <span style={{ color: '#6b7280', fontSize: '12px' }}>
              {auditOffset + 1}-{Math.min(auditOffset + auditLimit, data.pagination.auditTotal)} / {data.pagination.auditTotal}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
};

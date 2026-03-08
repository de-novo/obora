import { useEffect, useMemo, useState } from 'react';

import { fetchHistoryRuns, type HistoryRunsResponse } from '../api/history-client';
import { formatRepairLoopBadge, getRepairLoopSummary, getRepairLoopTone, truncateValidationSummary } from '../components/repair-loop-utils';

interface Props {
  onOpenRun: (runId: string) => void;
}

const defaultResponse: HistoryRunsResponse = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
};

const badgeColor = (status: string): string => {
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

export const HistoryRunsPage = ({ onOpenRun }: Props): JSX.Element => {
  const [status, setStatus] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [repairLoop, setRepairLoop] = useState<'all' | 'with' | 'without' | 'stalled' | 'exhausted'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [costMin, setCostMin] = useState('');
  const [costMax, setCostMax] = useState('');
  const [sortBy, setSortBy] = useState<'startedAt' | 'completedAt' | 'totalCostUsd' | 'validationFailed'>('startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<HistoryRunsResponse>(defaultResponse);
  const [error, setError] = useState<string | undefined>(undefined);

  const query = useMemo(
    () => ({
      status: status || undefined,
      workflowName: workflowName || undefined,
      repairLoop: repairLoop === 'all' ? undefined : repairLoop,
      from: from || undefined,
      to: to || undefined,
      costMin: costMin ? Number(costMin) : undefined,
      costMax: costMax ? Number(costMax) : undefined,
      sortBy,
      sortOrder,
      limit: data.limit,
      offset,
    }),
    [costMax, costMin, data.limit, from, offset, repairLoop, sortBy, sortOrder, status, to, workflowName],
  );

  useEffect(() => {
    let active = true;
    void fetchHistoryRuns(query)
      .then((result) => {
        if (active) {
          setData(result);
          setError(undefined);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to load runs');
        }
      });

    return () => {
      active = false;
    };
  }, [query]);

  const canPrev = data.offset > 0;
  const canNext = data.offset + data.limit < data.total;

  return (
    <section>
      <h2 style={{ margin: '0 0 12px' }}>History / Runs</h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gap: '8px', marginBottom: '12px' }}>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}>
          <option value="">All status</option>
          <option value="running">running</option>
          <option value="completed">completed</option>
          <option value="failed">failed</option>
          <option value="suspended">suspended</option>
        </select>
        <input placeholder="workflow name" value={workflowName} onChange={(event) => { setWorkflowName(event.target.value); setOffset(0); }} />
        <select value={repairLoop} onChange={(event) => { setRepairLoop(event.target.value as typeof repairLoop); setOffset(0); }}>
          <option value="all">all repair loops</option>
          <option value="with">with repair loop</option>
          <option value="without">without repair loop</option>
          <option value="stalled">stalled</option>
          <option value="exhausted">exhausted</option>
        </select>
        <input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setOffset(0); }} />
        <input type="date" value={to} onChange={(event) => { setTo(event.target.value); setOffset(0); }} />
        <input placeholder="cost min" value={costMin} onChange={(event) => { setCostMin(event.target.value); setOffset(0); }} />
        <input placeholder="cost max" value={costMax} onChange={(event) => { setCostMax(event.target.value); setOffset(0); }} />
        <div style={{ display: 'flex', gap: '8px' }}>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as 'startedAt' | 'completedAt' | 'totalCostUsd' | 'validationFailed')}>
            <option value="startedAt">startedAt</option>
            <option value="completedAt">completedAt</option>
            <option value="totalCostUsd">totalCostUsd</option>
            <option value="validationFailed">validationFailed</option>
          </select>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value as 'asc' | 'desc')}>
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {[
          { value: 'all', label: 'All runs', tone: { text: '#374151', background: '#f9fafb', border: '#d1d5db' } },
          { value: 'with', label: 'Repair loops', tone: { text: '#1d4ed8', background: '#eff6ff', border: '#93c5fd' } },
          { value: 'stalled', label: 'Stalled', tone: { text: '#92400e', background: '#fffbeb', border: '#fcd34d' } },
          { value: 'exhausted', label: 'Exhausted', tone: { text: '#991b1b', background: '#fef2f2', border: '#fecaca' } },
          { value: 'without', label: 'No repair loop', tone: { text: '#4b5563', background: '#f3f4f6', border: '#d1d5db' } },
        ].map((chip) => {
          const active = repairLoop === chip.value;
          return (
            <button
              key={chip.value}
              type="button"
              onClick={() => { setRepairLoop(chip.value as typeof repairLoop); setOffset(0); }}
              style={{
                borderRadius: '999px',
                border: `1px solid ${chip.tone.border}`,
                background: active ? chip.tone.background : '#fff',
                color: chip.tone.text,
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: active ? 700 : 600,
                cursor: 'pointer',
                boxShadow: active ? `0 0 0 2px ${chip.tone.background}` : 'none',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}

      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #e5e7eb' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
            <th style={{ padding: '8px' }}>Run ID</th>
            <th style={{ padding: '8px' }}>Workflow</th>
            <th style={{ padding: '8px' }}>Status</th>
            <th style={{ padding: '8px' }}>Started</th>
            <th style={{ padding: '8px' }}>Repair Loop</th>
            <th style={{ padding: '8px' }}>Cost(USD)</th>
            <th style={{ padding: '8px' }}>Steps</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item) => {
            const repairLoop = getRepairLoopSummary(item.run);
            const repairBadge = formatRepairLoopBadge(repairLoop);
            const repairTone = getRepairLoopTone(repairLoop);
            const lastValidation = truncateValidationSummary(repairLoop?.lastValidationSummary, 56);

            return (
            <tr
              key={item.run.id}
              style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
              onClick={() => onOpenRun(item.run.id)}
            >
              <td style={{ padding: '8px', fontFamily: 'monospace' }}>{item.run.id}</td>
              <td style={{ padding: '8px' }}>{item.run.workflowName}</td>
              <td style={{ padding: '8px' }}>
                <span style={{ background: badgeColor(item.run.status), color: '#fff', borderRadius: '10px', padding: '2px 8px', fontSize: '12px' }}>
                  {item.run.status}
                </span>
              </td>
              <td style={{ padding: '8px' }}>{new Date(item.run.startedAt).toLocaleString()}</td>
              <td style={{ padding: '8px', minWidth: '220px' }}>
                {repairLoop ? (
                  <div style={{ display: 'grid', gap: '4px' }}>
                    {repairTone ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            color: repairTone.text,
                            background: repairTone.background,
                            border: `1px solid ${repairTone.border}`,
                            borderRadius: '999px',
                            padding: '2px 8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.02em',
                          }}
                        >
                          {repairTone.label}
                        </span>
                        {repairBadge ? (
                          <span style={{ fontSize: '12px', fontWeight: 600, color: repairTone.text }}>{repairBadge}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {lastValidation ? (
                      <span style={{ fontSize: '12px', color: '#6b7280' }}>{lastValidation}</span>
                    ) : null}
                  </div>
                ) : (
                  <span style={{ color: '#9ca3af', fontSize: '12px' }}>—</span>
                )}
              </td>
              <td style={{ padding: '8px' }}>{item.costSummary.totalCostUsd.toFixed(4)}</td>
              <td style={{ padding: '8px' }}>{item.stepCount}</td>
            </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button type="button" disabled={!canPrev} onClick={() => setOffset((prev) => Math.max(0, prev - data.limit))}>Prev</button>
        <button type="button" disabled={!canNext} onClick={() => setOffset((prev) => prev + data.limit)}>Next</button>
        <span style={{ color: '#6b7280' }}>
          {data.total === 0
            ? 'showing 0-0 / 0'
            : `showing ${data.offset + 1}-${Math.min(data.offset + data.limit, data.total)} / ${data.total}`}
        </span>
      </div>
    </section>
  );
};

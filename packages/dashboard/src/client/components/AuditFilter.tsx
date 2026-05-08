import type { ReactElement } from 'react';
import { type FormEvent, useState } from 'react';

import type { AuditQueryParams } from '../api/audit-client';

interface AuditFilterProps {
  loading?: boolean;
  initialValue?: AuditQueryParams;
  onSearch: (params: AuditQueryParams) => void;
  onReset?: () => void;
}

const EVENT_TYPE_OPTIONS = [
  'execution_start',
  'execution_end',
  'step_start',
  'step_end',
  'policy_check',
  'policy_deny',
  'gate_wait',
  'gate_resolve',
  'recovery_start',
  'recovery_end',
  'error',
];

const normalize = (params?: AuditQueryParams): AuditQueryParams => ({
  from: params?.from,
  to: params?.to,
  eventTypes: params?.eventTypes ?? [],
  stepName: params?.stepName ?? '',
  executionId: params?.executionId ?? '',
});

export const AuditFilter = ({ loading = false, initialValue, onSearch, onReset }: AuditFilterProps): ReactElement => {
  const [filters, setFilters] = useState<AuditQueryParams>(() => normalize(initialValue));

  const update = (patch: Partial<AuditQueryParams>): void => {
    setFilters((current) => ({ ...current, ...patch }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    onSearch({
      ...filters,
      eventTypes: filters.eventTypes?.filter((eventType) => eventType.length > 0),
      stepName: filters.stepName?.trim() || undefined,
      executionId: filters.executionId?.trim() || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
    });
  };

  const handleReset = (): void => {
    const next = normalize();
    setFilters(next);
    onReset?.();
    onSearch(next);
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: '10px',
        padding: '12px',
        background: '#fff',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: '10px' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          From
          <input
            type="datetime-local"
            value={filters.from ?? ''}
            onChange={(event) => update({ from: event.target.value })}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          To
          <input type="datetime-local" value={filters.to ?? ''} onChange={(event) => update({ to: event.target.value })} />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          Event Types
          <select
            multiple
            value={filters.eventTypes ?? []}
            onChange={(event) => {
              const selected = Array.from(event.target.selectedOptions).map((option) => option.value);
              update({ eventTypes: selected });
            }}
            style={{ minHeight: '84px' }}
          >
            {EVENT_TYPE_OPTIONS.map((eventType) => (
              <option key={eventType} value={eventType}>
                {eventType}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          Step Name
          <input
            type="text"
            placeholder="e.g. plan"
            value={filters.stepName ?? ''}
            onChange={(event) => update({ stepName: event.target.value })}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
          Execution ID
          <input
            type="text"
            placeholder="execution id"
            value={filters.executionId ?? ''}
            onChange={(event) => update({ executionId: event.target.value })}
          />
        </label>
      </div>

      <div style={{ marginTop: '10px', display: 'flex', gap: '8px' }}>
        <button type="submit" disabled={loading}>
          검색
        </button>
        <button type="button" onClick={handleReset} disabled={loading}>
          필터 초기화
        </button>
      </div>
    </form>
  );
};

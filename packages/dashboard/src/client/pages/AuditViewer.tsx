import { useCallback, useEffect, useState } from 'react';

import { type AuditEvent, type AuditQueryParams, fetchAuditEvents } from '../api/audit-client';
import { AuditEventList } from '../components/AuditEventList';
import { AuditFilter } from '../components/AuditFilter';

const PAGE_SIZE = 20;

export const AuditViewer = (): JSX.Element => {
  const [filters, setFilters] = useState<AuditQueryParams>({});
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async (nextFilters: AuditQueryParams, nextOffset: number) => {
    setLoading(true);
    setError(null);

    try {
      const result = await fetchAuditEvents({
        ...nextFilters,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });

      setEvents(result.events);
      setTotal(result.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '감사 이벤트 조회 중 오류가 발생했습니다.');
      setEvents([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEvents(filters, offset);
  }, [filters, offset, loadEvents]);

  const handleSearch = (nextFilters: AuditQueryParams): void => {
    setOffset(0);
    setFilters(nextFilters);
  };

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Audit Viewer</h2>
      <p style={{ marginTop: '4px', color: '#6b7280' }}>감사 이벤트를 탐색/검색/필터링합니다.</p>

      <AuditFilter loading={loading} initialValue={filters} onSearch={handleSearch} onReset={() => setOffset(0)} />

      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}

      <AuditEventList
        events={events}
        loading={loading}
        offset={offset}
        limit={PAGE_SIZE}
        total={total}
        onPrevPage={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))}
        onNextPage={() => setOffset((current) => current + PAGE_SIZE)}
      />
    </section>
  );
};

import { Fragment, useState } from 'react';

import type { AuditEvent } from '../api/audit-client';

interface AuditEventListProps {
  events: AuditEvent[];
  loading?: boolean;
  offset: number;
  limit: number;
  total: number;
  onPrevPage: () => void;
  onNextPage: () => void;
}

const severityColor: Record<NonNullable<AuditEvent['severity']>, string> = {
  info: '#2563eb',
  warning: '#d97706',
  critical: '#dc2626',
};

export const AuditEventList = ({
  events,
  loading = false,
  offset,
  limit,
  total,
  onPrevPage,
  onNextPage,
}: AuditEventListProps): JSX.Element => {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const currentPage = Math.floor(offset / limit) + 1;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            <th style={{ textAlign: 'left', padding: '10px' }}>시간</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>타입</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>step</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>severity</th>
            <th style={{ textAlign: 'left', padding: '10px' }}>요약</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={5} style={{ padding: '16px', textAlign: 'center' }}>
                로딩 중...
              </td>
            </tr>
          ) : null}

          {!loading && events.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#6b7280' }}>
                조회된 감사 이벤트가 없습니다.
              </td>
            </tr>
          ) : null}

          {!loading
            ? events.map((event) => {
                const isExpanded = expandedEventId === event.id;
                const severity = event.severity ?? 'info';
                return (
                  <Fragment key={event.id}>
                    <tr
                      onClick={() => setExpandedEventId((current) => (current === event.id ? null : event.id))}
                      style={{ borderTop: '1px solid #f1f5f9', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px' }}>{new Date(event.timestamp).toLocaleString()}</td>
                      <td style={{ padding: '10px' }}>{event.type}</td>
                      <td style={{ padding: '10px' }}>{event.stepName ?? '-'}</td>
                      <td style={{ padding: '10px' }}>
                        <span style={{ color: severityColor[severity], fontWeight: 600 }}>{severity}</span>
                      </td>
                      <td style={{ padding: '10px' }}>{event.summary ?? event.type}</td>
                    </tr>
                    {isExpanded ? (
                      <tr>
                        <td colSpan={5} style={{ padding: '12px', background: '#f8fafc' }}>
                          <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                            {JSON.stringify(event.payload ?? {}, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            : null}
        </tbody>
      </table>

      <div style={{ padding: '10px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between' }}>
        <span>
          페이지 {currentPage} / {totalPages} · 총 {total}건
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button type="button" onClick={onPrevPage} disabled={offset <= 0 || loading}>
            이전
          </button>
          <button type="button" onClick={onNextPage} disabled={offset + limit >= total || loading}>
            다음
          </button>
        </div>
      </div>
    </section>
  );
};

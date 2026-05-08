import type { ReactElement } from 'react';
import type { DiffResult } from '../api/policy-client';

interface PolicyDiffProps {
  diff: DiffResult;
}

const typeColor = (type: 'added' | 'removed' | 'modified'): string => {
  if (type === 'added') {
    return '#166534';
  }

  if (type === 'removed') {
    return '#991b1b';
  }

  return '#92400e';
};

const bgColor = (type: 'added' | 'removed' | 'modified'): string => {
  if (type === 'added') {
    return '#dcfce7';
  }

  if (type === 'removed') {
    return '#fee2e2';
  }

  return '#fef3c7';
};

const stringify = (value: unknown): string => JSON.stringify(value, null, 2) ?? 'null';

export const PolicyDiff = ({ diff }: PolicyDiffProps): ReactElement => (
  <section style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px', backgroundColor: '#fff' }}>
    <p style={{ margin: 0, fontWeight: 600 }}>{diff.summary}</p>

    {diff.changes.length === 0 ? (
      <p style={{ marginTop: '8px', color: '#64748b' }}>변경 사항이 없습니다.</p>
    ) : (
      <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {diff.changes.map((change) => (
          <div
            key={`${change.path}:${change.type}`}
            style={{
              border: `1px solid ${typeColor(change.type)}`,
              borderRadius: '8px',
              padding: '10px',
              backgroundColor: bgColor(change.type),
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, color: typeColor(change.type) }}>
              [{change.type.toUpperCase()}] {change.path}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{stringify(change.oldValue)}</pre>
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{stringify(change.newValue)}</pre>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

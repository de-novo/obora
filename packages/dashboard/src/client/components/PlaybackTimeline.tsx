import type { ReactElement } from 'react';
import type { AuditEvent } from '../api/audit-client';

interface PlaybackTimelineProps {
  events: AuditEvent[];
  currentIndex: number;
  onJump: (index: number) => void;
}

const severityColor: Record<'info' | 'warning' | 'critical', string> = {
  info: '#2563eb',
  warning: '#d97706',
  critical: '#dc2626',
};

export const PlaybackTimeline = ({ events, currentIndex, onJump }: PlaybackTimelineProps): ReactElement => {
  if (events.length === 0) {
    return <p style={{ margin: 0, color: '#6b7280' }}>선택된 execution의 이벤트가 없습니다.</p>;
  }

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', background: '#fff' }}>
      <h3 style={{ marginTop: 0, marginBottom: '8px' }}>Playback Timeline</h3>
      <div style={{ position: 'relative', height: '52px', borderTop: '2px solid #cbd5e1', marginTop: '20px' }}>
        {events.map((event, index) => {
          const left = events.length === 1 ? 0 : (index / (events.length - 1)) * 100;
          const severity = event.severity ?? 'info';
          const isCurrent = index === currentIndex;

          return (
            <button
              key={event.id}
              type="button"
              onClick={() => onJump(index)}
              title={`${event.type} · ${new Date(event.timestamp).toLocaleTimeString()}`}
              style={{
                position: 'absolute',
                left: `${left}%`,
                top: '-7px',
                transform: 'translateX(-50%)',
                width: isCurrent ? '14px' : '10px',
                height: isCurrent ? '14px' : '10px',
                borderRadius: '999px',
                border: isCurrent ? '2px solid #111827' : '1px solid #fff',
                background: severityColor[severity],
                cursor: 'pointer',
                padding: 0,
              }}
            />
          );
        })}

        <div
          style={{
            position: 'absolute',
            left: events.length === 1 ? '0%' : `${(currentIndex / (events.length - 1)) * 100}%`,
            top: '-20px',
            transform: 'translateX(-50%)',
            fontSize: '12px',
            color: '#111827',
            fontWeight: 600,
          }}
        >
          ▲
        </div>
      </div>
    </section>
  );
};

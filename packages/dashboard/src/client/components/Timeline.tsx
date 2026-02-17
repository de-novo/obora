import type { ExecutionStep } from '../store/execution-store';

interface TimelineProps {
  executionId?: string;
  steps: ExecutionStep[];
  onStepClick?: (step: ExecutionStep) => void;
}

const statusStyles: Record<ExecutionStep['status'], { color: string; icon: string; label: string }> = {
  pending: { color: '#9ca3af', icon: '○', label: '대기' },
  running: { color: '#2563eb', icon: '▶', label: '실행 중' },
  completed: { color: '#16a34a', icon: '●', label: '완료' },
  failed: { color: '#dc2626', icon: '✕', label: '실패' },
};

export const Timeline = ({ executionId, steps, onStepClick }: TimelineProps): JSX.Element => {
  if (!executionId) {
    return <p style={{ margin: 0, color: '#6b7280' }}>좌측에서 실행을 선택하세요.</p>;
  }

  if (steps.length === 0) {
    return <p style={{ margin: 0, color: '#6b7280' }}>step 이벤트를 기다리는 중입니다.</p>;
  }

  return (
    <section>
      <h2 style={{ marginTop: 0, marginBottom: '16px' }}>Timeline · {executionId}</h2>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((step, index) => {
          const style = statusStyles[step.status];
          return (
            <li
              key={step.stepName}
              style={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr',
                columnGap: '12px',
                marginBottom: index === steps.length - 1 ? 0 : '12px',
              }}
            >
              <div
                style={{
                  color: style.color,
                  fontWeight: 700,
                  lineHeight: '20px',
                }}
                aria-hidden
              >
                {style.icon}
              </div>

              <button
                type="button"
                onClick={() => onStepClick?.(step)}
                style={{
                  textAlign: 'left',
                  border: '1px solid #e5e7eb',
                  borderLeft: `4px solid ${style.color}`,
                  background: '#ffffff',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600 }}>{step.stepName}</div>
                <div style={{ fontSize: '12px', color: '#4b5563' }}>
                  {style.label} · {new Date(step.lastUpdatedAt).toLocaleTimeString()}
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

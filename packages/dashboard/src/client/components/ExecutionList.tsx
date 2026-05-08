import type { ReactElement } from 'react';
import type { ExecutionSummary } from '../store/execution-store';

interface ExecutionListProps {
  executions: ExecutionSummary[];
  selectedExecutionId?: string;
  onSelectExecution: (executionId: string) => void;
}

export const ExecutionList = ({
  executions,
  selectedExecutionId,
  onSelectExecution,
}: ExecutionListProps): ReactElement => {
  return (
    <aside
      style={{
        borderRight: '1px solid #e5e7eb',
        padding: '12px',
        minWidth: '280px',
        maxWidth: '320px',
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: '12px', fontSize: '16px' }}>활성 실행</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {executions.length === 0 ? (
          <p style={{ margin: 0, color: '#6b7280' }}>실행 데이터가 없습니다.</p>
        ) : null}

        {executions.map((execution) => {
          const isSelected = selectedExecutionId === execution.executionId;
          return (
            <button
              key={execution.executionId}
              type="button"
              onClick={() => onSelectExecution(execution.executionId)}
              style={{
                textAlign: 'left',
                border: isSelected ? '1px solid #2563eb' : '1px solid #d1d5db',
                background: isSelected ? '#eff6ff' : '#fff',
                borderRadius: '8px',
                padding: '10px',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>{execution.executionId}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                {execution.isActive ? '진행 중' : '종료'} · step {execution.stepCount}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};

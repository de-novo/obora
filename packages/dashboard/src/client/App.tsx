import { useEffect, useMemo, useState } from 'react';

import { ExecutionList } from './components/ExecutionList';
import { Timeline } from './components/Timeline';
import { useWebSocket } from './hooks/useWebSocket';
import {
  executionStore,
  getExecutionSummaries,
  getSortedSteps,
  useExecutionStore,
  type ExecutionStep,
} from './store/execution-store';

const resolveWsUrl = (): string => {
  const explicit = import.meta.env.VITE_DASHBOARD_WS_URL;
  if (typeof explicit === 'string' && explicit.length > 0) {
    return explicit;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/executions`;
};

export const App = (): JSX.Element => {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>(undefined);

  const summaries = useExecutionStore((state) => getExecutionSummaries(state));
  const selectedExecution = useExecutionStore((state) =>
    selectedExecutionId ? state.executions[selectedExecutionId] : undefined,
  );

  const steps = useMemo(() => getSortedSteps(selectedExecution), [selectedExecution]);

  useEffect(() => {
    if (!selectedExecutionId && summaries.length > 0) {
      setSelectedExecutionId(summaries[0]?.executionId);
      return;
    }

    if (selectedExecutionId && !summaries.some((summary) => summary.executionId === selectedExecutionId)) {
      setSelectedExecutionId(summaries[0]?.executionId);
    }
  }, [selectedExecutionId, summaries]);

  const wsUrl = useMemo(() => resolveWsUrl(), []);

  const ws = useWebSocket({
    url: wsUrl,
    onEvent: (event) => {
      executionStore.receiveEvent(event);
    },
  });

  const handleStepClick = (step: ExecutionStep): void => {
    // M4-04 상세 패널 연동 준비용 callback hook
    // eslint-disable-next-line no-console
    console.debug('[timeline:step-click]', { executionId: selectedExecutionId, stepName: step.stepName });
  };

  return (
    <main style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Obora Dashboard</h1>
        <p style={{ marginTop: '8px', color: '#666' }}>Execution Timeline · {ws.status}</p>
      </header>

      <section
        style={{
          border: '1px solid #ddd',
          borderRadius: '12px',
          minHeight: '420px',
          backgroundColor: '#fafafa',
          display: 'flex',
        }}
      >
        <ExecutionList
          executions={summaries.filter((summary) => summary.isActive || summary.executionId === selectedExecutionId)}
          selectedExecutionId={selectedExecutionId}
          onSelectExecution={setSelectedExecutionId}
        />

        <div style={{ flex: 1, padding: '16px' }}>
          <Timeline executionId={selectedExecutionId} steps={steps} onStepClick={handleStepClick} />
          {ws.lastError ? (
            <p style={{ marginTop: '12px', color: '#dc2626', fontSize: '12px' }}>연결 상태: {ws.lastError}</p>
          ) : null}
        </div>
      </section>
    </main>
  );
};

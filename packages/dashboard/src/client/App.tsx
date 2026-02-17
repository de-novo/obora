import { useEffect, useMemo, useState } from 'react';

import { ExecutionList } from './components/ExecutionList';
import { StepDetail } from './components/StepDetail';
import { Timeline } from './components/Timeline';
import { useWebSocket } from './hooks/useWebSocket';
import { PolicyEditor } from './pages/PolicyEditor';
import { AuditViewer } from './pages/AuditViewer';
import { PlaybackView } from './pages/PlaybackView';
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

const DashboardView = (): JSX.Element => {
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | undefined>(undefined);
  const [selectedStepName, setSelectedStepName] = useState<string | undefined>(undefined);

  const summaries = useExecutionStore((state) => getExecutionSummaries(state));
  const selectedExecution = useExecutionStore((state) =>
    selectedExecutionId ? state.executions[selectedExecutionId] : undefined,
  );

  const steps = useMemo(() => getSortedSteps(selectedExecution), [selectedExecution]);

  const selectedStep = useMemo(
    () => steps.find((step) => step.stepName === selectedStepName),
    [selectedStepName, steps],
  );

  const selectedDetail = selectedExecution && selectedStepName ? selectedExecution.stepDetails[selectedStepName] : undefined;

  const previousBlackboard = useMemo(() => {
    if (!selectedExecution || !selectedStepName) {
      return undefined;
    }

    const index = steps.findIndex((step) => step.stepName === selectedStepName);
    if (index <= 0) {
      return undefined;
    }

    const previousStep = steps[index - 1];
    return previousStep ? selectedExecution.stepDetails[previousStep.stepName]?.blackboard : undefined;
  }, [selectedExecution, selectedStepName, steps]);

  useEffect(() => {
    if (!selectedExecutionId && summaries.length > 0) {
      setSelectedExecutionId(summaries[0]?.executionId);
      return;
    }

    if (selectedExecutionId && !summaries.some((summary) => summary.executionId === selectedExecutionId)) {
      setSelectedExecutionId(summaries[0]?.executionId);
    }
  }, [selectedExecutionId, summaries]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setSelectedStepName(undefined);
      return;
    }

    if (!selectedStepName && steps.length > 0) {
      setSelectedStepName(steps[0]?.stepName);
      return;
    }

    if (selectedStepName && !steps.some((step) => step.stepName === selectedStepName)) {
      setSelectedStepName(steps[0]?.stepName);
    }
  }, [selectedExecutionId, selectedStepName, steps]);

  const wsUrl = useMemo(() => resolveWsUrl(), []);

  const ws = useWebSocket({
    url: wsUrl,
    onEvent: (event) => {
      executionStore.receiveEvent(event);
    },
  });

  const handleStepClick = (step: ExecutionStep): void => {
    setSelectedStepName(step.stepName);
  };

  return (
    <section
      style={{
        border: '1px solid #ddd',
        borderRadius: '12px',
        minHeight: '420px',
        backgroundColor: '#fafafa',
        display: 'grid',
        gridTemplateColumns: '280px 1fr 1fr',
      }}
    >
      <ExecutionList
        executions={summaries.filter((summary) => summary.isActive || summary.executionId === selectedExecutionId)}
        selectedExecutionId={selectedExecutionId}
        onSelectExecution={(executionId) => {
          setSelectedExecutionId(executionId);
          setSelectedStepName(undefined);
        }}
      />

      <div style={{ padding: '16px', borderRight: '1px solid #e5e7eb' }}>
        <Timeline
          executionId={selectedExecutionId}
          steps={steps}
          selectedStepName={selectedStepName}
          onStepClick={handleStepClick}
        />
        {ws.lastError ? <p style={{ marginTop: '12px', color: '#dc2626', fontSize: '12px' }}>연결 상태: {ws.lastError}</p> : null}
      </div>

      <div style={{ padding: '16px' }}>
        <StepDetail
          executionId={selectedExecutionId}
          step={selectedStep}
          detail={selectedDetail}
          previousBlackboard={previousBlackboard}
        />
      </div>
    </section>
  );
};

export const App = (): JSX.Element => {
  const [view, setView] = useState<'dashboard' | 'audit' | 'playback' | 'policy'>('dashboard');
  const [playbackExecutionId, setPlaybackExecutionId] = useState<string | undefined>(undefined);

  return (
    <main style={{ padding: '24px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <header style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Obora Dashboard</h1>
        <p style={{ marginTop: '8px', color: '#666' }}>Observability Console</p>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="button" onClick={() => setView('dashboard')} disabled={view === 'dashboard'}>
            Dashboard
          </button>
          <button type="button" onClick={() => setView('audit')} disabled={view === 'audit'}>
            Audit
          </button>
          <button type="button" onClick={() => setView('playback')} disabled={view === 'playback'}>
            Playback
          </button>
          <button type="button" onClick={() => setView('policy')} disabled={view === 'policy'}>
            Policy Editor
          </button>
        </div>
      </header>

      {view === 'dashboard' ? <DashboardView /> : null}
      {view === 'audit' ? (
        <AuditViewer
          onReplayExecution={(executionId) => {
            setPlaybackExecutionId(executionId);
            setView('playback');
          }}
        />
      ) : null}
      {view === 'playback' ? <PlaybackView initialExecutionId={playbackExecutionId} /> : null}
      {view === 'policy' ? <PolicyEditor /> : null}
    </main>
  );
};

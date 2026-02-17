import { useEffect, useMemo, useState } from 'react';

import { fetchAuditEvents, fetchExecutionEvents, type AuditEvent } from '../api/audit-client';
import { PlaybackController } from '../components/PlaybackController';
import { PlaybackTimeline } from '../components/PlaybackTimeline';
import { Timeline } from '../components/Timeline';
import { usePlayback } from '../hooks/usePlayback';
import { applyExecutionEvent, createInitialExecutionStoreState, getSortedSteps, type ExecutionRecord } from '../store/execution-store';
import { isKnownExecutionEventType, type ExecutionEvent } from '../../server/types.js';

interface PlaybackViewProps {
  initialExecutionId?: string;
}

const toExecutionEvent = (event: AuditEvent): ExecutionEvent => ({
  id: event.id,
  executionId: event.executionId,
  timestamp: event.timestamp,
  type: event.type,
  knownType: isKnownExecutionEventType(event.type) ? event.type : undefined,
  stepName: event.stepName,
  payload: (event.payload ?? {}) as Record<string, unknown>,
});

export const PlaybackView = ({ initialExecutionId }: PlaybackViewProps): JSX.Element => {
  const [executionIds, setExecutionIds] = useState<string[]>([]);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string>(initialExecutionId ?? '');
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playback = usePlayback(events);

  useEffect(() => {
    let cancelled = false;

    const loadExecutions = async (): Promise<void> => {
      try {
        const result = await fetchAuditEvents({ limit: 200, offset: 0 });
        const ids = [...new Set(result.events.map((event) => event.executionId))];

        if (cancelled) {
          return;
        }

        setExecutionIds(ids);
        if (!selectedExecutionId && ids.length > 0) {
          setSelectedExecutionId(initialExecutionId && ids.includes(initialExecutionId) ? initialExecutionId : ids[0] ?? '');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'execution 목록 로드 실패');
        }
      }
    };

    void loadExecutions();

    return () => {
      cancelled = true;
    };
  }, [initialExecutionId, selectedExecutionId]);

  useEffect(() => {
    if (!selectedExecutionId) {
      setEvents([]);
      return;
    }

    let cancelled = false;

    const loadExecutionEvents = async (): Promise<void> => {
      setLoading(true);
      setError(null);

      try {
        const result = await fetchExecutionEvents(selectedExecutionId, { limit: 500, offset: 0 });
        if (!cancelled) {
          setEvents(result.events);
          playback.stop();
        }
      } catch (loadError) {
        if (!cancelled) {
          setEvents([]);
          setError(loadError instanceof Error ? loadError.message : 'execution 이벤트 조회 실패');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadExecutionEvents();

    return () => {
      cancelled = true;
    };
  }, [selectedExecutionId]);

  const currentEvent = events[playback.currentIndex];

  const stepExecution = useMemo((): ExecutionRecord | undefined => {
    if (!selectedExecutionId || events.length === 0) {
      return undefined;
    }

    const endIndex = Math.min(playback.currentIndex, events.length - 1);
    let state = createInitialExecutionStoreState();

    for (let index = 0; index <= endIndex; index += 1) {
      const event = events[index];
      if (event) {
        state = applyExecutionEvent(state, toExecutionEvent(event));
      }
    }

    return state.executions[selectedExecutionId];
  }, [events, playback.currentIndex, selectedExecutionId]);

  const steps = useMemo(() => getSortedSteps(stepExecution), [stepExecution]);

  return (
    <section>
      <h2 style={{ marginTop: 0 }}>Playback</h2>
      <p style={{ marginTop: '4px', color: '#6b7280' }}>execution별 감사 이벤트를 순차 재생하여 사고 흐름을 재구성합니다.</p>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ fontSize: '13px', color: '#374151' }}>
          Execution
          <select
            value={selectedExecutionId}
            onChange={(event) => setSelectedExecutionId(event.target.value)}
            style={{ marginLeft: '8px' }}
          >
            <option value="">선택하세요</option>
            {executionIds.map((executionId) => (
              <option key={executionId} value={executionId}>
                {executionId}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p style={{ color: '#dc2626' }}>{error}</p> : null}
      {loading ? <p>로딩 중...</p> : null}

      <div style={{ display: 'grid', gap: '12px' }}>
        <PlaybackController
          currentIndex={playback.currentIndex}
          total={events.length}
          isPlaying={playback.isPlaying}
          speed={playback.speed}
          onPlay={playback.play}
          onPause={playback.pause}
          onStop={playback.stop}
          onPrev={playback.prev}
          onNext={playback.next}
          onSeek={playback.seek}
          onSpeedChange={playback.setSpeed}
        />

        <PlaybackTimeline events={events} currentIndex={playback.currentIndex} onJump={playback.seek} />

        <div style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', background: '#fff' }}>
          <h3 style={{ marginTop: 0 }}>현재 이벤트 상세</h3>
          {currentEvent ? (
            <>
              <p style={{ margin: '4px 0' }}>
                <strong>{currentEvent.type}</strong> · {new Date(currentEvent.timestamp).toLocaleString()}
              </p>
              <pre style={{ margin: 0, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(currentEvent.payload ?? {}, null, 2)}
              </pre>
            </>
          ) : (
            <p style={{ margin: 0, color: '#6b7280' }}>재생할 이벤트가 없습니다.</p>
          )}
        </div>

        <div>
          <Timeline executionId={selectedExecutionId || undefined} steps={steps} selectedStepName={undefined} />
        </div>
      </div>
    </section>
  );
};

import type { ReactElement } from 'react';
import type { PlaybackSpeed } from '../hooks/usePlayback';

interface PlaybackControllerProps {
  currentIndex: number;
  total: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (index: number) => void;
  onSpeedChange: (speed: PlaybackSpeed) => void;
}

const speeds: PlaybackSpeed[] = [0.5, 1, 2, 4];

export const PlaybackController = ({
  currentIndex,
  total,
  isPlaying,
  speed,
  onPlay,
  onPause,
  onStop,
  onPrev,
  onNext,
  onSeek,
  onSpeedChange,
}: PlaybackControllerProps): ReactElement => {
  const maxIndex = Math.max(0, total - 1);

  return (
    <section style={{ border: '1px solid #e5e7eb', borderRadius: '10px', padding: '12px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <button type="button" onClick={onPrev} disabled={total === 0 || currentIndex <= 0}>
          이전
        </button>
        {isPlaying ? (
          <button type="button" onClick={onPause} disabled={total === 0}>
            일시정지
          </button>
        ) : (
          <button type="button" onClick={onPlay} disabled={total === 0}>
            재생
          </button>
        )}
        <button type="button" onClick={onStop} disabled={total === 0}>
          정지
        </button>
        <button type="button" onClick={onNext} disabled={total === 0 || currentIndex >= maxIndex}>
          다음
        </button>

        <span style={{ marginLeft: '8px', color: '#4b5563' }}>
          이벤트 {total === 0 ? 0 : currentIndex + 1} / {total}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
        <span style={{ color: '#4b5563', fontSize: '13px' }}>속도</span>
        {speeds.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onSpeedChange(option)}
            style={{
              background: speed === option ? '#1d4ed8' : '#f8fafc',
              color: speed === option ? '#fff' : '#1f2937',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              padding: '4px 8px',
            }}
          >
            {option}x
          </button>
        ))}
      </div>

      <div style={{ marginTop: '12px' }}>
        <input
          type="range"
          min={0}
          max={maxIndex}
          step={1}
          value={total === 0 ? 0 : currentIndex}
          onChange={(event) => onSeek(Number(event.target.value))}
          disabled={total === 0}
          style={{ width: '100%' }}
        />
      </div>
    </section>
  );
};

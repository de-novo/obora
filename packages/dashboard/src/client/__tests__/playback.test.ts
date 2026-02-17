import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createPlaybackStore, getPlaybackIntervalMs } from '../hooks/usePlayback';

describe('usePlayback store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('transitions play/pause/stop state', () => {
    const store = createPlaybackStore(3);

    expect(store.getState().isPlaying).toBe(false);

    store.play();
    expect(store.getState().isPlaying).toBe(true);

    vi.advanceTimersByTime(getPlaybackIntervalMs(1));
    expect(store.getState().currentIndex).toBe(1);

    store.pause();
    expect(store.getState().isPlaying).toBe(false);

    store.stop();
    expect(store.getState().isPlaying).toBe(false);
    expect(store.getState().currentIndex).toBe(0);
  });

  it('moves next/prev within bounds', () => {
    const store = createPlaybackStore(3);

    store.next();
    store.next();
    store.next();
    expect(store.getState().currentIndex).toBe(2);

    store.prev();
    store.prev();
    store.prev();
    expect(store.getState().currentIndex).toBe(0);
  });

  it('seeks to specific index with clamping', () => {
    const store = createPlaybackStore(5);

    store.seek(3);
    expect(store.getState().currentIndex).toBe(3);

    store.seek(999);
    expect(store.getState().currentIndex).toBe(4);

    store.seek(-3);
    expect(store.getState().currentIndex).toBe(0);
  });

  it('updates playback speed interval', () => {
    const store = createPlaybackStore(5);

    store.setSpeed(2);
    store.play();

    vi.advanceTimersByTime(getPlaybackIntervalMs(2));
    expect(store.getState().currentIndex).toBe(1);

    store.setSpeed(4);
    vi.advanceTimersByTime(getPlaybackIntervalMs(4));
    expect(store.getState().currentIndex).toBe(2);
  });
});

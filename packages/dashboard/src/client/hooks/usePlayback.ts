import { useEffect, useMemo, useState } from 'react';

export type PlaybackSpeed = 0.5 | 1 | 2 | 4;

export interface PlaybackState {
  currentIndex: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
}

export interface PlaybackStore {
  getState: () => PlaybackState;
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (index: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setLength: (nextLength: number) => void;
  subscribe: (listener: () => void) => () => void;
}

const DEFAULT_STATE: PlaybackState = {
  currentIndex: 0,
  isPlaying: false,
  speed: 1,
};

const clampIndex = (index: number, length: number): number => {
  if (length <= 0) {
    return 0;
  }

  return Math.min(Math.max(0, index), length - 1);
};

export const getPlaybackIntervalMs = (speed: PlaybackSpeed): number => {
  return Math.round(1000 / speed);
};

export const createPlaybackStore = (initialLength: number): PlaybackStore => {
  const playback = {
    state: { ...DEFAULT_STATE },
    length: Math.max(0, initialLength),
    timer: undefined as ReturnType<typeof setInterval> | undefined,
  };
  const listeners = new Set<() => void>();

  const emit = (): void => {
    listeners.forEach((listener) => listener());
  };

  const clearTimer = (): void => {
    if (playback.timer) {
      clearInterval(playback.timer);
      playback.timer = undefined;
    }
  };

  const startTimer = (): void => {
    clearTimer();

    if (!playback.state.isPlaying || playback.length <= 1) {
      return;
    }

    playback.timer = setInterval(() => {
      if (playback.state.currentIndex >= playback.length - 1) {
        playback.state = { ...playback.state, isPlaying: false };
        clearTimer();
        emit();
        return;
      }

      playback.state = { ...playback.state, currentIndex: playback.state.currentIndex + 1 };
      emit();
    }, getPlaybackIntervalMs(playback.state.speed));
  };

  return {
    getState: () => playback.state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play: () => {
      if (playback.length <= 0) {
        return;
      }

      if (playback.state.currentIndex >= playback.length - 1) {
        playback.state = { ...playback.state, currentIndex: 0, isPlaying: true };
      } else {
        playback.state = { ...playback.state, isPlaying: true };
      }

      startTimer();
      emit();
    },
    pause: () => {
      playback.state = { ...playback.state, isPlaying: false };
      clearTimer();
      emit();
    },
    stop: () => {
      playback.state = { ...playback.state, isPlaying: false, currentIndex: 0 };
      clearTimer();
      emit();
    },
    next: () => {
      playback.state = { ...playback.state, currentIndex: clampIndex(playback.state.currentIndex + 1, playback.length) };
      emit();
    },
    prev: () => {
      playback.state = { ...playback.state, currentIndex: clampIndex(playback.state.currentIndex - 1, playback.length) };
      emit();
    },
    seek: (index) => {
      playback.state = { ...playback.state, currentIndex: clampIndex(index, playback.length) };
      emit();
    },
    setSpeed: (speed) => {
      playback.state = { ...playback.state, speed };
      if (playback.state.isPlaying) {
        startTimer();
      }
      emit();
    },
    setLength: (nextLength) => {
      playback.length = Math.max(0, nextLength);
      playback.state = { ...playback.state, currentIndex: clampIndex(playback.state.currentIndex, playback.length) };

      if (playback.length <= 1 && playback.state.isPlaying) {
        playback.state = { ...playback.state, isPlaying: false };
        clearTimer();
      }

      if (playback.state.isPlaying) {
        startTimer();
      }

      emit();
    },
  };
};

export interface UsePlaybackResult {
  state: PlaybackState;
  currentIndex: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  total: number;
  play: () => void;
  pause: () => void;
  stop: () => void;
  next: () => void;
  prev: () => void;
  seek: (index: number) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
}

export const usePlayback = <T>(events: T[]): UsePlaybackResult => {
  const store = useMemo(() => createPlaybackStore(events.length), []);
  const [state, setState] = useState<PlaybackState>(store.getState());

  useEffect(() => {
    store.setLength(events.length);
  }, [events.length, store]);

  useEffect(() => {
    const unsubscribe = store.subscribe(() => {
      setState(store.getState());
    });

    return unsubscribe;
  }, [store]);

  return {
    state,
    currentIndex: state.currentIndex,
    isPlaying: state.isPlaying,
    speed: state.speed,
    total: events.length,
    play: store.play,
    pause: store.pause,
    stop: store.stop,
    next: store.next,
    prev: store.prev,
    seek: store.seek,
    setSpeed: store.setSpeed,
  };
};

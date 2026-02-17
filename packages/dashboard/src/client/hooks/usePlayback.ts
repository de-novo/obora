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
  let state: PlaybackState = { ...DEFAULT_STATE };
  let length = Math.max(0, initialLength);
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };

  const clearTimer = (): void => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const startTimer = (): void => {
    clearTimer();

    if (!state.isPlaying || length <= 1) {
      return;
    }

    timer = setInterval(() => {
      if (state.currentIndex >= length - 1) {
        state = { ...state, isPlaying: false };
        clearTimer();
        emit();
        return;
      }

      state = { ...state, currentIndex: state.currentIndex + 1 };
      emit();
    }, getPlaybackIntervalMs(state.speed));
  };

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    play: () => {
      if (length <= 0) {
        return;
      }

      if (state.currentIndex >= length - 1) {
        state = { ...state, currentIndex: 0, isPlaying: true };
      } else {
        state = { ...state, isPlaying: true };
      }

      startTimer();
      emit();
    },
    pause: () => {
      state = { ...state, isPlaying: false };
      clearTimer();
      emit();
    },
    stop: () => {
      state = { ...state, isPlaying: false, currentIndex: 0 };
      clearTimer();
      emit();
    },
    next: () => {
      state = { ...state, currentIndex: clampIndex(state.currentIndex + 1, length) };
      emit();
    },
    prev: () => {
      state = { ...state, currentIndex: clampIndex(state.currentIndex - 1, length) };
      emit();
    },
    seek: (index) => {
      state = { ...state, currentIndex: clampIndex(index, length) };
      emit();
    },
    setSpeed: (speed) => {
      state = { ...state, speed };
      if (state.isPlaying) {
        startTimer();
      }
      emit();
    },
    setLength: (nextLength) => {
      length = Math.max(0, nextLength);
      state = { ...state, currentIndex: clampIndex(state.currentIndex, length) };

      if (length <= 1 && state.isPlaying) {
        state = { ...state, isPlaying: false };
        clearTimer();
      }

      if (state.isPlaying) {
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

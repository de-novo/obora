// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PlaybackController } from '../PlaybackController';
import type { PlaybackSpeed } from '../../hooks/usePlayback';

interface RenderOptions {
  currentIndex?: number;
  total?: number;
  isPlaying?: boolean;
  speed?: PlaybackSpeed;
}

const createHandlers = () => ({
  onPlay: vi.fn(),
  onPause: vi.fn(),
  onStop: vi.fn(),
  onPrev: vi.fn(),
  onNext: vi.fn(),
  onSeek: vi.fn(),
  onSpeedChange: vi.fn(),
});

const renderController = (options: RenderOptions = {}) => {
  const handlers = createHandlers();

  render(
    <PlaybackController
      currentIndex={options.currentIndex ?? 1}
      total={options.total ?? 3}
      isPlaying={options.isPlaying ?? false}
      speed={options.speed ?? 1}
      {...handlers}
    />,
  );

  return handlers;
};

afterEach(() => {
  cleanup();
});

describe('PlaybackController', () => {
  it('disables transport and seek controls when no events exist', () => {
    renderController({ currentIndex: 0, total: 0 });

    expect((screen.getByRole('button', { name: '이전' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '재생' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '정지' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: '다음' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('slider') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText('이벤트 0 / 0')).toBeTruthy();
  });

  it('switches the primary action between play and pause', () => {
    renderController({ isPlaying: true });

    expect(screen.queryByRole('button', { name: '재생' })).toBeNull();
    expect(screen.getByRole('button', { name: '일시정지' })).toBeTruthy();
  });

  it('dispatches transport, seek, and speed callbacks', async () => {
    const user = userEvent.setup();
    const handlers = renderController();

    await user.click(screen.getByRole('button', { name: '이전' }));
    await user.click(screen.getByRole('button', { name: '재생' }));
    await user.click(screen.getByRole('button', { name: '정지' }));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await user.click(screen.getByRole('button', { name: '2x' }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '2' } });

    expect(handlers.onPrev).toHaveBeenCalledOnce();
    expect(handlers.onPlay).toHaveBeenCalledOnce();
    expect(handlers.onStop).toHaveBeenCalledOnce();
    expect(handlers.onNext).toHaveBeenCalledOnce();
    expect(handlers.onSpeedChange).toHaveBeenCalledWith(2);
    expect(handlers.onSeek).toHaveBeenCalledWith(2);
  });
});

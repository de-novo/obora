// @vitest-environment jsdom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useWebSocket } from '../useWebSocket';
import type { ExecutionEvent } from '../../../server/types';

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly sent: string[] = [];
  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    sockets.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  message(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent);
  }

  rawMessage(data: string): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  error(): void {
    this.onerror?.();
  }

  serverClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

const sockets: MockWebSocket[] = [];

const executionEvent: ExecutionEvent = {
  id: 'event-1',
  executionId: 'exec-1',
  timestamp: '2026-05-05T01:00:00.000Z',
  type: 'step_start',
  knownType: 'step_start',
  stepName: 'plan',
  payload: { input: { topic: 'invoice' } },
};

beforeEach(() => {
  vi.useFakeTimers();
  sockets.length = 0;
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useWebSocket', () => {
  it('connects, consumes event messages, and resyncs after reconnect', () => {
    const onEvent = vi.fn();
    const onFullSyncRequired = vi.fn();

    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost/ws',
        reconnectDelayMs: 250,
        onEvent,
        onFullSyncRequired,
      }),
    );

    expect(result.current.status).toBe('connecting');
    expect(sockets).toHaveLength(1);

    act(() => sockets[0]!.open());
    expect(result.current.status).toBe('connected');

    act(() => sockets[0]!.message({ type: 'event', payload: executionEvent }));
    act(() => sockets[0]!.message({ type: 'ack', payload: {} }));
    act(() => sockets[0]!.rawMessage('not-json'));

    expect(onEvent).toHaveBeenCalledWith(executionEvent);

    act(() => sockets[0]!.serverClose());
    expect(result.current.status).toBe('disconnected');

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(sockets).toHaveLength(2);

    act(() => sockets[1]!.open());
    expect(sockets[1]!.sent).toEqual([
      JSON.stringify({
        type: 'command',
        command: 'resync',
        payload: { lastEventId: 'event-1' },
      }),
    ]);

    act(() => sockets[1]!.message({ type: 'error', payload: { fullSyncRequired: true } }));
    expect(onFullSyncRequired).toHaveBeenCalledOnce();

    act(() => sockets[1]!.serverClose());
    act(() => {
      vi.advanceTimersByTime(250);
    });
    act(() => sockets[2]!.open());

    expect(sockets[2]!.sent).toEqual([]);
  });

  it('tracks socket errors and avoids reconnecting after manual disconnect', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost/ws',
        reconnectDelayMs: 250,
        onEvent: vi.fn(),
      }),
    );

    act(() => sockets[0]!.open());
    act(() => sockets[0]!.error());

    expect(result.current.lastError).toBe('DASH_WS_DISCONNECTED');

    act(() => result.current.disconnect());
    expect(result.current.status).toBe('disconnected');

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(sockets).toHaveLength(1);
  });

  it('stays idle when disabled', () => {
    const { result } = renderHook(() =>
      useWebSocket({
        url: 'ws://localhost/ws',
        enabled: false,
        onEvent: vi.fn(),
      }),
    );

    expect(result.current.status).toBe('disconnected');
    expect(sockets).toHaveLength(0);
  });
});

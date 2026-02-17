import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ExecutionEvent } from '../../server/types.js';

interface WsServerMessage {
  type?: 'ack' | 'event' | 'error';
  payload?: unknown;
}

interface WsErrorPayload {
  fullSyncRequired?: boolean;
}

export interface UseWebSocketOptions {
  url: string;
  enabled?: boolean;
  reconnectDelayMs?: number;
  onEvent: (event: ExecutionEvent) => void;
  onFullSyncRequired?: () => void | Promise<void>;
}

export interface UseWebSocketResult {
  status: 'idle' | 'connecting' | 'connected' | 'disconnected';
  connect: () => void;
  disconnect: () => void;
  lastError?: string;
}

const isExecutionEvent = (value: unknown): value is ExecutionEvent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.executionId === 'string' &&
    typeof candidate.timestamp === 'string' &&
    typeof candidate.type === 'string'
  );
};

export const useWebSocket = ({
  url,
  enabled = true,
  reconnectDelayMs = 1_000,
  onEvent,
  onFullSyncRequired,
}: UseWebSocketOptions): UseWebSocketResult => {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const manualCloseRef = useRef(false);
  const lastEventIdRef = useRef<string | undefined>(undefined);

  const [status, setStatus] = useState<UseWebSocketResult['status']>('idle');
  const [lastError, setLastError] = useState<string | undefined>(undefined);

  const clearTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    clearTimer();

    const socket = socketRef.current;
    socketRef.current = null;

    if (socket) {
      socket.close();
    }

    setStatus('disconnected');
  }, [clearTimer]);

  const connect = useCallback(() => {
    if (!enabled) {
      return;
    }

    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    manualCloseRef.current = false;
    setStatus('connecting');

    const socket = new WebSocket(url);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('connected');
      setLastError(undefined);

      if (lastEventIdRef.current) {
        socket.send(
          JSON.stringify({
            type: 'command',
            command: 'resync',
            payload: {
              lastEventId: lastEventIdRef.current,
            },
          }),
        );
      }
    };

    socket.onmessage = (message) => {
      try {
        const parsed = JSON.parse(String(message.data)) as WsServerMessage;

        if (parsed.type === 'error') {
          const payload = (parsed.payload ?? {}) as WsErrorPayload;
          if (payload.fullSyncRequired) {
            void onFullSyncRequired?.();
            lastEventIdRef.current = undefined;
          }
          return;
        }

        if (parsed.type !== 'event' || !isExecutionEvent(parsed.payload)) {
          return;
        }

        lastEventIdRef.current = parsed.payload.id;
        onEvent(parsed.payload);
      } catch {
        // noop
      }
    };

    socket.onerror = () => {
      setLastError('DASH_WS_DISCONNECTED');
    };

    socket.onclose = () => {
      socketRef.current = null;
      setStatus('disconnected');

      if (manualCloseRef.current || !enabled) {
        return;
      }

      clearTimer();
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, reconnectDelayMs);
    };
  }, [clearTimer, enabled, onEvent, onFullSyncRequired, reconnectDelayMs, url]);

  useEffect(() => {
    if (!enabled) {
      disconnect();
      return;
    }

    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, enabled]);

  return useMemo(
    () => ({
      status,
      connect,
      disconnect,
      lastError,
    }),
    [connect, disconnect, lastError, status],
  );
};

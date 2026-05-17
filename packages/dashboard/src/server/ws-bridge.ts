import type { FastifyInstance } from 'fastify';

import type {
  ExecutionEvent,
  ExecutionEventSeverity,
  KnownExecutionEventType,
  RuntimeAuditEvent,
} from './types.js';

interface WsServerMessage {
  type: 'ack' | 'event' | 'error';
  payload: Record<string, unknown> | ExecutionEvent;
}

interface WsClientCommand {
  type?: string;
  command?: string;
  payload?: Record<string, unknown>;
}

export interface WsBridgeOptions {
  wsPath: string;
  bufferSize?: number;
  onEvent?: (event: ExecutionEvent) => void | Promise<void>;
}

export interface WsBridge {
  broadcast(event: ExecutionEvent): void;
  pushEvent(auditEvent: RuntimeAuditEvent): ExecutionEvent;
  getClientCount(): number;
}

const DEFAULT_BUFFER_SIZE = 200;

type WsLike = { send(data: string): void; close(): void; on(event: string, cb: (...args: unknown[]) => void): void };

type WsConnectionLike = WsLike | { socket: WsLike };

const toWsLike = (connection: WsConnectionLike): WsLike => {
  if ('socket' in (connection as { socket?: WsLike }) && (connection as { socket?: WsLike }).socket) {
    return (connection as { socket: WsLike }).socket;
  }

  return connection as WsLike;
};

const KNOWN_TYPE_BY_AUDIT_TYPE: Record<string, KnownExecutionEventType> = {
  execution_start: 'execution_start',
  execution_end: 'execution_end',
  step_start: 'step_start',
  step_end: 'step_end',
  policy_check: 'policy_check',
  policy_deny: 'policy_deny',
  gate_wait: 'gate_wait',
  gate_resolve: 'gate_resolve',
  recovery_start: 'recovery_start',
  recovery_end: 'recovery_end',
  error: 'error',
};

const SEVERITY_BY_KNOWN_TYPE: Record<KnownExecutionEventType, ExecutionEventSeverity> = {
  execution_start: 'info',
  execution_end: 'info',
  step_start: 'info',
  step_end: 'info',
  policy_check: 'info',
  policy_deny: 'warning',
  gate_wait: 'info',
  gate_resolve: 'info',
  recovery_start: 'critical',
  recovery_end: 'critical',
  error: 'critical',
};

const toIsoTimestamp = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
};

const compareExecutionEvents = (a: ExecutionEvent, b: ExecutionEvent): number => {
  if (a.timestamp === b.timestamp) {
    return a.id.localeCompare(b.id);
  }

  return a.timestamp.localeCompare(b.timestamp);
};

const parseClientCommand = (raw: string): WsClientCommand | null => {
  try {
    const parsed = JSON.parse(raw) as WsClientCommand;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
};

const sendMessage = (socket: WsLike, message: WsServerMessage): void => {
  socket.send(JSON.stringify(message));
};

const sendError = (socket: WsLike, code: string, message: string, extra: Record<string, unknown> = {}): void => {
  sendMessage(socket, {
    type: 'error',
    payload: {
      code,
      message,
      ...extra,
    },
  });
};

export const createWsBridge = (server: FastifyInstance, options: WsBridgeOptions): WsBridge => {
  const clients = new Set<WsLike>();
  const eventBuffer: ExecutionEvent[] = [];
  const sequenceByExecution = new Map<string, number>();
  const bufferSize = options.bufferSize ?? DEFAULT_BUFFER_SIZE;

  const notifyEvent = (event: ExecutionEvent): void => {
    if (!options.onEvent) {
      return;
    }

    void Promise.resolve(options.onEvent(event)).catch((error) => {
      server.log.error(
        {
          code: 'DASH_11002',
          error: error instanceof Error ? error.message : String(error),
          eventId: event.id,
          eventType: event.type,
        },
        'Notification processing failed from ws bridge',
      );
    });
  };

  const broadcast = (event: ExecutionEvent): void => {
    const payload: WsServerMessage = {
      type: 'event',
      payload: event,
    };

    const serialized = JSON.stringify(payload);

    clients.forEach((client) => {
      client.send(serialized);
    });

    notifyEvent(event);
  };

  const pushToBuffer = (event: ExecutionEvent): void => {
    eventBuffer.push(event);
    eventBuffer.sort(compareExecutionEvents);

    while (eventBuffer.length > bufferSize) {
      eventBuffer.shift();
    }
  };

  const toExecutionEvent = (auditEvent: RuntimeAuditEvent): ExecutionEvent => {
    const nextSequence = (sequenceByExecution.get(auditEvent.executionId) ?? 0) + 1;
    sequenceByExecution.set(auditEvent.executionId, nextSequence);

    const knownType = KNOWN_TYPE_BY_AUDIT_TYPE[auditEvent.type] ?? undefined;
    const severity = knownType ? SEVERITY_BY_KNOWN_TYPE[knownType] : undefined;
    const data = (auditEvent.data as Record<string, unknown> | null) ?? {};
    const status =
      typeof data.status === 'string' && ['running', 'completed', 'failed', 'waiting', 'skipped'].includes(data.status)
        ? (data.status as ExecutionEvent['status'])
        : undefined;

    return {
      id: `${auditEvent.executionId}:${String(nextSequence).padStart(8, '0')}`,
      executionId: auditEvent.executionId,
      timestamp: toIsoTimestamp(auditEvent.timestamp),
      type: auditEvent.type,
      knownType,
      stepName: typeof data.stepName === 'string' ? data.stepName : undefined,
      status,
      severity,
      payload: {
        data: auditEvent.data,
        sourceEventId: auditEvent.id,
      },
    };
  };

  const handleResync = (socket: WsLike, lastEventId?: string): void => {
    if (!lastEventId) {
      return;
    }

    const lastEventIndex = eventBuffer.findIndex((event) => event.id === lastEventId);

    if (lastEventIndex === -1) {
      sendError(socket, 'DASH_2003', 'Resync gap is not available in buffer.', {
        fullSyncRequired: true,
      });
      return;
    }

    const missingEvents = eventBuffer.slice(lastEventIndex + 1);
    missingEvents.forEach((missingEvent) => {
      sendMessage(socket, {
        type: 'event',
        payload: missingEvent,
      });
    });

    sendMessage(socket, {
      type: 'ack',
      payload: {
        code: 'DASH_2004',
        message: 'Resync completed.',
        replayed: missingEvents.length,
      },
    });
  };

  server.get(options.wsPath, { websocket: true }, (connection, request) => {
    const client = toWsLike(connection as WsConnectionLike);
    clients.add(client);

    sendMessage(client, {
      type: 'ack',
      payload: {
        code: 'DASH_2001',
        message: 'WebSocket connected.',
      },
    });

    const requestUrl = new URL(request.url, 'http://localhost');
    const lastEventId = requestUrl.searchParams.get('lastEventId') ?? undefined;
    handleResync(client, lastEventId);

    client.on('message', (rawMessage) => {
      const text = String(rawMessage);
      const command = parseClientCommand(text);

      if (!command) {
        sendError(client, 'DASH_2002', 'Invalid WebSocket command payload.');
        return;
      }

      if (command.type === 'command' && command.command === 'resync') {
        const requestedLastEventId =
          typeof command.payload?.lastEventId === 'string' ? command.payload.lastEventId : undefined;
        handleResync(client, requestedLastEventId);
      }
    });

    const detachClient = (): void => {
      clients.delete(client);
    };

    client.on('close', detachClient);
    if ('on' in (connection as { on?: WsLike['on'] }) && connection !== client) {
      (connection as { on: WsLike['on'] }).on('close', detachClient);
    }
  });

  return {
    broadcast(event) {
      pushToBuffer(event);
      broadcast(event);
    },
    pushEvent(auditEvent) {
      const normalized = toExecutionEvent(auditEvent);
      pushToBuffer(normalized);
      broadcast(normalized);
      return normalized;
    },
    getClientCount() {
      return clients.size;
    },
  };
};

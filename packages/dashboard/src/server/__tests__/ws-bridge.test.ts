import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

import type { ExecutionEvent } from '../types.js';
import { createQuietDashboardServer as createDashboardServer } from './test-server.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

const waitForOpen = async (socket: WebSocket): Promise<void> =>
  new Promise((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

const createMessageReader = (socket: WebSocket) => {
  const queue: Array<Record<string, unknown>> = [];
  const waiting: Array<(value: Record<string, unknown>) => void> = [];

  socket.on('message', (data: WebSocket.RawData) => {
    const parsed = JSON.parse(String(data)) as Record<string, unknown>;
    const consumer = waiting.shift();
    if (consumer) {
      consumer(parsed);
      return;
    }

    queue.push(parsed);
  });

  return async (): Promise<Record<string, unknown>> => {
    const queued = queue.shift();
    if (queued) {
      return queued;
    }

    return new Promise((resolve) => {
      waiting.push(resolve);
    });
  };
};

const startServer = async () => {
  const server = await createDashboardServer({
    host: '127.0.0.1',
    port: 0,
    wsPath: '/ws-test',
  });
  servers.push(server.app);

  await server.app.listen({ host: '127.0.0.1', port: 0 });
  const address = server.app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('DASH_2005 Unexpected server address');
  }

  return {
    ...server,
    url: `ws://127.0.0.1:${address.port}/ws-test`,
  };
};

const createExecutionEvent = (id: string, timestamp: string, executionId = 'exec-1'): ExecutionEvent => ({
  id,
  executionId,
  timestamp,
  type: 'step_start',
  stepName: 'step-a',
  severity: 'info',
  payload: {},
});

describe('ws bridge', () => {
  it('tracks websocket connection and disconnection', async () => {
    const { url, wsBridge } = await startServer();
    const ws = new WebSocket(url);
    const nextMessage = createMessageReader(ws);

    await waitForOpen(ws);
    await nextMessage(); // ack
    expect(wsBridge.getClientCount()).toBe(1);

    ws.close();
    await new Promise((resolve) => ws.once('close', resolve));
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(wsBridge.getClientCount()).toBe(0);
  });

  it('broadcasts execution events to all connected clients', async () => {
    const { url, wsBridge } = await startServer();
    const ws1 = new WebSocket(url);
    const ws2 = new WebSocket(url);
    const next1 = createMessageReader(ws1);
    const next2 = createMessageReader(ws2);

    await Promise.all([waitForOpen(ws1), waitForOpen(ws2)]);
    await Promise.all([next1(), next2()]); // ack

    const expected = createExecutionEvent('exec-1:00000001', '2026-02-17T12:00:00.000Z');
    wsBridge.broadcast(expected);

    const [message1, message2] = await Promise.all([next1(), next2()]);

    expect(message1).toMatchObject({ type: 'event', payload: expected });
    expect(message2).toMatchObject({ type: 'event', payload: expected });

    ws1.close();
    ws2.close();
  });

  it('gap-fills events on reconnect when lastEventId exists in buffer', async () => {
    const { url, wsBridge } = await startServer();

    const e1 = createExecutionEvent('exec-1:00000001', '2026-02-17T12:00:00.000Z');
    const e2 = createExecutionEvent('exec-1:00000002', '2026-02-17T12:00:01.000Z');
    wsBridge.broadcast(e1);
    wsBridge.broadcast(e2);

    const ws = new WebSocket(`${url}?lastEventId=${encodeURIComponent(e1.id)}`);
    const nextMessage = createMessageReader(ws);
    await waitForOpen(ws);

    const ack = await nextMessage();
    const replay = await nextMessage();
    const replayAck = await nextMessage();

    expect(ack).toMatchObject({ type: 'ack' });
    expect(replay).toMatchObject({ type: 'event', payload: e2 });
    expect(replayAck).toMatchObject({ type: 'ack', payload: { code: 'DASH_2004', replayed: 1 } });

    ws.close();
  });

  it('instructs full-sync fallback when resync gap is unavailable', async () => {
    const { url, wsBridge } = await startServer();

    wsBridge.broadcast(createExecutionEvent('exec-1:00000001', '2026-02-17T12:00:00.000Z'));

    const ws = new WebSocket(`${url}?lastEventId=${encodeURIComponent('exec-1:99999999')}`);
    const nextMessage = createMessageReader(ws);
    await waitForOpen(ws);

    const ack = await nextMessage();
    const error = await nextMessage();

    expect(ack).toMatchObject({ type: 'ack' });
    expect(error).toMatchObject({
      type: 'error',
      payload: {
        code: 'DASH_2003',
        fullSyncRequired: true,
      },
    });

    ws.close();
  });

  it('handles invalid client commands and command-driven resync', async () => {
    const { url, wsBridge } = await startServer();
    const e1 = createExecutionEvent('exec-1:00000001', '2026-02-17T12:00:00.000Z');
    const e2 = createExecutionEvent('exec-1:00000002', '2026-02-17T12:00:01.000Z');
    wsBridge.broadcast(e1);
    wsBridge.broadcast(e2);

    const ws = new WebSocket(url);
    const nextMessage = createMessageReader(ws);
    await waitForOpen(ws);
    await nextMessage(); // ack

    ws.send('not-json');
    await expect(nextMessage()).resolves.toMatchObject({
      type: 'error',
      payload: { code: 'DASH_2002' },
    });

    ws.send('null');
    await expect(nextMessage()).resolves.toMatchObject({
      type: 'error',
      payload: { code: 'DASH_2002' },
    });

    ws.send(JSON.stringify({ type: 'command', command: 'resync', payload: { lastEventId: e1.id } }));
    await expect(nextMessage()).resolves.toMatchObject({ type: 'event', payload: e2 });
    await expect(nextMessage()).resolves.toMatchObject({ type: 'ack', payload: { code: 'DASH_2004', replayed: 1 } });

    ws.close();
  });

  it('maps unknown audit event type to knownType undefined', async () => {
    const { wsBridge } = await startServer();

    const event = wsBridge.pushEvent({
      id: 'audit-unknown',
      executionId: 'exec-unknown',
      type: 'custom_audit_type' as never,
      timestamp: new Date('2026-02-17T12:00:00.000Z'),
      data: { stepName: 'step-x' },
    });

    expect(event.type).toBe('custom_audit_type');
    expect(event.knownType).toBeUndefined();
  });

  it('normalizes known audit events with status and empty data payloads', async () => {
    const { wsBridge } = await startServer();

    const completed = wsBridge.pushEvent({
      id: 'audit-completed',
      executionId: 'exec-known',
      type: 'step_end',
      timestamp: new Date('2026-02-17T12:00:00.000Z'),
      data: { stepName: 'build', status: 'completed' },
    });
    const failed = wsBridge.pushEvent({
      id: 'audit-failed',
      executionId: 'exec-known',
      type: 'error',
      timestamp: new Date('2026-02-17T12:00:01.000Z'),
      data: null,
    });

    expect(completed).toMatchObject({
      id: 'exec-known:00000001',
      knownType: 'step_end',
      stepName: 'build',
      status: 'completed',
      severity: 'info',
      timestamp: '2026-02-17T12:00:00.000Z',
    });
    expect(failed).toMatchObject({
      id: 'exec-known:00000002',
      knownType: 'error',
      stepName: undefined,
      status: undefined,
      severity: 'critical',
      timestamp: '2026-02-17T12:00:01.000Z',
    });
  });

  it('keeps timestamp+id ordering when buffering and replaying events', async () => {
    const { url, wsBridge } = await startServer();

    const event3 = createExecutionEvent('exec-1:00000003', '2026-02-17T12:00:02.000Z');
    const event1 = createExecutionEvent('exec-1:00000001', '2026-02-17T12:00:00.000Z');
    const event2 = createExecutionEvent('exec-1:00000002', '2026-02-17T12:00:00.000Z');

    wsBridge.broadcast(event3);
    wsBridge.broadcast(event1);
    wsBridge.broadcast(event2);

    const ws = new WebSocket(`${url}?lastEventId=${encodeURIComponent('exec-1:00000001')}`);
    const nextMessage = createMessageReader(ws);
    await waitForOpen(ws);

    await nextMessage(); // ack
    const replay1 = await nextMessage();
    const replay2 = await nextMessage();

    expect(replay1).toMatchObject({ type: 'event', payload: event2 });
    expect(replay2).toMatchObject({ type: 'event', payload: event3 });

    ws.close();
  });
});

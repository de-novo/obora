import { WebSocket } from 'ws';
import type { AuditEvent } from '@obora-kit/runtime';

import { InMemoryAuditStore } from '../server/audit/audit-store.js';
import { createDashboardServer } from '../server/index.js';

export interface StartedTestServer {
  app: Awaited<ReturnType<typeof createDashboardServer>>['app'];
  wsBridge: Awaited<ReturnType<typeof createDashboardServer>>['wsBridge'];
  auditStore: InMemoryAuditStore;
  baseUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export const startTestServer = async (): Promise<StartedTestServer> => {
  const auditStore = new InMemoryAuditStore();
  const { app, wsBridge } = await createDashboardServer({}, { auditStore });

  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to resolve server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const wsUrl = `ws://127.0.0.1:${address.port}/ws`;

  return {
    app,
    wsBridge,
    auditStore,
    baseUrl,
    wsUrl,
    close: async () => {
      await app.close();
    },
  };
};

export const connectWsClient = async (wsUrl: string): Promise<WebSocket> =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });

let eventSeq = 0;

export const createTestAuditEvent = (
  overrides: Partial<AuditEvent> = {},
): AuditEvent => {
  eventSeq += 1;

  return {
    id: `audit-${eventSeq}`,
    executionId: overrides.executionId ?? 'exec-e2e',
    timestamp: overrides.timestamp ?? new Date(),
    type: overrides.type ?? 'execution_start',
    data: overrides.data ?? { stepName: 'step-a', message: 'test event' },
    metadata: overrides.metadata,
    cellId: overrides.cellId,
  };
};

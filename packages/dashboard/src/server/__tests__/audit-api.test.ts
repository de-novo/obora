import { afterEach, describe, expect, it } from 'vitest';

import type { AuditEvent } from '@obora-kit/runtime';

import { InMemoryAuditStore } from '../audit/audit-store.js';
import { createDashboardServer } from '../index.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

const buildEvent = (overrides: Partial<AuditEvent> = {}): AuditEvent => {
  const id = overrides.id ?? `evt-${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    executionId: overrides.executionId ?? 'exec-1',
    timestamp: overrides.timestamp ?? new Date('2026-02-17T12:00:00.000Z'),
    type: overrides.type ?? 'step_start',
    data: overrides.data ?? { stepName: 'collect-inputs' },
    cellId: overrides.cellId,
    metadata: overrides.metadata,
  };
};

describe('audit api', () => {
  it('returns empty events from empty store', async () => {
    const store = new InMemoryAuditStore();
    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      events: [],
      total: 0,
      hasMore: false,
    });
  });

  it('filters by time range', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 'a', timestamp: new Date('2026-02-17T09:00:00.000Z') }),
      buildEvent({ id: 'b', timestamp: new Date('2026-02-17T10:00:00.000Z') }),
      buildEvent({ id: 'c', timestamp: new Date('2026-02-17T11:00:00.000Z') }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events?fromTime=2026-02-17T09:30:00.000Z&toTime=2026-02-17T10:30:00.000Z',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('b');
  });

  it('filters by event type', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 's1', type: 'step_start' }),
      buildEvent({ id: 'e1', type: 'execution_end' }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events?eventType=execution_end',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('e1');
  });

  it('filters by stepName', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 'one', data: { stepName: 'plan' } }),
      buildEvent({ id: 'two', data: { stepName: 'execute' } }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events?stepName=execute',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('two');
  });

  it('filters by executionId', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 'x1', executionId: 'exec-A' }),
      buildEvent({ id: 'x2', executionId: 'exec-B' }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events?executionId=exec-B',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('x2');
  });

  it('supports pagination', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 'p1', timestamp: new Date('2026-02-17T09:00:00.000Z') }),
      buildEvent({ id: 'p2', timestamp: new Date('2026-02-17T10:00:00.000Z') }),
      buildEvent({ id: 'p3', timestamp: new Date('2026-02-17T11:00:00.000Z') }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/events?limit=1&offset=1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 3,
      hasMore: true,
      limit: 1,
      offset: 1,
    });
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('p2');
  });

  it('returns event by id and 404 when missing', async () => {
    const store = new InMemoryAuditStore();
    store.addEvent(buildEvent({ id: 'lookup-id', executionId: 'exec-lookup' }));

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const foundResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/events/lookup-id',
    });

    expect(foundResponse.statusCode).toBe(200);
    expect(foundResponse.json().event.id).toBe('lookup-id');

    const missingResponse = await app.inject({
      method: 'GET',
      url: '/api/audit/events/not-found',
    });

    expect(missingResponse.statusCode).toBe(404);
    expect(missingResponse.json()).toMatchObject({
      code: 'DASH_5002',
    });
  });

  it('returns events by execution endpoint', async () => {
    const store = new InMemoryAuditStore();
    store.addEvents([
      buildEvent({ id: 'e-1', executionId: 'exec-1' }),
      buildEvent({ id: 'e-2', executionId: 'exec-2' }),
    ]);

    const { app } = await createDashboardServer({}, { auditStore: store });
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/audit/executions/exec-2/events',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().events).toHaveLength(1);
    expect(response.json().events[0].id).toBe('e-2');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDashboardServer } from '../index.js';
import { createChannel } from '../notification/channel-factory.js';
import { WebhookChannel } from '../notification/webhook-channel.js';
import type { ExecutionEvent, NotificationRule } from '../types.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

const createEvent = (overrides: Partial<ExecutionEvent> = {}): ExecutionEvent => ({
  id: 'exec-1:00000001',
  executionId: 'exec-1',
  timestamp: '2026-02-17T12:00:00.000Z',
  type: 'gate_wait',
  severity: 'warning',
  payload: {},
  ...overrides,
});

const createRule = (overrides: Partial<NotificationRule> = {}): NotificationRule => ({
  id: 'rule-1',
  name: 'webhook rule',
  enabled: true,
  trigger: { eventTypes: ['gate_wait'] },
  channel: 'https://example.com/hook',
  ...overrides,
});

describe('webhook channel', () => {
  it('sends webhook successfully', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = new WebhookChannel({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await channel.send(createEvent(), createRule());

    expect(result).toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://example.com/hook',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns failure when request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const channel = new WebhookChannel({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await channel.send(createEvent(), createRule());

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('returns timeout failure', async () => {
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('Request timed out')));
      }),
    );
    const channel = new WebhookChannel({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      timeoutMs: 20,
    });

    const result = await channel.send(createEvent(), createRule());

    expect(result.success).toBe(false);
    expect(result.error).toContain('timed out');
  });
});

describe('notification channel factory', () => {
  it('creates console and webhook channels', () => {
    expect(createChannel('console').name).toBe('console');
    expect(createChannel('webhook').name).toBe('webhook');
  });

  it('throws for unsupported channel type', () => {
    expect(() => createChannel('slack')).toThrow(/Unsupported notification channel type/);
  });
});

describe('notification api routes', () => {
  it('supports rule CRUD', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/notifications/rules',
      payload: {
        name: 'gate alert',
        enabled: true,
        trigger: { eventTypes: ['gate_wait'] },
        channel: 'console',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const ruleId = createResponse.json().rule.id as string;

    const listResponse = await app.inject({ method: 'GET', url: '/api/notifications/rules' });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().rules).toHaveLength(1);

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/notifications/rules/${ruleId}`,
      payload: { enabled: false },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().rule.enabled).toBe(false);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/notifications/rules/${ruleId}`,
    });

    expect(deleteResponse.statusCode).toBe(204);

    const listAfterDelete = await app.inject({ method: 'GET', url: '/api/notifications/rules' });
    expect(listAfterDelete.json().rules).toHaveLength(0);
  });
});

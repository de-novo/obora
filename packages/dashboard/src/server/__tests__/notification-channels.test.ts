import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChannel } from '../notification/channel-factory.js';
import { ConsoleChannel } from '../notification/console-channel.js';
import { WebhookChannel } from '../notification/webhook-channel.js';
import type { ExecutionEvent, NotificationRule } from '../types.js';
import { createQuietDashboardServer as createDashboardServer } from './test-server.js';

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

  it('uses template URLs for webhook rules and defaults constructor options', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    vi.stubGlobal('fetch', fetchImpl);
    const channel = new WebhookChannel();

    const result = await channel.send(
      createEvent({ payload: { count: 1 } }),
      createRule({ channel: 'webhook', template: 'https://events.example.com/hook' }),
    );

    expect(result).toEqual({ success: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://events.example.com/hook',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  it('returns failure when request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const channel = new WebhookChannel({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await channel.send(createEvent(), createRule());

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
  });

  it('normalizes thrown non-error values', async () => {
    const fetchImpl = vi.fn().mockRejectedValue('network refused');
    const channel = new WebhookChannel({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const result = await channel.send(createEvent(), createRule());

    expect(result).toEqual({ success: false, error: 'network refused' });
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

  it('rejects missing, invalid, non-http, and internal webhook targets', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const channel = new WebhookChannel({ fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(channel.send(createEvent(), createRule({ channel: 'webhook', template: undefined }))).resolves.toMatchObject({
      success: false,
      error: 'Webhook URL is missing in rule.channel or rule.template',
    });

    const badUrls = [
      'not a url',
      'ftp://example.com/hook',
      'http://127.0.0.1/hook',
      'http://10.1.2.3/hook',
      'http://172.16.2.3/hook',
      'http://172.31.255.255/hook',
      'http://192.168.0.10/hook',
      'http://169.254.10.20/hook',
      'http://0.0.0.0/hook',
      'http://[::1]/hook',
      'http://[::ffff:127.0.0.1]/hook',
      'http://[::ffff:8.8.8.8]/hook',
      'http://[::]/hook',
      'http://[0:0:0:0:0:0:0:1]/hook',
      'http://[fc00::1]/hook',
      'http://[fd00::1]/hook',
      'http://[fe80::1]/hook',
      'http://[fe90::1]/hook',
      'http://[fea0::1]/hook',
      'http://[feb0::1]/hook',
      'http://localhost/hook',
      'http://service.localhost/hook',
      'http://service.local/hook',
    ];

    for (const url of badUrls) {
      const result = await channel.send(createEvent(), createRule({ channel: url }));
      expect(result.success).toBe(false);
    }

    for (const url of ['http://172.15.2.3/hook', 'http://172.32.2.3/hook']) {
      const result = await channel.send(createEvent(), createRule({ channel: url }));
      expect(result.success).toBe(true);
    }

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'http://172.15.2.3/hook', expect.objectContaining({ method: 'POST' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'http://172.32.2.3/hook', expect.objectContaining({ method: 'POST' }));
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

describe('console channel', () => {
  it('logs direct, nested, and fallback event messages', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const channel = new ConsoleChannel();
    const rule = createRule({ channel: 'console' });

    await expect(
      channel.send(
        createEvent({ stepName: 'gate', payload: { message: 'direct message' } }),
        rule,
      ),
    ).resolves.toEqual({ success: true });
    await channel.send(
      createEvent({ severity: undefined, stepName: undefined, payload: { data: { message: 'nested message' } } }),
      rule,
    );
    await channel.send(createEvent({ payload: { data: { code: 'NO_MESSAGE' } } }), rule);

    expect(log.mock.calls.map((args) => String(args[0]))).toEqual([
      '[NOTIFICATION] [warning] gate_wait - gate: direct message',
      '[NOTIFICATION] [info] gate_wait - -: nested message',
      '[NOTIFICATION] [warning] gate_wait - -: No message',
    ]);
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

  it('validates create, update, and delete failure branches', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const invalidCreateResponses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/notifications/rules', payload: {} }),
      app.inject({
        method: 'POST',
        url: '/api/notifications/rules',
        payload: { name: 'missing channel', trigger: { eventTypes: ['gate_wait'] } },
      }),
      app.inject({
        method: 'POST',
        url: '/api/notifications/rules',
        payload: { name: 'missing trigger', channel: 'console' },
      }),
      app.inject({
        method: 'POST',
        url: '/api/notifications/rules',
        payload: { name: 'empty trigger', channel: 'console', trigger: { eventTypes: [] } },
      }),
    ]);

    expect(invalidCreateResponses.map((response) => response.statusCode)).toEqual([400, 400, 400, 400]);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/notifications/rules',
      payload: {
        id: 'fixed-rule',
        name: 'fixed',
        trigger: { eventTypes: ['gate_wait'] },
        channel: 'console',
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().rule).toMatchObject({ id: 'fixed-rule', enabled: true });

    const invalidUpdate = await app.inject({
      method: 'PUT',
      url: '/api/notifications/rules/fixed-rule',
      payload: { trigger: { eventTypes: [] } },
    });
    expect(invalidUpdate.statusCode).toBe(400);

    const missingUpdate = await app.inject({
      method: 'PUT',
      url: '/api/notifications/rules/missing-rule',
      payload: { enabled: false },
    });
    expect(missingUpdate.statusCode).toBe(404);

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/notifications/rules/fixed-rule',
      payload: { name: 'renamed', template: 'stdout' },
    });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().rule).toMatchObject({
      id: 'fixed-rule',
      name: 'renamed',
      trigger: { eventTypes: ['gate_wait'] },
      template: 'stdout',
    });

    const missingDelete = await app.inject({
      method: 'DELETE',
      url: '/api/notifications/rules/missing-rule',
    });
    expect(missingDelete.statusCode).toBe(404);
  });
});

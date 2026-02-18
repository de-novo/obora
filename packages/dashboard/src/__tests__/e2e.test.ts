import { afterEach, describe, expect, it, vi } from 'vitest';

import { connectWsClient, createTestAuditEvent, startTestServer } from './e2e-helpers.js';

const validPolicyYaml = `
version: "v1"
tools:
  - name: shell_exec
    effect: deny
`;

describe('dashboard e2e', () => {
  const servers: Array<Awaited<ReturnType<typeof startTestServer>>> = [];

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await Promise.all(servers.map((server) => server.close()));
    servers.length = 0;
  });

  it('실행 관찰 흐름: ws 수신 및 notification 발생', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const server = await startTestServer();
    servers.push(server);

    await server.app.inject({
      method: 'POST',
      url: '/api/notifications/rules',
      payload: {
        name: 'error webhook',
        trigger: { eventTypes: ['error'] },
        channel: 'webhook',
        template: 'https://hooks.example/e2e',
      },
    });

    const ws = await connectWsClient(server.wsUrl);

    const eventPromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on('message', (raw: unknown) => {
        const message = JSON.parse(String(raw)) as { type: string; payload: Record<string, unknown> };
        if (message.type === 'event') {
          resolve(message.payload);
        }
      });
    });

    const auditEvent = createTestAuditEvent({ type: 'error' });
    server.auditStore.addEvent(auditEvent);
    server.wsBridge.pushEvent(auditEvent);

    const wsEvent = await eventPromise;
    expect(wsEvent.type).toBe('error');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.example/e2e',
      expect.objectContaining({ method: 'POST' }),
    );

    ws.close();
  });

  it('감사 조회 흐름: 시간/타입 필터 및 단일 조회', async () => {
    const server = await startTestServer();
    servers.push(server);

    const now = new Date();
    const e1 = createTestAuditEvent({ type: 'step_start', timestamp: new Date(now.getTime() - 1000) });
    const e2 = createTestAuditEvent({ type: 'step_end', timestamp: new Date(now.getTime()) });
    const e3 = createTestAuditEvent({ type: 'error', timestamp: new Date(now.getTime() + 1000) });
    server.auditStore.addEvents([e1, e2, e3]);

    const params = new URLSearchParams({
      fromTime: new Date(now.getTime() - 500).toISOString(),
      toTime: new Date(now.getTime() + 1500).toISOString(),
      eventType: 'error',
    });

    const queryResponse = await server.app.inject({
      method: 'GET',
      url: `/api/audit/events?${params.toString()}`,
    });
    expect(queryResponse.statusCode).toBe(200);
    const queryJson = queryResponse.json() as { events: Array<{ id: string; type: string }> };
    expect(queryJson.events).toHaveLength(1);
    expect(queryJson.events[0]?.type).toBe('error');

    const singleResponse = await server.app.inject({
      method: 'GET',
      url: `/api/audit/events/${e2.id}`,
    });
    expect(singleResponse.statusCode).toBe(200);
    const singleJson = singleResponse.json() as { event: { id: string } };
    expect(singleJson.event.id).toBe(e2.id);
  });

  it('정책 수정 흐름: CRUD/diff/reload/revision conflict', async () => {
    const server = await startTestServer();
    servers.push(server);

    const createResponse = await server.app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: { name: 'e2e-policy', content: validPolicyYaml },
    });
    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json() as { policy: { id: string; revision: string; content: string } };

    const getResponse = await server.app.inject({ method: 'GET', url: `/api/policies/${created.policy.id}` });
    expect(getResponse.statusCode).toBe(200);

    const diffResponse = await server.app.inject({
      method: 'POST',
      url: `/api/policies/${created.policy.id}/diff`,
      payload: { content: validPolicyYaml.replace('deny', 'allow') },
    });
    expect(diffResponse.statusCode).toBe(200);

    const reloadResponse = await server.app.inject({
      method: 'POST',
      url: `/api/policies/${created.policy.id}/reload`,
      payload: { content: validPolicyYaml.replace('deny', 'allow'), revision: created.policy.revision },
    });
    expect(reloadResponse.statusCode).toBe(200);

    const updateResponse = await server.app.inject({
      method: 'PUT',
      url: `/api/policies/${created.policy.id}`,
      payload: { content: validPolicyYaml.replace('v1', 'v2'), revision: created.policy.revision },
    });
    expect(updateResponse.statusCode).toBe(409);
  });

  it('알림 흐름: rule 생성 후 매칭 이벤트에서 채널 호출', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const server = await startTestServer();
    servers.push(server);

    const createRuleResponse = await server.app.inject({
      method: 'POST',
      url: '/api/notifications/rules',
      payload: {
        name: 'gate webhook',
        trigger: { eventTypes: ['gate_wait'] },
        channel: 'webhook',
        template: 'https://hooks.example/gate',
      },
    });
    expect(createRuleResponse.statusCode).toBe(201);

    const event = createTestAuditEvent({ type: 'gate_wait' });
    server.auditStore.addEvent(event);
    server.wsBridge.pushEvent(event);

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://hooks.example/gate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

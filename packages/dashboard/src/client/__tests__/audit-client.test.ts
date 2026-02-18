import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AuditClientError,
  __private__,
  fetchAuditEvent,
  fetchAuditEvents,
  fetchExecutionEvents,
} from '../api/audit-client';

describe('audit-client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('serializes query params correctly', () => {
    const query = __private__.serializeAuditQueryParams({
      from: '2026-02-17T00:00:00.000Z',
      to: '2026-02-17T23:59:59.999Z',
      eventTypes: ['step_start', 'error'],
      stepName: 'plan',
      executionId: 'exec-1',
      limit: 20,
      offset: 40,
    });

    expect(query).toContain('fromTime=2026-02-17T00%3A00%3A00.000Z');
    expect(query).toContain('toTime=2026-02-17T23%3A59%3A59.999Z');
    expect(query).toContain('eventType=step_start');
    expect(query).toContain('eventType=error');
    expect(query).toContain('stepName=plan');
    expect(query).toContain('executionId=exec-1');
    expect(query).toContain('limit=20');
    expect(query).toContain('offset=40');
  });

  it('fetches audit events with mapped fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        events: [
          {
            id: 'evt-1',
            executionId: 'exec-1',
            timestamp: '2026-02-17T10:00:00.000Z',
            type: 'step_start',
            data: { stepName: 'collect' },
          },
        ],
        total: 1,
        hasMore: false,
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchAuditEvents({ stepName: 'collect' });

    expect(fetchMock).toHaveBeenCalledWith('/api/audit/events?stepName=collect');
    expect(result.total).toBe(1);
    expect(result.events[0]).toMatchObject({
      id: 'evt-1',
      executionId: 'exec-1',
      stepName: 'collect',
      severity: 'info',
    });
  });

  it('fetches single event and execution events', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          event: {
            id: 'evt-2',
            executionId: 'exec-2',
            timestamp: '2026-02-17T11:00:00.000Z',
            type: 'error',
            data: { stepName: 'run' },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          events: [],
          total: 0,
          hasMore: false,
        }),
      });

    vi.stubGlobal('fetch', fetchMock);

    const event = await fetchAuditEvent('evt-2');
    expect(event.severity).toBe('critical');

    await fetchExecutionEvents('exec-2', { limit: 10 });
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/audit/executions/exec-2/events?limit=10');
  });

  it('throws api and network errors', async () => {
    const apiFailure = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ code: 'DASH_5001', message: 'bad request' }),
    });

    vi.stubGlobal('fetch', apiFailure);

    await expect(fetchAuditEvents()).rejects.toMatchObject({
      code: 'DASH_5001',
      status: 400,
      message: 'bad request',
    });

    const networkFailure = vi.fn().mockRejectedValue(new Error('offline'));
    vi.stubGlobal('fetch', networkFailure);

    await expect(fetchAuditEvents()).rejects.toMatchObject({
      code: 'DASH_AUDIT_NETWORK_ERROR',
    });
  });
});

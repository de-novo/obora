import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createPolicy,
  deletePolicy,
  getPolicy,
  listPolicies,
  PolicyApiError,
  updatePolicy,
  validatePolicy,
} from '../api/policy-client';

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('policy-client', () => {
  it('calls list/get/create/update/delete endpoints', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          policies: [
            {
              id: 'p1',
              name: 'default',
              content: 'allow: true',
              revision: '1',
              createdAt: '2026-02-17T00:00:00.000Z',
              updatedAt: '2026-02-17T00:00:00.000Z',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          policy: {
            id: 'p1',
            name: 'default',
            content: 'allow: true',
            revision: '1',
            createdAt: '2026-02-17T00:00:00.000Z',
            updatedAt: '2026-02-17T00:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(201, {
          policy: {
            id: 'p2',
            name: 'new-policy',
            content: 'allow: false',
            revision: '1',
            createdAt: '2026-02-17T00:00:00.000Z',
            updatedAt: '2026-02-17T00:00:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          policy: {
            id: 'p2',
            name: 'new-policy',
            content: 'allow: true',
            revision: '2',
            createdAt: '2026-02-17T00:00:00.000Z',
            updatedAt: '2026-02-17T00:01:00.000Z',
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const list = await listPolicies();
    expect(list).toHaveLength(1);

    const detail = await getPolicy('p1');
    expect(detail.id).toBe('p1');

    const created = await createPolicy({ name: 'new-policy', content: 'allow: false' });
    expect(created.id).toBe('p2');

    const updated = await updatePolicy('p2', {
      name: 'new-policy',
      content: 'allow: true',
      revision: '1',
    });
    expect(updated.revision).toBe('2');

    await expect(deletePolicy('p2')).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenNthCalledWith(1, '/api/policies', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/policies/p1', expect.objectContaining({ method: 'GET' }));
    expect(fetchMock).toHaveBeenNthCalledWith(3, '/api/policies', expect.objectContaining({ method: 'POST' }));
    expect(fetchMock).toHaveBeenNthCalledWith(4, '/api/policies/p2', expect.objectContaining({ method: 'PUT' }));
    expect(fetchMock).toHaveBeenNthCalledWith(5, '/api/policies/p2', expect.objectContaining({ method: 'DELETE' }));
  });

  it('throws PolicyApiError on 409 revision conflict', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        code: 'DASH_8003',
        message: 'Revision conflict',
      }),
    );

    await expect(
      updatePolicy('p1', {
        content: 'allow: true',
        revision: '1',
      }),
    ).rejects.toMatchObject<Partial<PolicyApiError>>({
      status: 409,
      message: 'Revision conflict',
      code: 'DASH_8003',
    });
  });

  it('returns invalid result for validate 400 responses', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        code: 'DASH_8001',
        message: 'Policy validation failed',
        details: ['invalid yaml'],
      }),
    );

    const result = await validatePolicy('invalid');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(['invalid yaml']);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/policies/validate',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDashboardServer } from '../index.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

const validPolicyYaml = `
version: "v1"
tools:
  - name: shell_exec
    effect: deny
`;

describe('policy api', () => {
  it('supports policy CRUD flow', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'base-policy',
        content: validPolicyYaml,
      },
    });

    expect(createResponse.statusCode).toBe(201);
    const created = createResponse.json().policy;
    expect(created.name).toBe('base-policy');
    expect(created.revision).toBe('1');

    const listResponse = await app.inject({ method: 'GET', url: '/api/policies' });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().policies).toHaveLength(1);

    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/policies/${created.id}`,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json().policy.id).toBe(created.id);

    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/policies/${created.id}`,
      payload: {
        name: 'base-policy-v2',
        content: validPolicyYaml.replace('v1', 'v2'),
        revision: created.revision,
      },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().policy.name).toBe('base-policy-v2');
    expect(updateResponse.json().policy.revision).toBe('2');

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/policies/${created.id}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const missingAfterDelete = await app.inject({
      method: 'GET',
      url: `/api/policies/${created.id}`,
    });
    expect(missingAfterDelete.statusCode).toBe(404);
    expect(missingAfterDelete.json().code).toBe('DASH_8002');
  });

  it('returns 400 when YAML is invalid', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const missingBody = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'missing-content',
      },
    });
    expect(missingBody.statusCode).toBe(400);
    expect(missingBody.json().details).toEqual(['name and content are required']);

    const response = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'broken',
        content: 'tools: [',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('DASH_8001');
    expect(Array.isArray(response.json().details)).toBe(true);
  });

  it('returns 400 when policy engine rejects create or update apply', async () => {
    const loadInline = vi.fn(() => {
      throw new Error('engine rejected');
    });
    const { app } = await createDashboardServer({}, { policyEngine: { loadInline } });
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'engine-reject',
        content: validPolicyYaml,
      },
    });
    expect(createResponse.statusCode).toBe(400);
    expect(createResponse.json().details).toEqual(['engine rejected']);

    loadInline.mockReset();
    const okCreate = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'update-engine-reject',
        content: validPolicyYaml,
      },
    });
    expect(okCreate.statusCode).toBe(201);
    const created = okCreate.json().policy;

    loadInline.mockImplementation(() => {
      throw new Error('update rejected');
    });
    const updateResponse = await app.inject({
      method: 'PUT',
      url: `/api/policies/${created.id}`,
      payload: {
        content: validPolicyYaml.replace('v1', 'v2'),
        revision: created.revision,
      },
    });
    expect(updateResponse.statusCode).toBe(400);
    expect(updateResponse.json().details).toEqual(['update rejected']);
  });

  it('returns 409 on revision conflict', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'conflict-test',
        content: validPolicyYaml,
      },
    });

    const created = createResponse.json().policy;

    const firstUpdate = await app.inject({
      method: 'PUT',
      url: `/api/policies/${created.id}`,
      payload: {
        content: validPolicyYaml.replace('v1', 'v2'),
        revision: created.revision,
      },
    });

    expect(firstUpdate.statusCode).toBe(200);

    const conflictUpdate = await app.inject({
      method: 'PUT',
      url: `/api/policies/${created.id}`,
      payload: {
        content: validPolicyYaml.replace('v1', 'v3'),
        revision: created.revision,
      },
    });

    expect(conflictUpdate.statusCode).toBe(409);
    expect(conflictUpdate.json().code).toBe('DASH_8003');
  });

  it('returns 404 for missing policy', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/policies/not-exists',
    });

    expect(getResponse.statusCode).toBe(404);
    expect(getResponse.json().code).toBe('DASH_8002');

    const updateMissing = await app.inject({
      method: 'PUT',
      url: '/api/policies/not-exists',
      payload: {
        content: validPolicyYaml,
        revision: '1',
      },
    });
    expect(updateMissing.statusCode).toBe(404);

    const deleteMissing = await app.inject({
      method: 'DELETE',
      url: '/api/policies/not-exists',
    });
    expect(deleteMissing.statusCode).toBe(404);
  });

  it('supports diff and reload endpoints', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'diff-reload',
        content: validPolicyYaml,
      },
    });

    const created = createResponse.json().policy;

    const diffResponse = await app.inject({
      method: 'POST',
      url: `/api/policies/${created.id}/diff`,
      payload: {
        content: validPolicyYaml.replace('deny', 'allow'),
      },
    });

    expect(diffResponse.statusCode).toBe(200);
    expect(diffResponse.json().diff.changes.length).toBeGreaterThan(0);

    const missingDiffContent = await app.inject({
      method: 'POST',
      url: `/api/policies/${created.id}/diff`,
      payload: {},
    });
    expect(missingDiffContent.statusCode).toBe(400);

    const missingDiffPolicy = await app.inject({
      method: 'POST',
      url: '/api/policies/not-exists/diff',
      payload: {
        content: validPolicyYaml,
      },
    });
    expect(missingDiffPolicy.statusCode).toBe(404);

    const reloadResponse = await app.inject({
      method: 'POST',
      url: `/api/policies/${created.id}/reload`,
      payload: {
        content: validPolicyYaml.replace('deny', 'allow'),
        revision: created.revision,
      },
    });

    expect(reloadResponse.statusCode).toBe(200);
    expect(reloadResponse.json().result.success).toBe(true);

    const missingReloadBody = await app.inject({
      method: 'POST',
      url: `/api/policies/${created.id}/reload`,
      payload: {
        content: validPolicyYaml,
      },
    });
    expect(missingReloadBody.statusCode).toBe(400);
  });

  it('keeps stored policy unchanged when reload persistence fails', async () => {
    const loadInline = vi.fn();
    const { app } = await createDashboardServer({}, { policyEngine: { loadInline } });
    servers.push(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/policies',
      payload: {
        name: 'rollback-reload',
        content: validPolicyYaml,
      },
    });

    const created = createResponse.json().policy;

    const response = await app.inject({
      method: 'POST',
      url: `/api/policies/${created.id}/reload`,
      payload: {
        content: validPolicyYaml.replace('deny', 'allow'),
        revision: 'stale-revision',
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().details?.[0]).toContain('Revision conflict');

    const persisted = await app.inject({ method: 'GET', url: `/api/policies/${created.id}` });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json().policy.content).toContain('deny');
    expect(loadInline).toHaveBeenCalledTimes(3);
  });

  it('validates policy without saving', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const validResponse = await app.inject({
      method: 'POST',
      url: '/api/policies/validate',
      payload: {
        content: validPolicyYaml,
      },
    });

    expect(validResponse.statusCode).toBe(200);
    expect(validResponse.json()).toEqual({ valid: true, errors: [] });

    const invalidResponse = await app.inject({
      method: 'POST',
      url: '/api/policies/validate',
      payload: {
        content: 'gates: 1',
      },
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json().code).toBe('DASH_8001');

    const missingContent = await app.inject({
      method: 'POST',
      url: '/api/policies/validate',
      payload: {},
    });
    expect(missingContent.statusCode).toBe(400);
  });
});

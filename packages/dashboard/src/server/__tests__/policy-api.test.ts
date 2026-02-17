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
  });
});

import { afterEach, describe, expect, it } from 'vitest';

import { createDashboardServer } from '../index.js';

const servers: Array<Awaited<ReturnType<typeof createDashboardServer>>['app']> = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  servers.length = 0;
});

describe('dashboard server', () => {
  it('starts and stops cleanly', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    await app.listen({ host: '127.0.0.1', port: 0 });
    expect(app.server.listening).toBe(true);
  });

  it('returns 200 from health endpoint', async () => {
    const { app } = await createDashboardServer();
    servers.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      service: '@obora/dashboard',
    });
  });
});

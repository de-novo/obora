import type { FastifyInstance } from 'fastify';

export const registerHealthRoute = (app: FastifyInstance, apiBasePath: string): void => {
  app.get(`${apiBasePath}/health`, async () => ({
    ok: true,
    service: '@obora/dashboard',
  }));
};

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  createDashboardConfig,
  type DashboardConfig,
  DEFAULT_DASHBOARD_CONFIG,
} from './config.js';
import { InMemoryAuditStore, type AuditStore } from './audit/audit-store.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerHealthRoute } from './routes/health.js';
import { createWsBridge, type WsBridge } from './ws-bridge.js';

export interface DashboardServerDependencies {
  auditStore?: AuditStore;
}

export const createDashboardServer = async (
  overrides: Partial<DashboardConfig> = {},
  dependencies: DashboardServerDependencies = {},
): Promise<{ app: FastifyInstance; config: DashboardConfig; wsBridge: WsBridge }> => {
  const config = createDashboardConfig(overrides);
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyCors, {
    origin: config.corsOrigin,
  });

  await app.register(fastifyWebsocket);
  const wsBridge = createWsBridge(app, {
    wsPath: config.wsPath,
  });

  const auditStore = dependencies.auditStore ?? new InMemoryAuditStore();
  registerHealthRoute(app, config.apiBasePath);
  registerAuditRoutes(app, config.apiBasePath, auditStore);

  const indexPath = join(config.staticDir, 'index.html');
  if (existsSync(indexPath)) {
    await app.register(fastifyStatic, {
      root: config.staticDir,
      prefix: '/',
    });
  }

  app.setNotFoundHandler(async (_, reply) => {
    if (!existsSync(indexPath)) {
      return reply.code(404).send({
        code: 'DASH_1001',
        message: 'Dashboard static assets not found. Build client first.',
      });
    }

    return reply.type('text/html').sendFile('index.html');
  });

  return { app, config, wsBridge };
};

const start = async (): Promise<void> => {
  const { app, config } = await createDashboardServer();

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    app.log.error(error, 'DASH_1002 Failed to start dashboard server');
    process.exitCode = 1;
  }
};

if (process.env.NODE_ENV !== 'test') {
  void start();
}

export { DEFAULT_DASHBOARD_CONFIG };

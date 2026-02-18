import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
  createDashboardConfig,
  type DashboardConfig,
  DEFAULT_DASHBOARD_CONFIG,
} from './config.js';
import { InMemoryAuditStore, type AuditStore } from './audit/audit-store.js';
import { InMemoryPolicyStore, type PolicyStore } from './policy/policy-store.js';
import { registerAuditRoutes } from './routes/audit.js';
import { registerHealthRoute } from './routes/health.js';
import { registerPolicyRoutes, type PolicyEngineAdapter } from './routes/policy.js';
import { createWsBridge, type WsBridge } from './ws-bridge.js';
import { NotificationEngine } from './notification/engine.js';
import { createChannel } from './notification/channel-factory.js';
import { registerNotificationRoutes } from './routes/notification.js';
import { AdapterHistoryStore, InMemoryHistoryStore, type HistoryStore } from './history/history-store.js';
import { registerHistoryRoutes } from './routes/history.js';

export interface DashboardServerDependencies {
  auditStore?: AuditStore;
  policyStore?: PolicyStore;
  policyEngine?: PolicyEngineAdapter;
  notificationEngine?: NotificationEngine;
  historyStore?: HistoryStore;
}

const execFileAsync = promisify(execFile);

const createDefaultHistoryStore = async (): Promise<HistoryStore> => {
  const sqlitePath = process.env.OBORA_HISTORY_DB_PATH;
  if (!sqlitePath) {
    return new InMemoryHistoryStore();
  }

  try {
    const runtime = await import('@obora/runtime');
    const adapter = new runtime.SQLiteStorageAdapter({ path: sqlitePath }) as unknown as Record<string, unknown>;

    const requiredMethods = [
      'listRuns',
      'getRun',
      'getSteps',
      'getRunCostSummary',
      'getAuditTimeline',
      'getLatestCheckpoint',
      'saveRun',
    ] as const;

    const hasAllMethods = requiredMethods.every((method) => typeof adapter[method] === 'function');
    if (!hasAllMethods) {
      return new InMemoryHistoryStore();
    }

    return new AdapterHistoryStore(
      adapter as never,
      async (runId) => {
        const command = process.env.OBORA_RESUME_COMMAND;
        if (!command) {
          return { ok: false, reason: 'Resume command is not configured (OBORA_RESUME_COMMAND)' };
        }

        const parts = command.split(' ').filter(Boolean);
        const binary = parts[0];
        const args = parts.slice(1);
        if (!binary) {
          return { ok: false, reason: 'OBORA_RESUME_COMMAND is empty after parsing' };
        }
        // Validate runId to prevent argument injection (alphanumeric, hyphens, underscores, colons, dots only)
        if (!/^[\w.:@#%+-]+$/.test(runId)) {
          return { ok: false, reason: 'Invalid runId format' };
        }
        try {
          await execFileAsync(binary, [...args, runId], { cwd: process.cwd() });
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            reason: error instanceof Error ? error.message : 'Resume command failed',
          };
        }
      },
    );
  } catch {
    return new InMemoryHistoryStore();
  }
};

export const createDashboardServer = async (
  overrides: Partial<DashboardConfig> = {},
  dependencies: DashboardServerDependencies = {},
): Promise<{ app: FastifyInstance; config: DashboardConfig; wsBridge: WsBridge; notificationEngine: NotificationEngine }> => {
  const config = createDashboardConfig(overrides);
  const app = Fastify({
    logger: true,
  });

  await app.register(fastifyCors, {
    origin: config.corsOrigin,
  });

  await app.register(fastifyWebsocket);

  const notificationEngine = dependencies.notificationEngine ?? new NotificationEngine({
    logger: {
      error: (message, meta) => app.log.error(meta ?? {}, message),
    },
  });
  notificationEngine.registerChannel(createChannel('console'));
  notificationEngine.registerChannel(createChannel('webhook'));

  const wsBridge = createWsBridge(app, {
    wsPath: config.wsPath,
    onEvent: async (event) => {
      await notificationEngine.processEvent(event);
    },
  });

  const auditStore = dependencies.auditStore ?? new InMemoryAuditStore();
  const policyStore = dependencies.policyStore ?? new InMemoryPolicyStore();
  const policyEngine = dependencies.policyEngine;
  const historyStore = dependencies.historyStore ?? (await createDefaultHistoryStore());

  const hotReloadAuditTrail =
    'addEvent' in auditStore && typeof auditStore.addEvent === 'function'
      ? {
          addEvent: auditStore.addEvent.bind(auditStore),
        }
      : undefined;

  registerHealthRoute(app, config.apiBasePath);
  registerAuditRoutes(app, config.apiBasePath, auditStore);
  registerPolicyRoutes(app, config.apiBasePath, policyStore, policyEngine, hotReloadAuditTrail);
  registerNotificationRoutes(app, config.apiBasePath, notificationEngine);
  registerHistoryRoutes(app, config.apiBasePath, historyStore);

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

  return { app, config, wsBridge, notificationEngine };
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

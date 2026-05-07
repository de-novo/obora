import type { FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { createDashboardConfig, type DashboardConfig } from './config.js';
import {
  createDashboardServer,
  type DashboardServerDependencies,
  type DashboardServerHandle,
} from './index.js';

export type DashboardBootstrapErrorCode =
  | 'DASH_BOOTSTRAP_INVALID_HOST'
  | 'DASH_BOOTSTRAP_INVALID_PORT'
  | 'DASH_BOOTSTRAP_STATIC_ASSETS_MISSING'
  | 'DASH_BOOTSTRAP_LISTEN_FAILED';

export type DashboardBootstrapFailure =
  | 'validation'
  | 'static-assets'
  | 'listen';

export class DashboardBootstrapError extends Error {
  public readonly code: DashboardBootstrapErrorCode;
  public readonly failure: DashboardBootstrapFailure;
  public override readonly cause?: unknown;

  public constructor(
    code: DashboardBootstrapErrorCode,
    failure: DashboardBootstrapFailure,
    message: string,
    cause?: unknown,
  ) {
    super(message);
    this.name = 'DashboardBootstrapError';
    this.code = code;
    this.failure = failure;
    this.cause = cause;
  }
}

export interface DashboardStaticAssetsStatus {
  indexPath: string;
  available: boolean;
}

export interface DashboardBootstrapOptions {
  config?: Partial<DashboardConfig>;
  dependencies?: DashboardServerDependencies;
  requireStaticAssets?: boolean;
}

export interface DashboardBootstrapResult extends DashboardServerHandle {
  host: string;
  port: number;
  url: string;
  staticAssets: DashboardStaticAssetsStatus;
  close(): Promise<void>;
}

const validateHost = (host: string): void => {
  if (host.trim().length === 0 || /\s/.test(host)) {
    throw new DashboardBootstrapError(
      'DASH_BOOTSTRAP_INVALID_HOST',
      'validation',
      `Invalid dashboard host: ${host || '(empty)'}`,
    );
  }
};

const validatePort = (port: number): void => {
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new DashboardBootstrapError(
      'DASH_BOOTSTRAP_INVALID_PORT',
      'validation',
      `Invalid dashboard port: ${String(port)}. Expected an integer from 0 to 65535.`,
    );
  }
};

const toUrlHost = (host: string): string => {
  if (host === '0.0.0.0' || host === '::') {
    return 'localhost';
  }

  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
};

const getListeningPort = (app: FastifyInstance, fallbackPort: number): number => {
  const address = app.server.address();
  if (typeof address === 'object' && address?.port) {
    return address.port;
  }
  return fallbackPort;
};

export const inspectDashboardStaticAssets = (
  staticDir: string,
): DashboardStaticAssetsStatus => {
  const indexPath = join(staticDir, 'index.html');
  return {
    indexPath,
    available: existsSync(indexPath),
  };
};

export const getDashboardUrl = (host: string, port: number): string => {
  return `http://${toUrlHost(host)}:${port}`;
};

export const bootstrapDashboardServer = async (
  options: DashboardBootstrapOptions = {},
): Promise<DashboardBootstrapResult> => {
  const config = createDashboardConfig(options.config);

  validateHost(config.host);
  validatePort(config.port);

  const staticAssets = inspectDashboardStaticAssets(config.staticDir);
  if (options.requireStaticAssets === true && !staticAssets.available) {
    throw new DashboardBootstrapError(
      'DASH_BOOTSTRAP_STATIC_ASSETS_MISSING',
      'static-assets',
      `Dashboard static assets not found at ${staticAssets.indexPath}. Build the dashboard client first.`,
    );
  }

  const handle = await createDashboardServer(config, options.dependencies);
  const { app } = handle;

  try {
    await app.listen({
      host: config.host,
      port: config.port,
    });
  } catch (error) {
    await app.close().catch(() => undefined);
    throw new DashboardBootstrapError(
      'DASH_BOOTSTRAP_LISTEN_FAILED',
      'listen',
      `Failed to start dashboard server on ${config.host}:${config.port}`,
      error,
    );
  }

  const port = getListeningPort(app, config.port);
  let closed = false;

  return {
    ...handle,
    host: config.host,
    port,
    url: getDashboardUrl(config.host, port),
    staticAssets,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      await app.close();
    },
  };
};

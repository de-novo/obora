import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  DashboardBootstrapError,
  bootstrapDashboardServer,
  getDashboardUrl,
  inspectDashboardStaticAssets,
  type DashboardBootstrapOptions,
  type DashboardBootstrapResult,
} from '../bootstrap.js';

const handles: DashboardBootstrapResult[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
  handles.length = 0;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

const createTempDir = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'obora-dashboard-bootstrap-'));
  tempDirs.push(dir);
  return dir;
};

const createStaticDir = async (): Promise<string> => {
  const dir = await createTempDir();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'index.html'), '<!doctype html><title>Obora</title>', 'utf-8');
  return dir;
};

const bootstrapQuietDashboardServer = (
  options: DashboardBootstrapOptions = {},
): Promise<DashboardBootstrapResult> =>
  bootstrapDashboardServer({
    ...options,
    dependencies: {
      ...options.dependencies,
      logger: false,
    },
  });

describe('dashboard bootstrap helper', () => {
  it('starts, reports launch metadata, and closes idempotently', async () => {
    const staticDir = await createStaticDir();
    const handle = await bootstrapQuietDashboardServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        staticDir,
      },
      requireStaticAssets: true,
    });
    handles.push(handle);

    expect(handle.config.host).toBe('127.0.0.1');
    expect(handle.host).toBe('127.0.0.1');
    expect(handle.port).toBeGreaterThan(0);
    expect(handle.url).toBe(`http://127.0.0.1:${handle.port}`);
    expect(handle.staticAssets).toEqual({
      indexPath: join(staticDir, 'index.html'),
      available: true,
    });

    const response = await handle.app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);

    await handle.close();
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it('reports static asset availability without requiring client assets', async () => {
    const staticDir = await createTempDir();
    const handle = await bootstrapQuietDashboardServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        staticDir,
      },
    });
    handles.push(handle);

    expect(handle.staticAssets).toEqual({
      indexPath: join(staticDir, 'index.html'),
      available: false,
    });
  });

  it('rejects invalid host and port before listening', async () => {
    await expect(
      bootstrapQuietDashboardServer({ config: { host: '', port: 0 } }),
    ).rejects.toMatchObject({
      code: 'DASH_BOOTSTRAP_INVALID_HOST',
      failure: 'validation',
    });
    await expect(
      bootstrapQuietDashboardServer({ config: { host: 'bad host', port: 0 } }),
    ).rejects.toMatchObject({
      code: 'DASH_BOOTSTRAP_INVALID_HOST',
      failure: 'validation',
    });
    await expect(
      bootstrapQuietDashboardServer({ config: { host: '127.0.0.1', port: 65536 } }),
    ).rejects.toMatchObject({
      code: 'DASH_BOOTSTRAP_INVALID_PORT',
      failure: 'validation',
    });
  });

  it('rejects required static assets when the client build is missing', async () => {
    const staticDir = await createTempDir();

    await expect(
      bootstrapQuietDashboardServer({
        config: {
          host: '127.0.0.1',
          port: 0,
          staticDir,
        },
        requireStaticAssets: true,
      }),
    ).rejects.toMatchObject({
      code: 'DASH_BOOTSTRAP_STATIC_ASSETS_MISSING',
      failure: 'static-assets',
      message: expect.stringContaining(join(staticDir, 'index.html')),
    });
  });

  it('normalizes dashboard URLs for wildcard and IPv6 hosts', () => {
    expect(getDashboardUrl('0.0.0.0', 3100)).toBe('http://localhost:3100');
    expect(getDashboardUrl('::', 3100)).toBe('http://localhost:3100');
    expect(getDashboardUrl('::1', 3100)).toBe('http://[::1]:3100');
    expect(getDashboardUrl('localhost', 3100)).toBe('http://localhost:3100');
  });

  it('inspects static asset presence directly', async () => {
    const staticDir = await createStaticDir();
    expect(inspectDashboardStaticAssets(staticDir)).toEqual({
      indexPath: join(staticDir, 'index.html'),
      available: true,
    });
  });

  it('wraps listen failures with a bootstrap error', async () => {
    const staticDir = await createStaticDir();
    const first = await bootstrapQuietDashboardServer({
      config: {
        host: '127.0.0.1',
        port: 0,
        staticDir,
      },
    });
    handles.push(first);

    await expect(
      bootstrapQuietDashboardServer({
        config: {
          host: '127.0.0.1',
          port: first.port,
          staticDir,
        },
      }),
    ).rejects.toBeInstanceOf(DashboardBootstrapError);
    await expect(
      bootstrapQuietDashboardServer({
        config: {
          host: '127.0.0.1',
          port: first.port,
          staticDir,
        },
      }),
    ).rejects.toMatchObject({
      code: 'DASH_BOOTSTRAP_LISTEN_FAILED',
      failure: 'listen',
      cause: expect.any(Error),
    });
  });
});

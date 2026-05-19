import { resolve } from 'node:path';

export interface DashboardConfig {
  host: string;
  port: number;
  wsPath: string;
  apiBasePath: string;
  staticDir: string;
  corsOrigin: string | boolean | RegExp | Array<string | RegExp>;
}

const LOCAL_DASHBOARD_CORS_ORIGINS = [/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/];

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  host: '127.0.0.1',
  port: 3100,
  wsPath: '/ws',
  apiBasePath: '/api',
  staticDir: resolve(process.cwd(), 'dist/client'),
  corsOrigin: LOCAL_DASHBOARD_CORS_ORIGINS,
};

export const createDashboardConfig = (
  overrides: Partial<DashboardConfig> = {},
): DashboardConfig => ({
  ...DEFAULT_DASHBOARD_CONFIG,
  ...overrides,
});

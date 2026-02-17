import { resolve } from 'node:path';

export interface DashboardConfig {
  host: string;
  port: number;
  wsPath: string;
  apiBasePath: string;
  staticDir: string;
  corsOrigin: string | boolean | RegExp | Array<string | RegExp>;
}

export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  host: '0.0.0.0',
  port: 3100,
  wsPath: '/ws',
  apiBasePath: '/api',
  staticDir: resolve(process.cwd(), 'dist/client'),
  corsOrigin: true,
};

export const createDashboardConfig = (
  overrides: Partial<DashboardConfig> = {},
): DashboardConfig => ({
  ...DEFAULT_DASHBOARD_CONFIG,
  ...overrides,
});

import type { DashboardConfig } from '../config.js';
import {
  createDashboardServer,
  type DashboardServerDependencies,
} from '../index.js';

export const createQuietDashboardServer = (
  overrides: Partial<DashboardConfig> = {},
  dependencies: DashboardServerDependencies = {},
): ReturnType<typeof createDashboardServer> =>
  createDashboardServer(overrides, {
    ...dependencies,
    logger: false,
  });

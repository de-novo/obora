import { describe, expect, it } from 'vitest';

import { createDashboardConfig, DEFAULT_DASHBOARD_CONFIG } from '../config.js';

describe('DashboardConfig', () => {
  it('provides stable defaults', () => {
    const config = createDashboardConfig();

    expect(config.host).toBe(DEFAULT_DASHBOARD_CONFIG.host);
    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(DEFAULT_DASHBOARD_CONFIG.port);
    expect(config.wsPath).toBe('/ws');
    expect(config.apiBasePath).toBe('/api');
    expect(config.corsOrigin).toEqual([/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/]);
    expect(typeof config.staticDir).toBe('string');
  });
});

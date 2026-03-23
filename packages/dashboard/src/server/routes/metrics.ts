import type { FastifyInstance } from 'fastify';

/**
 * Metrics endpoint — serves Prometheus-compatible metrics.
 *
 * The actual MetricsCollector is injected from the runtime.
 * If no collector is provided, returns empty metrics.
 */

export interface MetricsRouteOptions {
  getPrometheusMetrics?: () => string;
  getJsonMetrics?: () => Record<string, unknown>;
}

export const registerMetricsRoutes = (
  app: FastifyInstance,
  apiBasePath: string,
  options: MetricsRouteOptions = {},
): void => {
  // Prometheus text format endpoint
  app.get(`${apiBasePath}/metrics`, async (_request, reply) => {
    const metrics = options.getPrometheusMetrics?.() ?? '';
    return reply
      .header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
      .send(metrics);
  });

  // JSON metrics endpoint (for dashboards / OTEL bridge)
  app.get(`${apiBasePath}/metrics/json`, async () => {
    return options.getJsonMetrics?.() ?? { counters: [], gauges: [], histograms: [] };
  });
};

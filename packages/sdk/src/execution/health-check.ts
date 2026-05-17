/**
 * Health Check for workflow execution monitoring.
 *
 * Detects stuck executions, resource exhaustion, and system degradation.
 */

export interface HealthStatus {
  healthy: boolean;
  checks: HealthCheckResult[];
  timestamp: string;
}

export interface HealthCheckResult {
  name: string;
  status: "pass" | "fail" | "warn";
  message?: string;
  metadata?: Record<string, unknown>;
}

export interface HealthCheckConfig {
  /** Interval in ms between health checks. Default: 60000 (1 min) */
  intervalMs?: number;
  /** Max execution time before flagging as stuck. Default: 7200000 (2 hours) */
  stuckThresholdMs?: number;
  /** Enable periodic health check polling. Default: false */
  enabled?: boolean;
}

export type HealthCheckFn = () => Promise<Omit<HealthCheckResult, "name"> & { name?: string }>;

import { DEFAULTS } from "../defaults.js";

export class HealthChecker {
  private readonly checks = new Map<string, HealthCheckFn>();
  private timer?: ReturnType<typeof setInterval>;
  private readonly intervalMs: number;
  private lastStatus?: HealthStatus;
  private listeners: Array<(status: HealthStatus) => void> = [];

  constructor(config: HealthCheckConfig = {}) {
    this.intervalMs = config.intervalMs ?? DEFAULTS.HEALTH_CHECK_INTERVAL_MS;
  }

  /** Register a named health check function */
  register(name: string, check: HealthCheckFn): void {
    this.checks.set(name, check);
  }

  /** Run all registered checks and return aggregate status */
  async check(): Promise<HealthStatus> {
    const results = await [...this.checks].reduce<Promise<HealthCheckResult[]>>(
      async (previous, [name, checkFn]) => {
        const results = await previous;
        try {
          const result = await checkFn();
          return [...results, { ...result, name }];
        } catch (err) {
          return [
            ...results,
            {
              name,
              status: "fail" as const,
              message: err instanceof Error ? err.message : String(err),
            },
          ];
        }
      },
      Promise.resolve([])
    );

    const status: HealthStatus = {
      healthy: results.every((r) => r.status !== "fail"),
      checks: results,
      timestamp: new Date().toISOString(),
    };

    this.lastStatus = status;

    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch {
        // ignore listener errors
      }
    });

    return status;
  }

  /** Get last cached health status */
  getLastStatus(): HealthStatus | undefined {
    return this.lastStatus;
  }

  /** Subscribe to health status updates */
  onStatusChange(listener: (status: HealthStatus) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /** Start periodic health checking */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.check();
    }, this.intervalMs);
    // Run immediately
    void this.check();
  }

  /** Stop periodic health checking */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.stop();
    this.checks.clear();
    this.listeners = [];
  }
}

/**
 * Built-in health check: stuck execution detection
 */
export function createStuckExecutionCheck(
  getActiveExecutions: () => Array<{ id: string; startedAt: Date; workflowName: string }>,
  thresholdMs: number = DEFAULTS.STALE_LOCK_THRESHOLD_MS,
): HealthCheckFn {
  return async () => {
    const now = Date.now();
    const stuck = getActiveExecutions().filter(
      (e) => now - e.startedAt.getTime() > thresholdMs,
    );

    if (stuck.length > 0) {
      return {
        name: "stuck_execution",
        status: "fail",
        message: `${stuck.length} execution(s) stuck for > ${Math.round(thresholdMs / 60000)}min`,
        metadata: { stuckExecutions: stuck.map((e) => ({ id: e.id, workflow: e.workflowName, runningMs: now - e.startedAt.getTime() })) },
      };
    }

    return { name: "stuck_execution", status: "pass" };
  };
}

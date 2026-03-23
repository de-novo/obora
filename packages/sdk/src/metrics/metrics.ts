/**
 * Metrics collection and export for Obora workflows.
 *
 * Collects execution metrics (counters, gauges, histograms) and exposes
 * them in Prometheus text format or as structured JSON for OTEL integration.
 */

export interface MetricPoint {
  name: string;
  type: "counter" | "gauge" | "histogram";
  value: number;
  labels?: Record<string, string>;
  timestamp?: number;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric {
  name: string;
  labels?: Record<string, string>;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface MetricsSnapshot {
  counters: MetricPoint[];
  gauges: MetricPoint[];
  histograms: HistogramMetric[];
  exportedAt: string;
}

export class MetricsCollector {
  private counters = new Map<string, MetricPoint>();
  private gauges = new Map<string, MetricPoint>();
  private histograms = new Map<string, { values: number[]; labels?: Record<string, string> }>();

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const sorted = Object.entries(labels).sort(([a], [b]) => a.localeCompare(b));
    return `${name}{${sorted.map(([k, v]) => `${k}="${v}"`).join(",")}}`;
  }

  /** Increment a counter */
  increment(name: string, value: number = 1, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    const existing = this.counters.get(k);
    if (existing) {
      existing.value += value;
    } else {
      this.counters.set(k, { name, type: "counter", value, labels });
    }
  }

  /** Set a gauge value */
  gauge(name: string, value: number, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    this.gauges.set(k, { name, type: "gauge", value, labels });
  }

  /** Record a histogram observation */
  observe(name: string, value: number, labels?: Record<string, string>): void {
    const k = this.key(name, labels);
    const existing = this.histograms.get(k);
    if (existing) {
      existing.values.push(value);
    } else {
      this.histograms.set(k, { values: [value], labels });
    }
  }

  /** Get a snapshot of all metrics */
  snapshot(): MetricsSnapshot {
    const defaultBuckets = [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600];

    const histogramMetrics: HistogramMetric[] = [];
    for (const [, hist] of this.histograms) {
      const sorted = [...hist.values].sort((a, b) => a - b);
      const buckets: HistogramBucket[] = defaultBuckets.map((le) => ({
        le,
        count: sorted.filter((v) => v <= le).length,
      }));
      buckets.push({ le: Infinity, count: sorted.length });

      histogramMetrics.push({
        name: this.histograms.entries().next().value?.[0].split("{")[0] ?? "unknown",
        labels: hist.labels,
        buckets,
        sum: sorted.reduce((a, b) => a + b, 0),
        count: sorted.length,
      });
    }

    return {
      counters: [...this.counters.values()],
      gauges: [...this.gauges.values()],
      histograms: histogramMetrics,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Export metrics in Prometheus text format */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const [, metric] of this.counters) {
      const labelStr = this.formatLabels(metric.labels);
      lines.push(`# TYPE ${metric.name} counter`);
      lines.push(`${metric.name}${labelStr} ${metric.value}`);
    }

    for (const [, metric] of this.gauges) {
      const labelStr = this.formatLabels(metric.labels);
      lines.push(`# TYPE ${metric.name} gauge`);
      lines.push(`${metric.name}${labelStr} ${metric.value}`);
    }

    const defaultBuckets = [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600];
    for (const [name, hist] of this.histograms) {
      const baseName = name.split("{")[0]!;
      const labelStr = this.formatLabels(hist.labels);
      const sorted = [...hist.values].sort((a, b) => a - b);

      lines.push(`# TYPE ${baseName} histogram`);
      for (const le of defaultBuckets) {
        const count = sorted.filter((v) => v <= le).length;
        lines.push(`${baseName}_bucket${this.mergeLabelStr(labelStr, `le="${le}"`)} ${count}`);
      }
      lines.push(`${baseName}_bucket${this.mergeLabelStr(labelStr, `le="+Inf"`)} ${sorted.length}`);
      lines.push(`${baseName}_sum${labelStr} ${sorted.reduce((a, b) => a + b, 0)}`);
      lines.push(`${baseName}_count${labelStr} ${sorted.length}`);
    }

    return lines.join("\n") + "\n";
  }

  /** Reset all metrics */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
  }

  private formatLabels(labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return "";
    const pairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`);
    return `{${pairs.join(",")}}`;
  }

  private mergeLabelStr(existing: string, extra: string): string {
    if (!existing) return `{${extra}}`;
    return `{${existing.slice(1, -1)},${extra}}`;
  }
}

/**
 * Built-in Obora metrics names.
 */
export const OBORA_METRICS = {
  EXECUTION_TOTAL: "obora_execution_total",
  EXECUTION_DURATION_SECONDS: "obora_execution_duration_seconds",
  EXECUTION_SUCCESS: "obora_execution_success_total",
  EXECUTION_FAILURE: "obora_execution_failure_total",
  STEP_TOTAL: "obora_step_total",
  STEP_DURATION_SECONDS: "obora_step_duration_seconds",
  REPAIR_TOTAL: "obora_repair_total",
  DLQ_ENTRIES: "obora_dlq_entries",
  ACTIVE_EXECUTIONS: "obora_active_executions",
  CIRCUIT_STATE: "obora_circuit_breaker_state",
  LLM_CALLS_TOTAL: "obora_llm_calls_total",
  LLM_COST_USD: "obora_llm_cost_usd",
} as const;

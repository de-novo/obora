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

    const histogramMetrics: HistogramMetric[] = Array.from(this.histograms.entries()).map(([name, hist]) => {
      const sorted = [...hist.values].sort((a, b) => a - b);
      const buckets: HistogramBucket[] = defaultBuckets.map((le) => ({
        le,
        count: sorted.filter((v) => v <= le).length,
      }));
      buckets.push({ le: Infinity, count: sorted.length });

      return {
        name: name.split("{")[0] ?? "unknown",
        labels: hist.labels,
        buckets,
        sum: sorted.reduce((a, b) => a + b, 0),
        count: sorted.length,
      };
    });

    return {
      counters: [...this.counters.values()],
      gauges: [...this.gauges.values()],
      histograms: histogramMetrics,
      exportedAt: new Date().toISOString(),
    };
  }

  /** Export metrics in Prometheus text format */
  toPrometheus(): string {
    const counterLines = Array.from(this.counters.values()).flatMap((metric) => {
      const labelStr = this.formatLabels(metric.labels);
      return [`# TYPE ${metric.name} counter`, `${metric.name}${labelStr} ${metric.value}`];
    });

    const gaugeLines = Array.from(this.gauges.values()).flatMap((metric) => {
      const labelStr = this.formatLabels(metric.labels);
      return [`# TYPE ${metric.name} gauge`, `${metric.name}${labelStr} ${metric.value}`];
    });

    const defaultBuckets = [0.1, 0.5, 1, 5, 10, 30, 60, 120, 300, 600];
    const histogramLines = Array.from(this.histograms.entries()).flatMap(([name, hist]) => {
      const baseName = name.split("{")[0]!;
      const labelStr = this.formatLabels(hist.labels);
      const sorted = [...hist.values].sort((a, b) => a - b);

      return [
        `# TYPE ${baseName} histogram`,
        ...defaultBuckets.map((le) => {
          const count = sorted.filter((v) => v <= le).length;
          return `${baseName}_bucket${this.mergeLabelStr(labelStr, `le="${le}"`)} ${count}`;
        }),
        `${baseName}_bucket${this.mergeLabelStr(labelStr, `le="+Inf"`)} ${sorted.length}`,
        `${baseName}_sum${labelStr} ${sorted.reduce((a, b) => a + b, 0)}`,
        `${baseName}_count${labelStr} ${sorted.length}`,
      ];
    });

    return [...counterLines, ...gaugeLines, ...histogramLines].join("\n") + "\n";
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

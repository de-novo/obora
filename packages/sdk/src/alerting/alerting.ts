/**
 * Alerting system for critical execution events.
 *
 * Supports webhook, console, and custom alert channels.
 */

export interface Alert {
  id: string;
  timestamp: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  executionId?: string;
  workflowName?: string;
  metadata?: Record<string, unknown>;
}

export interface AlertChannel {
  name: string;
  send(alert: Alert): Promise<void>;
}

export interface AlertingConfig {
  enabled?: boolean;
  channels?: AlertChannel[];
  /** Minimum severity to trigger alerts. Default: "warning" */
  minSeverity?: "info" | "warning" | "critical";
  logger?: { warn?: (message: string, ...args: unknown[]) => void };
}

const SEVERITY_LEVEL: Record<string, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export class AlertManager {
  private readonly channels: AlertChannel[] = [];
  private readonly minSeverity: number;
  private readonly history: Alert[] = [];
  private readonly maxHistorySize = 100;
  private readonly logger?: AlertingConfig["logger"];

  constructor(config: AlertingConfig = {}) {
    this.channels = config.channels ?? [];
    this.minSeverity = SEVERITY_LEVEL[config.minSeverity ?? "warning"] ?? 1;
    this.logger = config.logger;
  }

  addChannel(channel: AlertChannel): void {
    this.channels.push(channel);
  }

  async send(alert: Alert): Promise<void> {
    const level = SEVERITY_LEVEL[alert.severity] ?? 0;
    if (level < this.minSeverity) return;

    this.history.push(alert);
    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }

    const results = await Promise.allSettled(
      this.channels.map((ch) => ch.send(alert)),
    );

    results.forEach((result) => {
      if (result.status === "rejected") {
        this.logger?.warn?.("[alerting] Channel failed:", result.reason);
      }
    });
  }

  getHistory(): Alert[] {
    return [...this.history];
  }
}

/**
 * Webhook alert channel — sends POST to a URL.
 */
export class WebhookAlertChannel implements AlertChannel {
  readonly name = "webhook";

  constructor(
    private readonly url: string,
    private readonly headers?: Record<string, string>,
  ) {}

  async send(alert: Alert): Promise<void> {
    const response = await fetch(this.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(alert),
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  }
}

/**
 * Console alert channel — logs to stdout/stderr.
 */
export class ConsoleAlertChannel implements AlertChannel {
  readonly name = "console";

  async send(alert: Alert): Promise<void> {
    const prefix = alert.severity === "critical" ? "[critical]" : alert.severity === "warning" ? "[warning]" : "[info]";
    const line = `${prefix} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`;
    if (alert.severity === "critical") {
      console.error(line);
    } else {
      console.warn(line);
    }
  }
}

import type { ExecutionEvent, NotificationRule } from '../types.js';
import type { NotificationChannel, NotificationResult } from './channel.js';

export interface WebhookChannelOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

export class WebhookChannel implements NotificationChannel {
  public readonly name = 'webhook';

  private readonly fetchImpl: typeof fetch;

  private readonly timeoutMs: number;

  public constructor(options: WebhookChannelOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async send(event: ExecutionEvent, rule: NotificationRule): Promise<NotificationResult> {
    const url = rule.channel === this.name ? rule.template : rule.channel;
    if (!url) {
      return {
        success: false,
        error: 'Webhook URL is missing in rule.channel or rule.template',
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          event,
          rule,
          timestamp: new Date().toISOString(),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return {
          success: false,
          error: `Webhook request failed with status ${response.status}`,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

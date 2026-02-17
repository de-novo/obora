import { isIP } from 'node:net';

import type { ExecutionEvent, NotificationRule } from '../types.js';
import type { NotificationChannel, NotificationResult } from './channel.js';

export interface WebhookChannelOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5000;

const isBlockedIPv4 = (host: string): boolean => {
  if (host === '127.0.0.1' || host === '0.0.0.0') {
    return true;
  }

  if (host.startsWith('10.')) {
    return true;
  }

  if (host.startsWith('192.168.')) {
    return true;
  }

  if (host.startsWith('169.254.')) {
    return true;
  }

  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const second = octets[1] ?? -1;
    if (octets[0] === 172 && second >= 16 && second <= 31) {
      return true;
    }
  }

  return false;
};

const normalizeIpv6Host = (host: string): string => {
  const noZone = host.split('%')[0] ?? host;
  return noZone.toLowerCase();
};

const isBlockedIPv6 = (host: string): boolean => {
  const normalized = normalizeIpv6Host(host);

  if (normalized === '::1' || normalized === '::' || normalized === '0:0:0:0:0:0:0:1') {
    return true;
  }

  if (normalized.startsWith('::ffff:')) {
    const mapped = normalized.slice('::ffff:'.length);
    if (isBlockedIPv4(mapped)) {
      return true;
    }

    return true;
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  return false;
};

const isBlockedHostname = (host: string): boolean => {
  const normalized = host.toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) {
    return true;
  }

  if (normalized === 'local' || normalized.endsWith('.local')) {
    return true;
  }

  return false;
};

const normalizeHost = (urlString: string): { ok: true; url: string } | { ok: false; error: string } => {
  let parsed: URL;

  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, error: 'Webhook URL is invalid' };
  }

  if (!parsed.hostname || parsed.hostname.trim().length === 0) {
    return { ok: false, error: 'Webhook URL host is required' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Webhook URL protocol must be http or https' };
  }

  const host = parsed.hostname.toLowerCase();
  const normalizedHost = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;

  if (isBlockedHostname(normalizedHost)) {
    return { ok: false, error: 'Webhook URL host is not allowed' };
  }

  const ipVersion = isIP(normalizedHost);
  if (ipVersion === 4 && isBlockedIPv4(normalizedHost)) {
    return { ok: false, error: 'Webhook URL host is not allowed' };
  }

  if (ipVersion === 6 && isBlockedIPv6(normalizedHost)) {
    return { ok: false, error: 'Webhook URL host is not allowed' };
  }

  return { ok: true, url: parsed.toString() };
};

export class WebhookChannel implements NotificationChannel {
  public readonly name = 'webhook';

  private readonly fetchImpl: typeof fetch;

  private readonly timeoutMs: number;

  public constructor(options: WebhookChannelOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async send(event: ExecutionEvent, rule: NotificationRule): Promise<NotificationResult> {
    const rawUrl = rule.channel === this.name ? rule.template : rule.channel;
    if (!rawUrl) {
      return {
        success: false,
        error: 'Webhook URL is missing in rule.channel or rule.template',
      };
    }

    const normalized = normalizeHost(rawUrl);
    if (!normalized.ok) {
      return {
        success: false,
        error: normalized.error,
      };
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(normalized.url, {
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

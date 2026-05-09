import type { ExecutionEvent, NotificationRule } from '../types.js';
import type { NotificationChannel } from './channel.js';

interface LoggerLike {
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface NotificationEngineOptions {
  logger?: LoggerLike;
}

const defaultLogger: LoggerLike = {
  error: (message, meta) => {
    // eslint-disable-next-line no-console
    console.error(message, meta);
  },
};

const includesOrAll = (values: string[] | undefined, target: string | undefined): boolean => {
  if (!values || values.length === 0) {
    return true;
  }

  if (!target) {
    return false;
  }

  return values.includes(target);
};

export class NotificationEngine {
  private readonly rules = new Map<string, NotificationRule>();

  private readonly channels = new Map<string, NotificationChannel>();

  private readonly logger: LoggerLike;

  public constructor(options: NotificationEngineOptions = {}) {
    this.logger = options.logger ?? defaultLogger;
  }

  public addRule(rule: NotificationRule): void {
    this.rules.set(rule.id, rule);
  }

  public removeRule(id: string): boolean {
    return this.rules.delete(id);
  }

  public getRules(): NotificationRule[] {
    return [...this.rules.values()];
  }

  public registerChannel(channel: NotificationChannel): void {
    this.channels.set(channel.name, channel);
  }

  public getChannel(name: string): NotificationChannel | undefined {
    return this.channels.get(name);
  }

  public async processEvent(event: ExecutionEvent): Promise<void> {
    const matchedRules = this.getRules().filter((rule) => this.matches(rule, event));

    await matchedRules.reduce<Promise<void>>(async (previous, rule) => {
      await previous;
      const channel = this.getChannel(rule.channel);
      if (!channel) {
        this.logger.error('DASH_11001 Notification channel not found', {
          code: 'DASH_11001',
          ruleId: rule.id,
          channel: rule.channel,
          eventType: event.type,
        });
        return;
      }

      try {
        const result = await channel.send(event, rule);
        if (!result.success) {
          this.logger.error('DASH_11002 Notification send failed', {
            code: 'DASH_11002',
            ruleId: rule.id,
            channel: rule.channel,
            eventType: event.type,
            error: result.error,
          });
        }
      } catch (error) {
        this.logger.error('DASH_11002 Notification send failed', {
          code: 'DASH_11002',
          ruleId: rule.id,
          channel: rule.channel,
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, Promise.resolve());
  }

  private matches(rule: NotificationRule, event: ExecutionEvent): boolean {
    if (!rule.enabled) {
      return false;
    }

    if (!rule.trigger.eventTypes.includes(event.type)) {
      return false;
    }

    if (!includesOrAll(rule.trigger.severities, event.severity)) {
      return false;
    }

    if (!includesOrAll(rule.trigger.stepNames, event.stepName)) {
      return false;
    }

    return true;
  }
}

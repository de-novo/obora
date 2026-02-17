import type { NotificationChannel } from './channel.js';
import { ConsoleChannel } from './console-channel.js';
import { WebhookChannel, type WebhookChannelOptions } from './webhook-channel.js';

export interface ChannelFactoryConfig {
  webhook?: WebhookChannelOptions;
}

export const createChannel = (type: string, config: ChannelFactoryConfig = {}): NotificationChannel => {
  switch (type) {
    case 'console':
      return new ConsoleChannel();
    case 'webhook':
      return new WebhookChannel(config.webhook);
    default:
      throw new Error(`Unsupported notification channel type: ${type}`);
  }
};

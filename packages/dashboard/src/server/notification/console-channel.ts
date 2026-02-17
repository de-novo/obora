import type { ExecutionEvent, NotificationRule } from '../types.js';
import type { NotificationChannel, NotificationResult } from './channel.js';

const stringifyMessage = (event: ExecutionEvent): string => {
  const payloadMessage =
    typeof event.payload?.message === 'string'
      ? event.payload.message
      : typeof event.payload?.data === 'object' && event.payload?.data !== null
        ? typeof (event.payload.data as Record<string, unknown>).message === 'string'
          ? ((event.payload.data as Record<string, unknown>).message as string)
          : ''
        : '';

  return payloadMessage || 'No message';
};

export class ConsoleChannel implements NotificationChannel {
  public readonly name = 'console';

  public async send(event: ExecutionEvent, _rule: NotificationRule): Promise<NotificationResult> {
    const severity = event.severity ?? 'info';
    const stepName = event.stepName ?? '-';
    const message = stringifyMessage(event);

    // eslint-disable-next-line no-console
    console.log(`[NOTIFICATION] [${severity}] ${event.type} - ${stepName}: ${message}`);

    return { success: true };
  }
}

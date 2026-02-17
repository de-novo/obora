import type { ExecutionEvent, NotificationRule } from '../types.js';

export interface NotificationResult {
  success: boolean;
  error?: string;
}

export interface NotificationChannel {
  name: string;
  send(event: ExecutionEvent, rule: NotificationRule): Promise<NotificationResult>;
}

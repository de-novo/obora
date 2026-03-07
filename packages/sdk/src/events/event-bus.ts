import { randomUUID } from "node:crypto";

import type {
  AuditEvent,
  AuditEventType,
  EventHandler,
  OboraAuditConfig,
  Unsubscribe,
} from "../runtime-types.js";

/**
 * EventBus manages audit event emission and subscription.
 * Handles typed `on(event, handler)` subscriptions and the
 * `events(filter?)` async-iterable stream.
 */
export class EventBus {
  private readonly handlers = new Map<AuditEventType, Set<EventHandler<AuditEventType>>>();
  /** Wildcard handlers consumed by the async-iterator API. */
  readonly anyHandlers = new Set<(event: AuditEvent) => void | Promise<void>>();

  constructor(private readonly auditConfig?: OboraAuditConfig) {}

  on<T extends AuditEventType>(event: T, handler: EventHandler<T>): Unsubscribe {
    const bucket = this.handlers.get(event) ?? new Set<EventHandler<AuditEventType>>();
    const normalizedHandler = handler as EventHandler<AuditEventType>;
    bucket.add(normalizedHandler);
    this.handlers.set(event, bucket);

    return () => {
      const current = this.handlers.get(event);
      if (!current) return;
      current.delete(normalizedHandler);
      if (current.size === 0) {
        this.handlers.delete(event);
      }
    };
  }

  async emit(
    type: AuditEventType,
    executionId: string,
    data: unknown,
    metadata?: AuditEvent["metadata"],
  ): Promise<void> {
    const event: AuditEvent = {
      id: randomUUID(),
      executionId,
      timestamp: new Date(),
      type,
      data,
      ...(metadata ? { metadata } : {}),
    };

    if (this.auditConfig?.enabled !== false) {
      await this.auditConfig?.sink?.(event);
    }

    const handlers = this.handlers.get(type);
    const callbacks = [...(handlers ?? []), ...this.anyHandlers];
    if (callbacks.length === 0) return;

    await Promise.allSettled(
      callbacks.map(async (callback) => {
        await callback(event);
      }),
    );
  }

  events(filter?: {
    executionId?: string;
    type?: AuditEventType | AuditEventType[];
  }): AsyncIterableIterator<AuditEvent> {
    const queue: AuditEvent[] = [];
    let resolve: ((value: IteratorResult<AuditEvent>) => void) | null = null;
    let done = false;

    const handler = (event: AuditEvent) => {
      if (done) return;

      if (filter?.executionId && event.executionId !== filter.executionId) return;

      if (filter?.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(event.type)) return;
      }

      if (resolve) {
        const pending = resolve;
        resolve = null;
        pending({ value: event, done: false });
      } else {
        queue.push(event);
      }
    };

    this.anyHandlers.add(handler);

    const close = () => {
      done = true;
      this.anyHandlers.delete(handler);
      if (resolve) {
        const pending = resolve;
        resolve = null;
        pending({ value: undefined, done: true });
      }
    };

    const iterator: AsyncIterableIterator<AuditEvent> = {
      [Symbol.asyncIterator]() {
        return iterator;
      },
      async next() {
        if (queue.length > 0) {
          return { value: queue.shift()!, done: false };
        }
        if (done) {
          return { value: undefined, done: true };
        }
        return await new Promise<IteratorResult<AuditEvent>>((nextResolve) => {
          resolve = nextResolve;
        });
      },
      async return() {
        close();
        return { value: undefined, done: true };
      },
    };

    return iterator;
  }
}

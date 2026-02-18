import type { AuditEvent } from '@obora/runtime';

import type { AuditQueryParams, AuditQueryResult } from '../types.js';

export interface AuditStore {
  query(params: AuditQueryParams): Promise<AuditQueryResult>;
}

const toDate = (value: string | undefined): Date | undefined => {
  if (!value) {
    return undefined;
  }

  return new Date(value);
};

const normalizeEventTypes = (eventType: string | string[] | undefined): string[] | undefined => {
  if (!eventType) {
    return undefined;
  }

  if (Array.isArray(eventType)) {
    return eventType;
  }

  if (eventType.includes(',')) {
    return eventType
      .split(',')
      .map((type) => type.trim())
      .filter((type) => type.length > 0);
  }

  return [eventType];
};

const getStepName = (event: AuditEvent): string | undefined => {
  const data = event.data;

  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const stepName = (data as Record<string, unknown>).stepName;
  return typeof stepName === 'string' ? stepName : undefined;
};

export class InMemoryAuditStore implements AuditStore {
  private readonly events: AuditEvent[] = [];

  addEvent(event: AuditEvent): void {
    this.events.push(event);
  }

  addEvents(events: AuditEvent[]): void {
    this.events.push(...events);
  }

  async query(params: AuditQueryParams): Promise<AuditQueryResult> {
    const fromTime = toDate(params.fromTime);
    const toTime = toDate(params.toTime);
    const eventTypes = normalizeEventTypes(params.eventType);
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const filtered = this.events
      .filter((event) => {
        if (params.executionId && event.executionId !== params.executionId) {
          return false;
        }

        if (eventTypes && !eventTypes.includes(event.type)) {
          return false;
        }

        if (params.stepName && getStepName(event) !== params.stepName) {
          return false;
        }

        if (fromTime && event.timestamp < fromTime) {
          return false;
        }

        if (toTime && event.timestamp > toTime) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const tsDiff = left.timestamp.getTime() - right.timestamp.getTime();
        if (tsDiff !== 0) {
          return tsDiff;
        }

        return left.id.localeCompare(right.id);
      });

    const total = filtered.length;
    const events = filtered.slice(offset, offset + limit);

    return {
      events,
      total,
      hasMore: offset + events.length < total,
    };
  }

  async getById(eventId: string): Promise<AuditEvent | null> {
    const event = this.events.find((candidate) => candidate.id === eventId);
    return event ?? null;
  }
}

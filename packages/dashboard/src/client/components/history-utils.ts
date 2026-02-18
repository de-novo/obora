import type { StructuredAuditEvent } from '../api/history-client';

export interface AuditReplayFilter {
  category?: StructuredAuditEvent['category'] | 'all';
  actor?: string;
}

export const filterAuditEvents = (
  events: StructuredAuditEvent[],
  filter: AuditReplayFilter,
): StructuredAuditEvent[] => {
  return events.filter((event) => {
    if (filter.category && filter.category !== 'all' && event.category !== filter.category) {
      return false;
    }
    if (filter.actor && filter.actor.length > 0 && event.actor !== filter.actor) {
      return false;
    }
    return true;
  });
};

export const toPrettyJson = (value: unknown): string => JSON.stringify(value ?? {}, null, 2);

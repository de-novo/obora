import type { AuditTrail } from "./AuditTrail.js";
import type { AuditEvent, AuditEventType, AuditFilter } from "./types.js";

function cloneEvent(event: AuditEvent): AuditEvent {
  return {
    ...event,
    timestamp: new Date(event.timestamp),
  };
}

function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const raw = typeof value === "string" ? value : JSON.stringify(value);
  const escaped = raw.replaceAll('"', '""');
  return `"${escaped}"`;
}

export class InMemoryAuditStore implements AuditTrail {
  private events: AuditEvent[] = [];

  async record(event: AuditEvent): Promise<void> {
    this.events.push(cloneEvent(event));
  }

  async query(filter: AuditFilter = {}): Promise<AuditEvent[]> {
    const requestedTypes = Array.isArray(filter.type)
      ? new Set<AuditEventType>(filter.type)
      : filter.type
        ? new Set<AuditEventType>([filter.type])
        : undefined;

    let result = this.events.filter((event) => {
      if (filter.executionId && event.executionId !== filter.executionId) {
        return false;
      }

      if (filter.cellId && event.cellId !== filter.cellId) {
        return false;
      }

      if (requestedTypes && !requestedTypes.has(event.type)) {
        return false;
      }

      if (filter.from && event.timestamp < filter.from) {
        return false;
      }

      if (filter.to && event.timestamp > filter.to) {
        return false;
      }

      return true;
    });

    result = [...result].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (filter.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }

    return result.map(cloneEvent);
  }

  async export(executionId: string, format: "json" | "csv"): Promise<string> {
    const events = await this.query({ executionId });

    if (format === "json") {
      return JSON.stringify(events, null, 2);
    }

    const header = [
      "id",
      "executionId",
      "cellId",
      "timestamp",
      "type",
      "data",
      "metadata",
    ].join(",");

    const rows = events.map((event) =>
      [
        escapeCsv(event.id),
        escapeCsv(event.executionId),
        escapeCsv(event.cellId ?? ""),
        escapeCsv(event.timestamp.toISOString()),
        escapeCsv(event.type),
        escapeCsv(event.data),
        escapeCsv(event.metadata ?? ""),
      ].join(","),
    );

    return [header, ...rows].join("\n");
  }
}

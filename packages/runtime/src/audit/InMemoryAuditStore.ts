import type { AuditTrail, ReplayOptions, ReplayResult } from "./AuditTrail.js";
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

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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

  async replay(options: ReplayOptions): Promise<ReplayResult> {
    const mode = options.mode ?? "event-playback";
    if (mode !== "event-playback") {
      throw new Error(`Replay mode '${mode}' is not supported in M1`);
    }

    const speed = options.speed ?? 1;
    if (!Number.isFinite(speed) || speed <= 0) {
      throw new Error("Replay speed must be a positive finite number");
    }

    const sequence = await this.query({ executionId: options.executionId });
    const startedAt = new Date();

    for (let index = 0; index < sequence.length; index += 1) {
      const current = sequence[index];
      const next = sequence[index + 1];

      if (options.onEvent) {
        await options.onEvent(cloneEvent(current), index);
      }

      if (next) {
        const deltaMs = next.timestamp.getTime() - current.timestamp.getTime();
        if (deltaMs > 0) {
          await sleep(deltaMs / speed);
        }
      }
    }

    const completedAt = new Date();

    return {
      mode: "event-playback",
      executionId: options.executionId,
      totalEvents: sequence.length,
      startedAt,
      completedAt,
      durationMs: completedAt.getTime() - startedAt.getTime(),
      sequence,
    };
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

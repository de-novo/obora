import type { AuditTrail } from "./AuditTrail.js";
import { EventBus } from "./event-bus.js";
import type { AuditEvent, AuditEventType } from "./types.js";

interface EventBusMessage {
  id: string;
  type: string;
  timestamp: Date;
  source: string;
  correlationId?: string;
  payload: unknown;
}

const EVENT_TYPE_MAP: Record<string, AuditEventType> = {
  "task.started": "step_start",
  "task.completed": "step_end",
  "task.failed": "error",
  "state.context.updated": "state_change",
  "state.task.completed": "step_end",
  "state.task.failed": "error",
  "decision.vote.requested": "consensus_vote",
  "decision.consensus.reached": "consensus_result",
  "snapshot.created": "snapshot_create",
  "snapshot.restored": "snapshot_restore",
  "system.error": "error",
};

export class EventBusAdapter {
  private unsubscribe?: () => void;

  constructor(
    private readonly eventBus: EventBus,
    private readonly trail: AuditTrail,
    private readonly fallbackExecutionId: string = "event-bus",
  ) {}

  start(): void {
    this.unsubscribe = this.eventBus.subscribe("*", (event) => {
      void this.handleEvent(event);
    });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  private async handleEvent(event: EventBusMessage): Promise<void> {
    const auditType = EVENT_TYPE_MAP[event.type];

    if (!auditType) {
      return;
    }

    const payload = event.payload as Record<string, unknown>;
    const auditEvent: AuditEvent = {
      id: event.id,
      executionId: event.correlationId ?? this.fallbackExecutionId,
      cellId: typeof payload?.taskId === "string" ? payload.taskId : undefined,
      timestamp: event.timestamp,
      type: auditType,
      data: {
        sourceType: event.type,
        source: event.source,
        payload: event.payload,
      },
    };

    await this.trail.record(auditEvent);
  }
}

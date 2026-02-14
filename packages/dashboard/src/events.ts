import type { RealtimeEvent } from "./types.js";
import { publishRealtimeEvent } from "./ws.js";

export interface AgentCoreEvent {
  kind?: string;
  type?: string;
  [key: string]: unknown;
}

export function toRealtimeEvent(event: AgentCoreEvent): RealtimeEvent {
  const rawType = typeof event.kind === "string" ? event.kind : event.type;
  const type =
    rawType === "artifact" || rawType === "tool" || rawType === "agent" || rawType === "workflow"
      ? rawType
      : "workflow";

  return {
    type,
    payload: event,
    timestamp: new Date().toISOString(),
  };
}

export function publishAgentCoreEvent(event: AgentCoreEvent): void {
  publishRealtimeEvent(toRealtimeEvent(event));
}

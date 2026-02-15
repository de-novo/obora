import type { AuditEvent, AuditFilter } from "./types.js";

export interface AuditTrail {
  record(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
  export(executionId: string, format: "json" | "csv"): Promise<string>;
}

export interface AuditRecorder {
  recordToolCall(
    toolName: string,
    params: unknown,
    result: unknown,
    durationMs: number,
  ): Promise<void>;
  recordStateChange(path: string, oldValue: unknown, newValue: unknown): Promise<void>;
  recordError(code: string, message: string, context?: unknown): Promise<void>;
}

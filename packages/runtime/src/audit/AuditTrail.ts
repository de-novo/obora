import type { AuditEvent, AuditFilter } from "./types.js";

export type ReplayMode = "event-playback" | "re-execution";

export interface ReplayOptions {
  mode?: ReplayMode;
  executionId: string;
  speed?: number;
  onEvent?: (event: AuditEvent, index: number) => void | Promise<void>;
}

export interface ReplayResult {
  mode: "event-playback";
  executionId: string;
  totalEvents: number;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  sequence: AuditEvent[];
}

export interface AuditTrail {
  record(event: AuditEvent): Promise<void>;
  query(filter: AuditFilter): Promise<AuditEvent[]>;
  replay(options: ReplayOptions): Promise<ReplayResult>;
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

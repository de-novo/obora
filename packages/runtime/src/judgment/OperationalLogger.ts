/**
 * OperationalLogger — standardized operational logging for judgment runtime.
 * TASK-M1-28
 *
 * All judgment runtime events are emitted with required fields:
 *   runId, workflow, runState, errorCode, snapshotHash, durationMs
 *
 * Event types:
 *   resolve_success, resolve_fallback, resolve_error,
 *   state_transition, report_generated
 */

import type { RunState, ErrorCode } from './types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OperationalEventType =
  | 'resolve_success'
  | 'resolve_fallback'
  | 'resolve_error'
  | 'state_transition'
  | 'report_generated';

/**
 * Standard operational log entry — every event emitted by the judgment
 * runtime MUST include all of these fields (nullable ones may be null).
 */
export interface OperationalLogEntry {
  /** ISO-8601 timestamp */
  timestamp: string;
  /** Event type */
  event: OperationalEventType;
  /** Unique run identifier */
  runId: string;
  /** Workflow name (e.g. "review", "qa", "release") */
  workflow: string;
  /** Current run state */
  runState: RunState;
  /** Error code if applicable, null otherwise */
  errorCode: ErrorCode | string | null;
  /** Snapshot hash of policy+schema, null if not yet resolved */
  snapshotHash: string | null;
  /** Duration in milliseconds since run start, -1 if unknown */
  durationMs: number;
  /** Optional extra metadata */
  meta?: Record<string, unknown>;
}

export const REQUIRED_LOG_FIELDS: readonly (keyof OperationalLogEntry)[] = [
  'timestamp',
  'event',
  'runId',
  'workflow',
  'runState',
  'errorCode',
  'snapshotHash',
  'durationMs',
] as const;

// ---------------------------------------------------------------------------
// Sink interface
// ---------------------------------------------------------------------------

export interface LogSink {
  write(entry: OperationalLogEntry): void;
}

export const stdoutSink: LogSink = {
  write(entry: OperationalLogEntry) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(entry));
  },
};

// ---------------------------------------------------------------------------
// OperationalLogger
// ---------------------------------------------------------------------------

export interface OperationalLoggerOptions {
  workflow: string;
  sink?: LogSink;
}

export class OperationalLogger {
  private readonly workflow: string;
  private readonly sink: LogSink;
  private runStartMs: number = Date.now();

  constructor(opts: OperationalLoggerOptions) {
    this.workflow = opts.workflow;
    this.sink = opts.sink ?? stdoutSink;
  }

  resetTimer(): void {
    this.runStartMs = Date.now();
  }

  emit(params: {
    event: OperationalEventType;
    runId: string;
    runState: RunState;
    errorCode?: ErrorCode | string | null;
    snapshotHash?: string | null;
    durationMs?: number;
    meta?: Record<string, unknown>;
  }): OperationalLogEntry {
    const entry: OperationalLogEntry = {
      timestamp: new Date().toISOString(),
      event: params.event,
      runId: params.runId,
      workflow: this.workflow,
      runState: params.runState,
      errorCode: params.errorCode ?? null,
      snapshotHash: params.snapshotHash ?? null,
      durationMs: params.durationMs ?? (Date.now() - this.runStartMs),
      ...(params.meta ? { meta: params.meta } : {}),
    };
    this.sink.write(entry);
    return entry;
  }

  resolveSuccess(runId: string, runState: RunState, snapshotHash: string, meta?: Record<string, unknown>) {
    return this.emit({ event: 'resolve_success', runId, runState, snapshotHash, meta });
  }

  resolveFallback(runId: string, runState: RunState, snapshotHash: string, meta?: Record<string, unknown>) {
    return this.emit({ event: 'resolve_fallback', runId, runState, snapshotHash, meta });
  }

  resolveError(runId: string, runState: RunState, errorCode: string, meta?: Record<string, unknown>) {
    return this.emit({ event: 'resolve_error', runId, runState, errorCode, meta });
  }

  stateTransition(runId: string, runState: RunState, from: RunState, to: RunState, reason: string) {
    return this.emit({
      event: 'state_transition',
      runId,
      runState: to,
      meta: { from, to, reason },
    });
  }

  reportGenerated(runId: string, runState: RunState, snapshotHash: string | null, meta?: Record<string, unknown>) {
    return this.emit({ event: 'report_generated', runId, runState, snapshotHash, meta });
  }

  static validateEntry(entry: Record<string, unknown>): string[] {
    const missing: string[] = [];
    for (const field of REQUIRED_LOG_FIELDS) {
      if (!(field in entry) || entry[field] === undefined) {
        missing.push(field);
      }
    }
    return missing;
  }
}

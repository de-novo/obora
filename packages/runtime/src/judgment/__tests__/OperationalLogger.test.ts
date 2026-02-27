/**
 * OperationalLogger tests — TASK-M1-28
 * Validates log field completeness for all event types.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  OperationalLogger,
  REQUIRED_LOG_FIELDS,
  type OperationalLogEntry,
  type LogSink,
} from '../OperationalLogger.js';

function createTestLogger(workflow = 'test-workflow') {
  const entries: OperationalLogEntry[] = [];
  const sink: LogSink = { write(entry) { entries.push(entry); } };
  const logger = new OperationalLogger({ workflow, sink });
  return { logger, entries };
}

describe('OperationalLogger', () => {
  let logger: OperationalLogger;
  let entries: OperationalLogEntry[];

  beforeEach(() => {
    const t = createTestLogger('review');
    logger = t.logger;
    entries = t.entries;
  });

  describe('required field completeness', () => {
    it('resolve_success contains all required fields', () => {
      logger.resolveSuccess('run-1', 'running', 'abc123');
      expect(entries).toHaveLength(1);
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
      expect(entries[0]!.event).toBe('resolve_success');
      expect(entries[0]!.runId).toBe('run-1');
      expect(entries[0]!.workflow).toBe('review');
      expect(entries[0]!.snapshotHash).toBe('abc123');
    });

    it('resolve_fallback contains all required fields', () => {
      logger.resolveFallback('run-2', 'running', 'def456');
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
      expect(entries[0]!.event).toBe('resolve_fallback');
    });

    it('resolve_error contains all required fields with errorCode', () => {
      logger.resolveError('run-3', 'failed', 'RESOLVE_ERROR');
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
      expect(entries[0]!.event).toBe('resolve_error');
      expect(entries[0]!.errorCode).toBe('RESOLVE_ERROR');
    });

    it('state_transition contains all required fields', () => {
      logger.stateTransition('run-4', 'running', 'queued', 'running', 'start');
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
      expect(entries[0]!.event).toBe('state_transition');
      expect(entries[0]!.meta).toEqual({ from: 'queued', to: 'running', reason: 'start' });
    });

    it('report_generated contains all required fields including workflow and runId', () => {
      logger.reportGenerated('run-5', 'done', 'hash789', { format: 'json' });
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
      expect(entries[0]!.event).toBe('report_generated');
      expect(entries[0]!.runId).toBe('run-5');
      expect(entries[0]!.workflow).toBe('review');
    });
  });

  describe('validateEntry', () => {
    it('returns missing fields for incomplete entry', () => {
      const incomplete = { event: 'resolve_success', runId: 'x' } as Record<string, unknown>;
      const missing = OperationalLogger.validateEntry(incomplete);
      expect(missing.length).toBeGreaterThan(0);
      expect(missing).toContain('workflow');
      expect(missing).toContain('runState');
    });

    it('returns empty array for complete entry', () => {
      logger.emit({
        event: 'resolve_success',
        runId: 'test',
        runState: 'done',
        snapshotHash: 'h',
        errorCode: null,
      });
      const missing = OperationalLogger.validateEntry(entries[0] as unknown as Record<string, unknown>);
      expect(missing).toEqual([]);
    });
  });

  describe('durationMs tracking', () => {
    it('includes non-negative durationMs', () => {
      logger.resolveSuccess('run-d', 'running', 'hash');
      expect(entries[0]!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('allows explicit durationMs override', () => {
      logger.emit({
        event: 'state_transition',
        runId: 'run-o',
        runState: 'done',
        durationMs: 1234,
      });
      expect(entries[0]!.durationMs).toBe(1234);
    });
  });

  describe('REQUIRED_LOG_FIELDS constant', () => {
    it('contains exactly 8 required fields', () => {
      expect(REQUIRED_LOG_FIELDS).toHaveLength(8);
      expect(REQUIRED_LOG_FIELDS).toContain('runId');
      expect(REQUIRED_LOG_FIELDS).toContain('workflow');
      expect(REQUIRED_LOG_FIELDS).toContain('runState');
      expect(REQUIRED_LOG_FIELDS).toContain('errorCode');
      expect(REQUIRED_LOG_FIELDS).toContain('snapshotHash');
      expect(REQUIRED_LOG_FIELDS).toContain('durationMs');
    });
  });
});

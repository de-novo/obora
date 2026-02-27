import { describe, it, expect, vi } from 'vitest';
import {
  JudgmentPolicyResolver,
  computeSnapshotHash,
  canonicalJson,
  type PolicyStore,
  type ResolveInput,
  type StructuredLogger,
  type ResolveLogEntry,
} from '../JudgmentPolicy.js';

function mapStore(data: Record<string, object>): PolicyStore {
  return { get: (ref) => data[ref] };
}

const baseInput: ResolveInput = {
  policyRef: 'policy-v1',
  schemaRef: 'schema-v1',
  runId: 'run-1',
  engineVersion: '1.0.0',
};

const policy = { threshold: 80, rules: ['a', 'b'] };
const schema = { type: 'object', props: { score: 'number' } };

// ---------------------------------------------------------------------------
// Fix #3: Structured log capture helper
// ---------------------------------------------------------------------------
function captureLogger(): { logs: ResolveLogEntry[]; logger: StructuredLogger } {
  const logs: ResolveLogEntry[] = [];
  return { logs, logger: { log: (e) => logs.push(e) } };
}

describe('JudgmentPolicyResolver', () => {
  it('resolves from memory store first', () => {
    const { logs, logger } = captureLogger();
    const resolver = new JudgmentPolicyResolver(
      mapStore({ 'policy-v1': policy, 'schema-v1': schema }),
      mapStore({}),
      logger,
    );
    const result = resolver.resolve(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('memory');
      expect(result.value.policy).toEqual(policy);
      expect(result.value.schema).toEqual(schema);
      expect(result.value.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    }
    // Fix #3: verify structured log
    expect(logs).toHaveLength(1);
    expect(logs[0]!.event).toBe('resolve_success');
    expect(logs[0]!.source).toBe('memory');
    expect(logs[0]!.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('falls back to local store', () => {
    const { logs, logger } = captureLogger();
    const resolver = new JudgmentPolicyResolver(
      mapStore({}),
      mapStore({ 'policy-v1': policy, 'schema-v1': schema }),
      logger,
    );
    const result = resolver.resolve(baseInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.source).toBe('local');
    }
    // Fix #3: verify fallback log
    expect(logs).toHaveLength(1);
    expect(logs[0]!.event).toBe('resolve_fallback');
    expect(logs[0]!.source).toBe('local');
  });

  it('returns RESOLVE_ERROR when both stores miss', () => {
    const { logs, logger } = captureLogger();
    const resolver = new JudgmentPolicyResolver(mapStore({}), mapStore({}), logger);
    const result = resolver.resolve(baseInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.errorCode).toBe('RESOLVE_ERROR');
    }
    // Fix #3: verify error log with errorCode
    expect(logs).toHaveLength(1);
    expect(logs[0]!.event).toBe('resolve_error');
    expect(logs[0]!.errorCode).toBe('RESOLVE_ERROR');
  });

  it('returns RESOLVE_ERROR when only policy found in memory', () => {
    const resolver = new JudgmentPolicyResolver(
      mapStore({ 'policy-v1': policy }),
      mapStore({}),
    );
    const result = resolver.resolve(baseInput);
    expect(result.ok).toBe(false);
  });

  // Fix #5: Cross-store resolve behavior — no mixing
  describe('cross-store fallback semantics', () => {
    it('does NOT mix: memory-policy + local-schema -> falls to local for both', () => {
      const { logs, logger } = captureLogger();
      // Memory has policy only; local has both
      const resolver = new JudgmentPolicyResolver(
        mapStore({ 'policy-v1': policy }),
        mapStore({ 'policy-v1': policy, 'schema-v1': schema }),
        logger,
      );
      const result = resolver.resolve(baseInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe('local');
      }
      expect(logs[0]!.event).toBe('resolve_fallback');
    });

    it('does NOT mix: memory-schema + local-policy -> falls to local for both', () => {
      const resolver = new JudgmentPolicyResolver(
        mapStore({ 'schema-v1': schema }),
        mapStore({ 'policy-v1': policy, 'schema-v1': schema }),
      );
      const result = resolver.resolve(baseInput);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.source).toBe('local');
      }
    });

    it('errors when memory has policy only and local has schema only (no cross-mix)', () => {
      const resolver = new JudgmentPolicyResolver(
        mapStore({ 'policy-v1': policy }),
        mapStore({ 'schema-v1': schema }),
      );
      const result = resolver.resolve(baseInput);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.errorCode).toBe('RESOLVE_ERROR');
      }
    });
  });
});

describe('canonicalJson', () => {
  it('sorts keys recursively', () => {
    const obj = { z: 1, a: { c: 3, b: 2 } };
    expect(canonicalJson(obj)).toBe('{"a":{"b":2,"c":3},"z":1}');
  });

  it('preserves array order', () => {
    expect(canonicalJson([3, 1, 2])).toBe('[3,1,2]');
  });

  it('normalizes 1.0 and 1 to same canonical form', () => {
    expect(canonicalJson({ x: 1.0 })).toBe(canonicalJson({ x: 1 }));
  });

  it('applies NFC normalization to strings', () => {
    const nfd = 'e\u0301';
    const nfc = '\u00e9';
    expect(canonicalJson(nfd)).toBe(canonicalJson(nfc));
  });
});

describe('computeSnapshotHash', () => {
  it('returns identical hash for identical inputs (3 runs)', () => {
    const hashes = Array.from({ length: 3 }, () =>
      computeSnapshotHash('p1', 's1', policy, schema, '1.0.0'),
    );
    expect(hashes[0]).toBe(hashes[1]);
    expect(hashes[1]).toBe(hashes[2]);
  });

  it('produces different hash when policy changes', () => {
    const h1 = computeSnapshotHash('p1', 's1', { threshold: 80 }, schema, '1.0.0');
    const h2 = computeSnapshotHash('p1', 's1', { threshold: 90 }, schema, '1.0.0');
    expect(h1).not.toBe(h2);
  });

  it('is independent of object key insertion order', () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    const h1 = computeSnapshotHash('p', 's', a, schema, '1.0');
    const h2 = computeSnapshotHash('p', 's', b, schema, '1.0');
    expect(h1).toBe(h2);
  });
});

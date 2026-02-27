import { describe, it, expect } from 'vitest';
import { JudgmentNormalizer, parseReceivedAt, type NormalizeInput } from '../JudgmentNormalizer.js';

const norm = new JudgmentNormalizer();

describe('JudgmentNormalizer.normalize', () => {
  const base: NormalizeInput = { rawModelOutput: '', attempt: 1, ingestSeq: 1 };

  it('returns VALIDATION_ERROR when status is missing', () => {
    const out = norm.normalize({ ...base, rawModelOutput: { score: 50 } });
    expect(out.judgmentStatus).toBe('fail');
    expect(out.score).toBe(0);
    expect(out.errorCode).toBe('VALIDATION_ERROR');
    expect(out.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('returns VALIDATION_ERROR when status is invalid string', () => {
    const out = norm.normalize({ ...base, rawModelOutput: { judgmentStatus: 'PASS', score: 80 } });
    expect(out.errorCode).toBe('VALIDATION_ERROR');
  });

  it('returns MALFORMED_JSON for unparseable string', () => {
    const out = norm.normalize({ ...base, rawModelOutput: '{bad json' });
    expect(out.errorCode).toBe('MALFORMED_JSON');
    expect(out.judgmentStatus).toBe('fail');
    expect(out.score).toBe(0);
    expect(out.issues.length).toBeGreaterThanOrEqual(1);
  });

  it('returns MALFORMED_JSON for null input', () => {
    const out = norm.normalize({ ...base, rawModelOutput: null });
    expect(out.errorCode).toBe('MALFORMED_JSON');
  });

  it('returns MALFORMED_JSON for number input', () => {
    const out = norm.normalize({ ...base, rawModelOutput: 42 });
    expect(out.errorCode).toBe('MALFORMED_JSON');
  });

  it('returns MALFORMED_JSON for boolean input', () => {
    const out = norm.normalize({ ...base, rawModelOutput: true });
    expect(out.errorCode).toBe('MALFORMED_JSON');
  });

  it('auto-fails when status is absent', () => {
    const out = norm.normalize({ ...base, rawModelOutput: '{"score":50}' });
    expect(out.judgmentStatus).toBe('fail');
    expect(out.errorCode).toBe('VALIDATION_ERROR');
  });

  it('normalizes valid pass output', () => {
    const out = norm.normalize({
      ...base,
      rawModelOutput: { judgmentStatus: 'pass', score: 85.123, issues: [] },
    });
    expect(out.judgmentStatus).toBe('pass');
    expect(out.score).toBe(85.12);
    expect(out.errorCode).toBeUndefined();
  });

  it('normalizes valid string input', () => {
    const out = norm.normalize({
      ...base,
      rawModelOutput: JSON.stringify({ judgmentStatus: 'fail', score: 30, issues: [{ level: 'P0', message: 'bad' }] }),
    });
    expect(out.judgmentStatus).toBe('fail');
    expect(out.score).toBe(30);
    expect(out.issues).toEqual([{ level: 'P0', message: 'bad' }]);
  });

  describe('score boundaries', () => {
    const make = (score: number) => ({ judgmentStatus: 'pass' as const, score, issues: [] });

    it('clamps -1 to 0', () => {
      const out = norm.normalize({ ...base, rawModelOutput: make(-1) });
      expect(out.score).toBe(0);
    });

    it('keeps 0 as 0', () => {
      const out = norm.normalize({ ...base, rawModelOutput: make(0) });
      expect(out.score).toBe(0);
    });

    it('rounds 99.995 with half-up to 100', () => {
      const out = norm.normalize({ ...base, rawModelOutput: make(99.995) });
      expect(out.score).toBe(100);
    });

    it('keeps 100 as 100', () => {
      const out = norm.normalize({ ...base, rawModelOutput: make(100) });
      expect(out.score).toBe(100);
    });

    it('clamps 101 to 100', () => {
      const out = norm.normalize({ ...base, rawModelOutput: make(101) });
      expect(out.score).toBe(100);
    });
  });
});

// ---------------------------------------------------------------------------
// Fix #1 & #2: Strict receivedAt parsing (UTC Z only)
// ---------------------------------------------------------------------------
describe('parseReceivedAt — strict UTC Z', () => {
  it('accepts valid UTC Z format', () => {
    expect(parseReceivedAt('2026-01-01T00:00:00Z')).toBe(new Date('2026-01-01T00:00:00Z').getTime());
  });

  it('accepts UTC Z with milliseconds', () => {
    expect(parseReceivedAt('2026-01-01T12:30:45.123Z')).toBe(new Date('2026-01-01T12:30:45.123Z').getTime());
  });

  it('rejects date-only format (no time, no Z)', () => {
    expect(parseReceivedAt('2026-01-01')).toBe(-Infinity);
  });

  it('rejects positive UTC offset', () => {
    expect(parseReceivedAt('2026-01-01T00:00:00+09:00')).toBe(-Infinity);
  });

  it('rejects negative UTC offset', () => {
    expect(parseReceivedAt('2026-01-01T00:00:00-05:00')).toBe(-Infinity);
  });

  it('rejects +00:00 offset (must be Z)', () => {
    expect(parseReceivedAt('2026-01-01T00:00:00+00:00')).toBe(-Infinity);
  });

  it('rejects local time without timezone', () => {
    expect(parseReceivedAt('2026-01-01T00:00:00')).toBe(-Infinity);
  });

  it('returns -Infinity for undefined', () => {
    expect(parseReceivedAt(undefined)).toBe(-Infinity);
  });

  it('returns -Infinity for garbage', () => {
    expect(parseReceivedAt('not-a-date')).toBe(-Infinity);
  });

  it('returns -Infinity for empty string', () => {
    expect(parseReceivedAt('')).toBe(-Infinity);
  });
});

describe('JudgmentNormalizer.selectLatest', () => {
  const make = (attempt: number, receivedAt: string | undefined, ingestSeq: number): NormalizeInput => ({
    rawModelOutput: { judgmentStatus: 'pass', score: 50 },
    attempt,
    receivedAt,
    ingestSeq,
  });

  it('picks higher attempt first', () => {
    const a = make(1, '2026-01-01T00:00:00Z', 10);
    const b = make(2, '2025-01-01T00:00:00Z', 1);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  it('uses receivedAt when attempt is equal', () => {
    const a = make(1, '2026-01-01T00:00:00Z', 1);
    const b = make(1, '2026-02-01T00:00:00Z', 1);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  it('falls back to ingestSeq when attempt and receivedAt are equal', () => {
    const a = make(1, '2026-01-01T00:00:00Z', 5);
    const b = make(1, '2026-01-01T00:00:00Z', 10);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  it('treats invalid receivedAt as -Infinity', () => {
    const a = make(1, 'not-a-date', 1);
    const b = make(1, '2026-01-01T00:00:00Z', 1);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  // Fix #2: offset receivedAt now treated as -Infinity (strict Z)
  it('treats offset receivedAt as -Infinity under strict Z parsing', () => {
    const a = make(1, '2026-01-01T00:00:00+09:00', 1);
    const b = make(1, '2026-01-01T00:00:00Z', 1);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  it('falls to ingestSeq when both receivedAt are invalid', () => {
    const a = make(1, 'bad', 10);
    const b = make(1, 'also-bad', 5);
    expect(norm.selectLatest([a, b])).toBe(a);
  });

  it('falls to ingestSeq when both receivedAt are missing', () => {
    const a = make(1, undefined, 3);
    const b = make(1, undefined, 7);
    expect(norm.selectLatest([a, b])).toBe(b);
  });

  it('throws on empty array', () => {
    expect(() => norm.selectLatest([])).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Fix #4: Performance evidence — normalize p95 < 10ms
// ---------------------------------------------------------------------------
describe('normalize performance', () => {
  it('p95 of 1000 normalize calls < 10ms', () => {
    const inputs: NormalizeInput[] = Array.from({ length: 1000 }, (_, i) => ({
      rawModelOutput: { judgmentStatus: i % 2 === 0 ? 'pass' : 'fail', score: i % 101, issues: [{ level: 'P0', message: `issue-${i}` }] },
      attempt: 1,
      ingestSeq: i,
      receivedAt: '2026-01-01T00:00:00Z',
    }));

    const durations: number[] = [];
    for (const input of inputs) {
      const start = performance.now();
      norm.normalize(input);
      durations.push(performance.now() - start);
    }

    durations.sort((a, b) => a - b);
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    // p95 should be well under 10ms for a pure-JS normalizer
    expect(p95).toBeLessThan(10);
  });
});

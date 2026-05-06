import { describe, expect, it } from 'vitest';

import { filterAuditEvents, toPrettyJson } from '../components/history-utils';

describe('history utils', () => {
  const events = [
    {
      id: '1',
      runId: 'r1',
      stepName: 's1',
      timestamp: '2026-02-18T00:00:00.000Z',
      category: 'execution' as const,
      action: 'step_start',
      actor: 'system',
      detail: { ok: true },
    },
    {
      id: '2',
      runId: 'r1',
      stepName: 's1',
      timestamp: '2026-02-18T00:00:01.000Z',
      category: 'policy' as const,
      action: 'policy_check',
      actor: 'policy-engine',
      detail: { pass: true },
    },
  ];

  it('filters by category and actor', () => {
    expect(filterAuditEvents(events, {})).toHaveLength(2);
    expect(filterAuditEvents(events, { category: 'policy' })).toHaveLength(1);
    expect(filterAuditEvents(events, { category: 'all', actor: 'system' })).toHaveLength(1);
    expect(filterAuditEvents(events, { actor: 'none' })).toHaveLength(0);
  });

  it('formats json text', () => {
    const text = toPrettyJson({ a: 1 });
    expect(text).toContain('"a": 1');
    expect(toPrettyJson(undefined)).toBe('{}');
  });
});

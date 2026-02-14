import { describe, expect, it } from 'vitest';

import { evaluateConsensus } from '../../../src/domains/consensus';

describe('consensus rule engine', () => {
  it('supermajority 규칙으로 승인 판정을 계산합니다', () => {
    const result = evaluateConsensus(
      {
        sessionId: 'session-1',
        policy: 'majority',
        tally: {
          sessionId: 'session-1',
          totalVotes: 5,
          approves: 4,
          rejects: 1,
          abstains: 0,
          passed: true,
          quorumMet: true,
        },
      },
      {
        method: 'supermajority',
      },
    );

    expect(result.status).toBe('APPROVED');
    expect(result.approved).toBe(true);
  });

  it('조건부 코드가 있으면 CONDITIONAL 상태를 반환합니다', () => {
    const result = evaluateConsensus(
      {
        sessionId: 'session-2',
        policy: 'majority',
        tally: {
          sessionId: 'session-2',
          totalVotes: 3,
          approves: 2,
          rejects: 1,
          abstains: 0,
          passed: true,
          quorumMet: true,
        },
      },
      {
        conditionalCodes: ['follow-up-required'],
      },
    );

    expect(result.status).toBe('CONDITIONAL');
    expect(result.conditions?.[0]?.code).toBe('follow-up-required');
  });

  it('에스컬레이션 메타가 있으면 ESCALATED 상태를 반환합니다', () => {
    const result = evaluateConsensus(
      {
        sessionId: 'session-3',
        policy: 'majority',
        tally: {
          sessionId: 'session-3',
          totalVotes: 3,
          approves: 1,
          rejects: 2,
          abstains: 0,
          passed: false,
          quorumMet: true,
        },
      },
      {
        escalation: {
          reason: 'requires-executive-review',
          requiredRoles: ['director'],
        },
      },
    );

    expect(result.status).toBe('ESCALATED');
    expect(result.escalation?.requiredRoles).toContain('director');
  });
});

import { describe, expect, it } from 'vitest';

import { isConsensusResult } from '../../../src/domains/consensus';

describe('consensus types', () => {
  it('유효한 ConsensusResult를 통과시킵니다', () => {
    const input = {
      sessionId: 'session-1',
      status: 'APPROVED',
      approved: true,
      summary: 'majority approved',
      snapshot: {
        sessionId: 'session-1',
        policy: 'majority',
        tally: {
          sessionId: 'session-1',
          totalVotes: 3,
          approves: 2,
          rejects: 1,
          abstains: 0,
          passed: true,
          quorumMet: true,
        },
      },
    };

    expect(isConsensusResult(input)).toBe(true);
  });

  it('필수 필드가 없으면 실패합니다', () => {
    const input = {
      status: 'APPROVED',
      approved: true,
      summary: 'missing sessionId',
      snapshot: {
        sessionId: 'session-1',
        policy: 'majority',
        tally: {
          sessionId: 'session-1',
          totalVotes: 1,
          approves: 1,
          rejects: 0,
          abstains: 0,
          passed: true,
          quorumMet: true,
        },
      },
    };

    expect(isConsensusResult(input)).toBe(false);
  });
});

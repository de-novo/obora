import { describe, expect, it } from 'vitest';
import { runMeeting } from '../src';

describe('board package integration', () => {
  it('supports all policies via blackboard consensus engine', async () => {
    const policies: Array<'majority' | 'unanimous' | 'weighted' | 'supermajority'> = [
      'majority',
      'unanimous',
      'weighted',
      'supermajority',
    ];

    for (const policy of policies) {
      const result = await runMeeting({
        agendas: [{ id: `ag-${policy}`, title: policy }],
        votingPolicy: policy,
        votesByAgendaId: {
          [`ag-${policy}`]: [
            { voterId: 'a1', option: 'approve', weight: 2 },
            { voterId: 'a2', option: 'approve', weight: 1 },
          ],
        },
      });

      expect(result.consensusResults[0]).toBeDefined();
      expect(result.snapshots[0]?.sessionId).toBeTruthy();
    }
  });
});

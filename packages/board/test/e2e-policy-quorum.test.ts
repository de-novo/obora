import { describe, expect, it } from 'vitest';
import { BoardFacade, runMeeting } from '../src';

describe('E2E: multi-policy cross scenarios', () => {
  it('deterministic results when policies A/B/C conflict on same votes', async () => {
    // Same votes evaluated under majority, unanimous, weighted → each gives deterministic result
    const votes = [
      { voterId: 'a1', option: 'approve' as const, weight: 5 },
      { voterId: 'a2', option: 'approve' as const, weight: 1 },
      { voterId: 'a3', option: 'reject' as const, weight: 10 },
    ];

    const policies = ['majority', 'unanimous', 'weighted', 'supermajority'] as const;
    const results: Record<string, boolean> = {};

    for (const policy of policies) {
      const result = await runMeeting({
        agendas: [{ id: `cross-${policy}`, title: `Cross ${policy}` }],
        votingPolicy: policy,
        supermajorityThreshold: 0.66,
        votesByAgendaId: { [`cross-${policy}`]: votes },
      });
      results[policy] = result.consensusResults[0]!.approved;
    }

    // majority: 2 approve vs 1 reject → approved
    expect(results['majority']).toBe(true);
    // unanimous: 1 reject → rejected
    expect(results['unanimous']).toBe(false);
    // weighted: approve=6 vs reject=10 → rejected
    expect(results['weighted']).toBe(false);
    // supermajority: 2/3 ≈ 0.667 >= 0.66 → approved
    expect(results['supermajority']).toBe(true);

    // Repeat to verify determinism
    for (const policy of policies) {
      const result2 = await runMeeting({
        agendas: [{ id: `cross2-${policy}`, title: `Cross2 ${policy}` }],
        votingPolicy: policy,
        supermajorityThreshold: 0.66,
        votesByAgendaId: { [`cross2-${policy}`]: votes },
      });
      expect(result2.consensusResults[0]!.approved).toBe(results[policy]);
    }
  });

  it('idempotency: identical input produces identical output', async () => {
    const opts = {
      agendas: [{ id: 'idem-1', title: 'Idem' }],
      votingPolicy: 'majority' as const,
      votesByAgendaId: {
        'idem-1': [
          { voterId: 'a1', option: 'approve' as const },
          { voterId: 'a2', option: 'reject' as const },
          { voterId: 'a3', option: 'approve' as const },
        ],
      },
    };

    const r1 = await runMeeting(opts);
    const r2 = await runMeeting(opts);

    expect(r1.consensusResults[0]!.approved).toBe(r2.consensusResults[0]!.approved);
    expect(r1.consensusResults[0]!.status).toBe(r2.consensusResults[0]!.status);
    expect(r1.finalState).toBe(r2.finalState);
    expect(r1.snapshots[0]!.tally.approves).toBe(r2.snapshots[0]!.tally.approves);
    expect(r1.snapshots[0]!.tally.rejects).toBe(r2.snapshots[0]!.tally.rejects);
  });

  it('multi-agenda with mixed policies per agenda via facade', () => {
    const facade = new BoardFacade();

    // Agenda 1: majority (should pass)
    facade.createAgenda({ id: 'mix-1', title: 'Majority agenda' });
    const s1 = facade.startVoting('mix-1', 'majority', 1);
    facade.recordVote(s1.id, { voterId: 'v1', option: 'approve' });
    facade.recordVote(s1.id, { voterId: 'v2', option: 'reject' });
    facade.recordVote(s1.id, { voterId: 'v3', option: 'approve' });
    facade.closeVoting(s1.id);
    const c1 = facade.computeConsensus(s1.id, 'majority');

    // Agenda 2: unanimous (should fail due to reject)
    facade.createAgenda({ id: 'mix-2', title: 'Unanimous agenda' });
    const s2 = facade.startVoting('mix-2', 'unanimous', 1);
    facade.recordVote(s2.id, { voterId: 'v1', option: 'approve' });
    facade.recordVote(s2.id, { voterId: 'v2', option: 'reject' });
    facade.closeVoting(s2.id);
    const c2 = facade.computeConsensus(s2.id, 'unanimous');

    expect(c1?.approved).toBe(true);
    expect(c1?.status).toBe('APPROVED');
    expect(c2?.approved).toBe(false);
    expect(c2?.status).toBe('REJECTED');
  });
});

describe('E2E: quorum edge cases', () => {
  it('quorum not met → consensus rejected regardless of votes', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'q-fail', title: 'Quorum fail' }],
      quorum: 5,
      votingPolicy: 'majority',
      votesByAgendaId: {
        'q-fail': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
        ],
      },
    });

    // Only 2 votes, quorum requires 5
    expect(result.consensusResults[0]!.approved).toBe(false);
    expect(result.consensusResults[0]!.status).toBe('REJECTED');
    expect(result.snapshots[0]!.tally.quorumMet).toBe(false);
  });

  it('quorum exactly met → consensus proceeds normally', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'q-exact', title: 'Quorum exact' }],
      quorum: 3,
      votingPolicy: 'majority',
      votesByAgendaId: {
        'q-exact': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'reject' },
        ],
      },
    });

    // Exactly 3 votes, quorum = 3 → met
    expect(result.snapshots[0]!.tally.quorumMet).toBe(true);
    expect(result.consensusResults[0]!.approved).toBe(true);
  });

  it('quorum off by one (N-1 votes for quorum N) → rejected', async () => {
    const result = await runMeeting({
      agendas: [{ id: 'q-off1', title: 'Quorum off-by-one' }],
      quorum: 4,
      votingPolicy: 'majority',
      votesByAgendaId: {
        'q-off1': [
          { voterId: 'a1', option: 'approve' },
          { voterId: 'a2', option: 'approve' },
          { voterId: 'a3', option: 'approve' },
        ],
      },
    });

    // 3 votes, quorum = 4 → not met
    expect(result.snapshots[0]!.tally.quorumMet).toBe(false);
    expect(result.consensusResults[0]!.approved).toBe(false);
    expect(result.consensusResults[0]!.status).toBe('REJECTED');
  });

  it('quorum not met preserves state as resolved (no error thrown)', async () => {
    // Even when quorum fails, the meeting still completes (state machine reaches resolved)
    const result = await runMeeting({
      agendas: [{ id: 'q-state', title: 'Quorum state check' }],
      quorum: 10,
      votingPolicy: 'unanimous',
      votesByAgendaId: {
        'q-state': [
          { voterId: 'a1', option: 'approve' },
        ],
      },
    });

    // State machine still transitions to resolved
    expect(result.finalState).toBe('resolved');
    // But consensus is rejected
    expect(result.consensusResults[0]!.approved).toBe(false);
    expect(result.snapshots[0]!.tally.quorumMet).toBe(false);
  });

  it('quorum not met with all approve under every policy → still rejected', async () => {
    const policies = ['majority', 'unanimous', 'weighted', 'supermajority'] as const;

    for (const policy of policies) {
      const result = await runMeeting({
        agendas: [{ id: `q-all-${policy}`, title: `Quorum block ${policy}` }],
        quorum: 5,
        votingPolicy: policy,
        votesByAgendaId: {
          [`q-all-${policy}`]: [
            { voterId: 'a1', option: 'approve', weight: 100 },
            { voterId: 'a2', option: 'approve', weight: 100 },
          ],
        },
      });

      expect(result.snapshots[0]!.tally.quorumMet).toBe(false);
      expect(result.consensusResults[0]!.approved).toBe(false);
    }
  });

  it('facade: quorum boundary - exactly met via BoardFacade', () => {
    const facade = new BoardFacade();
    facade.createAgenda({ id: 'fq', title: 'Facade quorum' });

    const session = facade.startVoting('fq', 'majority', 2);
    facade.recordVote(session.id, { voterId: 'v1', option: 'approve' });
    facade.recordVote(session.id, { voterId: 'v2', option: 'approve' });
    facade.closeVoting(session.id);

    const consensus = facade.computeConsensus(session.id, 'majority');
    expect(consensus?.approved).toBe(true);
  });
});
